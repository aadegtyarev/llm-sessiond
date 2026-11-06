import type { ControlResult, HarnessControlResult, ModelChoice, NativeModel, SessionSettings } from './types.ts';
import { object, type RecordValue, createPiWire } from './pi-wire.ts';
import { modelSnapshot } from './session-settings.ts';
import { RELOAD_DESCRIPTION } from './pi-reload-extension.ts';
import { reloadExtensionPath } from './pi-process.ts';

type Wire = ReturnType<typeof createPiWire>;
type State = { state: RecordValue; settings: SessionSettings };
interface OwnedControls {
  wire: Wire;
  readonly ready: boolean;
  readonly idle: boolean;
  readonly questionsAdmissible: boolean;
  readonly questionsQuiescent: boolean;
  questionBarrier(): () => void;
  identity(): RecordValue;
  uncertain(): void;
  lostOwnership(): void;
}

/** Exclusive native command/readback window; lifecycle remains Core-owned. */
export function createPiControls(owned: OwnedControls, reloadCommand: string) {
  let busy = false;
  let dispatched = false;
  let observedError = false;
  let activity = 0;
  let initialActivity = 0;
  let ownershipLost = false;
  function event(record: RecordValue) {
    if (busy && record.type === 'extension_error') observedError = true;
    if (['agent_start', 'auto_compaction_start'].includes(String(record.type))
      || (record.type === 'extension_ui_request' && ['confirm', 'select', 'input', 'editor'].includes(String(record.method)))) activity++;
  }
  async function reserve<T>(effectful: boolean, action: () => Promise<ControlResult<T>>): Promise<HarnessControlResult<T>> {
    if (busy) return { kind: 'rejected' };
    if (ownershipLost) return { kind: 'unknown', ownershipLost: true };
    if (!owned.ready || owned.wire.broken) return { kind: 'unknown' };
    if (effectful && (!owned.idle || !owned.questionsAdmissible)) return { kind: 'rejected' };
    busy = true; dispatched = false; observedError = false;
    const beforeActivity = activity;
    initialActivity = activity;
    try {
      let result: ControlResult<T>;
      try { result = await action(); } catch { result = { kind: 'unknown' }; }
      if (ownershipLost) return { kind: 'unknown', ownershipLost: true };
      if (dispatched && (result.kind !== 'confirmed' || observedError || beforeActivity !== activity
        || !owned.ready || owned.wire.broken || !owned.idle || !owned.questionsQuiescent)) {
        owned.uncertain();
        return { kind: 'unknown', effectUncertain: true };
      }
      return result;
    } finally { busy = false; dispatched = false; }
  }
  async function catalogue(): Promise<readonly NativeModel[] | null> {
    const response = await owned.wire.command('get_available_models');
    const models = object(response?.data).models;
    if (response?.success !== true || !Array.isArray(models)) return null;
    const copies = models.map(modelSnapshot);
    if (copies.some(model => model === null)) return null;
    return Object.freeze(copies as NativeModel[]);
  }
  function sameIdentity(state: RecordValue): boolean {
    const identity = owned.identity();
    return state.sessionId === identity.sessionId && state.sessionFile === identity.sessionFile;
  }
  function nativeIdle(state: RecordValue): boolean {
    return state.isStreaming === false && state.isCompacting === false && state.pendingMessageCount === 0 && owned.idle;
  }
  function quiescent(state: RecordValue): boolean {
    return nativeIdle(state) && owned.questionsQuiescent;
  }
  async function read(): Promise<State | null> {
    const settleWrittenQuestions = owned.questionBarrier();
    const response = await owned.wire.command('get_state', {}, record => {
      const state = object(record.data), identity = owned.identity();
      if (record.success === true && ((typeof state.sessionId === 'string' && state.sessionId !== identity.sessionId)
        || (typeof state.sessionFile === 'string' && state.sessionFile !== identity.sessionFile))) {
        ownershipLost = true;
        owned.lostOwnership(); // Synchronous ACK fence precedes following records in this stdout chunk.
      }
    });
    const state = object(response?.data);
    if (response?.success !== true || !sameIdentity(state) || typeof state.thinkingLevel !== 'string') return null;
    if (nativeIdle(state) && owned.questionsAdmissible) settleWrittenQuestions();
    const model = state.model == null ? null : modelSnapshot(state.model);
    if (state.model != null && !model) return null;
    const capabilities = await owned.wire.command('get_available_thinking_levels');
    const levels = object(capabilities?.data).levels;
    if (capabilities?.success !== true || !Array.isArray(levels) || !levels.length
      || levels.some(level => typeof level !== 'string' || !level)
      || !levels.includes(state.thinkingLevel)) return null;
    return { state, settings: Object.freeze({ model, thinkingLevel: state.thinkingLevel,
      availableThinkingLevels: Object.freeze([...levels] as string[]) }) };
  }
  function models(): Promise<ControlResult<readonly NativeModel[]>> {
    return reserve<readonly NativeModel[]>(false, async () => {
      const value = await catalogue();
      return value ? { kind: 'confirmed', value } : { kind: 'unknown' };
    });
  }
  function settings(): Promise<ControlResult<SessionSettings>> {
    return reserve<SessionSettings>(false, async () => {
      const value = await read();
      return value ? { kind: 'confirmed', value: value.settings } : { kind: 'unknown' };
    });
  }
  function sameModel(a: SessionSettings, b: SessionSettings): boolean {
    return a.model?.provider === b.model?.provider && a.model?.id === b.model?.id;
  }
  async function change(type: 'set_model' | 'set_thinking_level', data: RecordValue,
    matches: (actual: SessionSettings) => boolean): Promise<ControlResult<SessionSettings>> {
    if (!owned.idle || !owned.questionsQuiescent || observedError || initialActivity !== activity) return { kind: 'rejected' };
    dispatched = true; // Any failure from here can follow a native side effect, including success:false.
    const response = await owned.wire.command(type, data);
    if (response?.success !== true) return { kind: 'unknown' };
    const actual = await read();
    if (!actual || !quiescent(actual.state) || !matches(actual.settings)) return { kind: 'unknown' };
    return { kind: 'confirmed', value: actual.settings };
  }
  function setModel(choice: ModelChoice): Promise<HarnessControlResult<SessionSettings>> {
    const { provider, modelId } = choice;
    return reserve(true, async () => {
      const available = await catalogue();
      if (!available) return { kind: 'unknown' };
      if (!available.some(model => model.provider === provider && model.id === modelId)) return { kind: 'rejected' };
      const before = await read();
      if (!before) return { kind: 'unknown' };
      if (!quiescent(before.state)) return { kind: 'rejected' };
      return change('set_model', { provider, modelId }, actual => actual.model?.provider === provider && actual.model.id === modelId);
    });
  }
  function setThinkingLevel(level: string): Promise<HarnessControlResult<SessionSettings>> {
    return reserve(true, async () => {
      const before = await read();
      if (!before) return { kind: 'unknown' };
      if (!quiescent(before.state) || !before.settings.availableThinkingLevels.includes(level)) return { kind: 'rejected' };
      return change('set_thinking_level', { level }, actual => sameModel(before.settings, actual) && actual.thinkingLevel === level);
    });
  }
  async function helperAvailable(): Promise<boolean> {
    const response = await owned.wire.command('get_commands');
    const commands = object(response?.data).commands;
    if (response?.success !== true || !Array.isArray(commands)) return false;
    const matches = commands.map(object).filter(command => command.name === reloadCommand);
    if (matches.length !== 1) return false;
    const command = matches[0]!;
    const source = object(command.sourceInfo);
    return command.source === 'extension' && command.description === RELOAD_DESCRIPTION
      && source.path === reloadExtensionPath && source.source === 'cli'
      && source.scope === 'temporary' && source.origin === 'top-level';
  }
  function reload(): Promise<HarnessControlResult<SessionSettings>> {
    return reserve<SessionSettings>(true, async () => {
      const before = await read();
      if (!before) return { kind: 'unknown' };
      if (!quiescent(before.state)) return { kind: 'rejected' };
      if (!Number.isSafeInteger(before.state.messageCount) || (before.state.messageCount as number) < 0) return { kind: 'unknown' };
      if (!await helperAvailable()) return { kind: 'rejected' };
      if (!owned.idle || !owned.questionsQuiescent || observedError || initialActivity !== activity) return { kind: 'rejected' };
      dispatched = true;
      const response = await owned.wire.command('prompt', { message: `/${reloadCommand}` });
      if (response?.success !== true || object(response.data).disposition !== 'handled' || observedError) return { kind: 'unknown' };
      const actual = await read();
      if (!actual || !quiescent(actual.state) || !sameModel(before.settings, actual.settings)
        || before.settings.thinkingLevel !== actual.settings.thinkingLevel
        || !Number.isSafeInteger(actual.state.messageCount)
        || (actual.state.messageCount as number) < (before.state.messageCount as number)
        || !await helperAvailable()) return { kind: 'unknown' };
      return { kind: 'confirmed', value: actual.settings };
    });
  }
  return { event, models, settings, setModel, setThinkingLevel, reload,
    get busy() { return busy; },
  };
}
