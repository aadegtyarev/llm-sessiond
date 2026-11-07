// Fake Pi: it alone writes/reads standard JSONL history. No provider or project runtime imports.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { message, settled } from './pi-records.ts';

const evidence = process.argv[2];
const mode = process.argv[3];
const sessionFile = process.argv[process.argv.indexOf('--session') + 1];
const out = (record: unknown) => process.stdout.write(JSON.stringify(record) + '\n');
const healthFile = join(evidence, `${process.pid}.health`);
let entries: Record<string, any>[] = [];
let leaf: string | null = null;
let model = { provider: 'fixture', id: 'one', name: 'One' };
let thinkingLevel = 'low';
let resourceVersion = 'v1';
let waiting = false;
let awaitingReply = false;
const optionsFile = join(evidence, 'startup-options.json');
const options = existsSync(optionsFile) ? JSON.parse(readFileSync(optionsFile, 'utf8')) : {};
let stateReads = 0;
let startupState: (() => void) | undefined;
const assistant = () => { const record = message('stop');
  record.message.provider = model.provider; record.message.model = model.id; return record;
};
const privateName = process.env.LLM_SESSIOND_RELOAD_COMMAND;
const trace = (type: string) => appendFileSync(join(evidence, `${process.pid}.controls`), type + '\n');
const resource = () => out({ type: 'extension_ui_request', id: 'resource', method: 'setStatus',
  statusKey: 'fixture-resource', statusText: `${resourceVersion}:${process.pid}:${entries[0].id}` });
function entry(value: Record<string, unknown>) {
  const record = { ...value, id: randomUUID().slice(0, 8), parentId: leaf, timestamp: new Date().toISOString() };
  appendFileSync(sessionFile, JSON.stringify(record) + '\n');
  entries.push(record); leaf = record.id;
}
function handle(command: Record<string, any>) {
  trace(command.type === 'prompt' ? (command.message === `/${privateName}` ? 'reload' : 'user-prompt') : command.type);
  if (command.type === 'abort') {
    if (!waiting) throw new Error('no active wait');
    waiting = false; out(settled(true));
    out({ type: 'response', id: command.id, command: command.type, success: true }); return;
  }
  if (command.type === 'extension_ui_response') {
    if (command.id === 'startup-question' && command.confirmed === true && startupState) {
      const respond = startupState; startupState = undefined; respond(); return;
    }
    if (!awaitingReply || command.id !== 'controls-question' || command.confirmed !== true) throw new Error('wrong reply');
    awaitingReply = false;
    const result = assistant(); entry({ type: 'message', message: result.message });
    out({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: `reply-consumed:${process.pid}` } });
    out(result); out(settled()); return;
  }
  if (command.type === 'compact') {
    appendFileSync(join(evidence, `${process.pid}.compactions`), JSON.stringify(command) + '\n');
    out({ type: 'compaction_start', reason: 'manual' });
    if (mode === 'compact-refused' || options.compactRefusal || entries.filter(record => record.type === 'message').length < 4) {
      out({ type: 'compaction_end', reason: 'manual', aborted: mode === 'compact-refused' || !!options.compactRefusal, willRetry: false });
      out({ type: 'response', id: command.id, command: command.type, success: false, error: 'private refusal or too small' }); return;
    }
    // This fake Pi alone projects remembered context and writes standard compaction history.
    const previous = entries.findLast(record => record.type === 'compaction');
    const remembered = entries.find(record => record.type === 'message' && record.message?.role === 'user');
    const summary = String(previous?.summary ?? remembered?.message.content ?? 'no-context');
    const result = { summary, firstKeptEntryId: leaf!, tokensBefore: 100, estimatedTokensAfter: 20,
      details: { private: 'native-only' } };
    entry({ type: 'compaction', summary, firstKeptEntryId: leaf, tokensBefore: 100 });
    out({ type: 'compaction_end', reason: 'manual', result, aborted: false, willRetry: false });
    out({ type: 'response', id: command.id, command: command.type, success: true, data: result }); return;
  }
  if (command.type === 'get_available_models') {
    out({ type: 'response', id: command.id, command: command.type, success: true,
      data: { models: options.unavailable ? [] : options.models ?? [{ provider: 'fixture', id: 'one', name: 'One', api: 'fake-api', headers: { Authorization: 'private' }, baseUrl: 'private' },
        { provider: 'fixture', id: 'two', name: 'Two', api: 'fake-api' }] } }); return;
  }
  if (command.type === 'get_available_thinking_levels') {
    out({ type: 'response', id: command.id, command: command.type, success: true,
      data: { levels: options.levels ?? (model.id === 'two' ? ['off'] : ['off', 'low', 'high']) } }); return;
  }
  if (command.type === 'set_model' || command.type === 'set_thinking_level') {
    if ('persist' in command) throw new Error('global persistence forbidden');
    if (options.auth === false && command.type === 'set_model') {
      out({ type: 'response', id: command.id, command: command.type, success: false }); return;
    }
    if (command.type === 'set_model') {
      model = { provider: command.provider, id: command.modelId, name: command.modelId === 'one' ? 'One' : 'Two' };
      entry({ type: 'model_change', provider: model.provider, modelId: model.id });
      if (model.id === 'two') { thinkingLevel = 'off'; entry({ type: 'thinking_level_change', thinkingLevel }); }
    } else { thinkingLevel = options.clamp ? 'off' : command.level; entry({ type: 'thinking_level_change', thinkingLevel }); }
    out({ type: 'response', id: command.id, command: command.type, success: true }); return;
  }
  if (command.type === 'get_commands') {
    out({ type: 'response', id: command.id, command: command.type, success: true, data: { commands: mode === 'helper-missing' ? [] : [{
      name: privateName, source: 'extension', description: 'llm-sessiond internal reload command',
      sourceInfo: { path: process.argv[process.argv.indexOf('--extension') + 1], source: 'cli', scope: 'temporary', origin: 'top-level' },
    }] } }); return;
  }
  if (command.type === 'prompt' && command.message === `/${privateName}`) {
    if (mode === 'helper-error') out({ type: 'extension_error', extensionPath: `command:${privateName}`, event: 'command', error: 'private' });
    else {
      const versionFile = join(evidence, 'plugin-version');
      resourceVersion = existsSync(versionFile) ? readFileSync(versionFile, 'utf8') : 'v1'; resource();
      out({ type: 'extension_ui_request', id: 'reload-notify', method: 'notify', message: 'fixture-reloaded', notifyType: 'info' });
    }
    out({ type: 'response', id: command.id, command: command.type, success: true, data: { disposition: 'handled' } }); return;
  }
  if (command.type === 'get_state') {
    stateReads++;
    const respond = () => out({ type: 'response', id: command.id, command: 'get_state', success: true,
      data: { isStreaming: false, isCompacting: false, pendingMessageCount: 0,
        messageCount: entries.filter(record => record.type === 'message').length, model,
        thinkingLevel: options.malformed && stateReads > 1 ? undefined : thinkingLevel,
        sessionId: mode === 'wrong-id' || (options.foreign && stateReads > 1) ? randomUUID() : entries[0].id,
        sessionFile: mode === 'wrong-path' || (options.foreignPath && stateReads > 1) ? `${sessionFile}.other` : sessionFile } });
    if (options.startupQuestion && stateReads === 1) {
      startupState = respond;
      out({ type: 'extension_ui_request', id: 'startup-question', method: 'confirm', title: 'Startup fixture', message: 'Explicit reply only' });
      return;
    }
    respond();
    if ((options.foreign || options.foreignPath) && stateReads > 1) out({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'foreign-text-must-not-forward' } });
    return;
  }
  if (command.type !== 'prompt') throw new Error();
  const remembered = entries.find(record => record.type === 'message' && record.message?.role === 'user');
  const compacted = entries.findLast(record => record.type === 'compaction');
  const result = command.message === 'recall' ? String(compacted?.summary ?? remembered?.message.content ?? 'no-context') : 'marker-recorded';
  entry({ type: 'message', message: { role: 'user', content: command.message, timestamp: Date.now() } });
  out({ type: 'response', id: command.id, command: 'prompt', success: true, data: { disposition: 'started' } });
  out({ type: 'agent_start' });
  if (command.message === 'uncertain') return;
  if (command.message === 'fixture:wait-controls') {
    waiting = true;
    out({ type: 'tool_execution_start', toolCallId: 'wait-controls', toolName: 'fixture', args: {} }); return;
  }
  if (command.message === 'fixture:questions-controls') {
    awaitingReply = true;
    out({ type: 'extension_ui_request', id: 'controls-question', method: 'confirm', title: 'Fixture', message: 'Explicit reply' }); return;
  }
  const resultMessage = assistant();
  entry({ type: 'message', message: resultMessage.message });
  out({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: result } });
  out(resultMessage); out(settled());
}
try {
  if (!process.argv.includes('--session') || process.argv.includes('--no-session')) throw new Error();
  if (readFileSync(sessionFile, 'utf8') === '') writeFileSync(sessionFile, JSON.stringify({
    type: 'session', version: 3, id: randomUUID(), timestamp: new Date().toISOString(), cwd: mode === 'wrong-cwd' ? join(process.cwd(), '..') : process.cwd(),
  }) + '\n');
  entries = readFileSync(sessionFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  if (mode === 'sdk-like' && (entries[0].version ?? 1) < 3) {
    const version = entries[0].version ?? 1;
    if (version === 1) entries.slice(1).forEach((entry, index) => {
      entry.id = `migrated-${index}`; entry.parentId = index === 0 ? null : `migrated-${index - 1}`;
    });
    entries[0].version = 3;
    writeFileSync(sessionFile, entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
    trace('native-migration');
  }
  leaf = entries.at(-1)?.type === 'session' ? null : entries.at(-1)!.id;
  for (const record of entries) {
    if (record.type === 'model_change') model = { provider: record.provider, id: record.modelId, name: record.modelId === 'one' ? 'One' : 'Two' };
    if (record.type === 'thinking_level_change') thinkingLevel = record.thinkingLevel;
  }
  if (mode === 'sdk-like') {
    // Native SDK appends defaults before readiness. Deliberately do NOT magically restore.
    model = { provider: 'fixture', id: 'one', name: 'One' }; thinkingLevel = 'off';
    entry({ type: 'model_change', provider: model.provider, modelId: model.id });
    entry({ type: 'thinking_level_change', thinkingLevel });
  }
  writeFileSync(healthFile, 'healthy');
  // Native resource activity is allowed before the first prompt, as in real Pi startup.
  writeFileSync(join(evidence, `${process.pid}.startup`), 'native startup resource');
  if (existsSync(join(evidence, 'plugin-version'))) {
    resourceVersion = readFileSync(join(evidence, 'plugin-version'), 'utf8'); resource();
  }
  out({ type: 'tool_execution_start', toolCallId: 'startup-resource', toolName: 'fixture', args: {} });
  out({ type: 'tool_execution_end', toolCallId: 'startup-resource', toolName: 'fixture', isError: false,
    result: { content: [{ type: 'text', text: 'startup resource ran' }] } });
  const reader = createInterface({ input: process.stdin });
  reader.on('close', () => process.exit(0));
  reader.on('line', line => {
    try { handle(JSON.parse(line)); }
    catch { writeFileSync(healthFile, 'failed'); process.exit(1); }
  });
} catch { writeFileSync(healthFile, 'failed'); process.exit(1); }
