import type { NativeStartupSelection } from './native-startup.ts';
import { object, type RecordValue, type createPiWire } from './pi-wire.ts';
import type { ModelChoice } from './types.ts';

interface StartupRuntime {
  wire: Pick<ReturnType<typeof createPiWire>, 'command'>;
  state(): Promise<RecordValue | null>;
  safe(state: RecordValue): boolean;
}

/** Bounded restoration to the original native branch ONLY; CLI selection is not proof. */
export async function restoreNativeSettings(selection: NativeStartupSelection, owned: StartupRuntime): Promise<boolean> {
  const response = await owned.wire.command('get_available_models');
  const raw = object(response?.data).models;
  if (response?.success !== true || !Array.isArray(raw)) return false;
  const models = raw.map(object);
  const find = (choice: ModelChoice) => models.filter(model => model.provider === choice.provider && model.id === choice.modelId);
  let target = selection.modelChange;
  if (selection.responseModel) {
    const previous = target && find(target);
    // Missing prior selection could have been a now-unavailable virtual model.
    // Never adopt its routed physical response as an automatic replacement.
    if (previous && (previous.length !== 1 || typeof previous[0].api !== 'string')) return false;
    if (!previous || previous[0].api !== 'pi-virtual') target = selection.responseModel;
  }
  if (target && find(target).length !== 1) return false;
  let state = await owned.state();
  if (!state || !owned.safe(state)) return false;
  if (target) {
    // Native set_model checks auth BEFORE mutation, uses exact provider/id from the
    // available snapshot and defaults persist=false. Never cycle or choose another model.
    const changed = await owned.wire.command('set_model', { provider: target.provider, modelId: target.modelId });
    if (changed?.success !== true) return false;
    state = await owned.state();
    if (!state || !owned.safe(state)) return false;
  }
  return finish(selection, target, owned, state);
}

function matches(state: RecordValue, target: ModelChoice | undefined): boolean {
  const model = object(state.model);
  return !target || (model.provider === target.provider && model.id === target.modelId);
}

async function finish(selection: NativeStartupSelection, target: ModelChoice | undefined,
  owned: StartupRuntime, state: RecordValue): Promise<boolean> {
  if (!matches(state, target)) return false;
  const response = await owned.wire.command('get_available_thinking_levels');
  const levels = object(response?.data).levels;
  if (response?.success !== true || !Array.isArray(levels) || !levels.length
    || levels.some(level => typeof level !== 'string' || !level)) return false;
  if (selection.thinkingLevel !== undefined) {
    if (!levels.includes(selection.thinkingLevel)) return false;
    if (state.thinkingLevel !== selection.thinkingLevel) {
      if (!owned.safe(state)) return false;
      const changed = await owned.wire.command('set_thinking_level', { level: selection.thinkingLevel });
      if (changed?.success !== true) return false;
    }
  }
  // Neither a setter ACK nor supported-level membership proves effective native settings.
  const actual = await owned.state();
  return !!actual && owned.safe(actual) && matches(actual, target)
    && typeof actual.thinkingLevel === 'string' && levels.includes(actual.thinkingLevel)
    && (selection.thinkingLevel === undefined || actual.thinkingLevel === selection.thinkingLevel);
}
