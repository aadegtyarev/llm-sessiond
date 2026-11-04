// Thin protocol responder only: no agent, tools, credentials, or provider access.
import { afterConsumption, phase, publishFixtureFence } from './pi-child-control.ts';
const readyDelay = Number(process.argv.find(arg => arg.startsWith('--ready-delay='))?.split('=')[1] ?? 0);
const hold = process.argv.includes('--hold-stop');
let signals = 0;
process.on('SIGTERM', () => {
  if (!hold || ++signals > 1) process.exit(0);
});
const keepAlive = setInterval(() => {}, 1000);
process.stdin.on('end', () => {
  if (!hold) { clearInterval(keepAlive); process.exit(0); }
});
let batch: string | null = null;
let uiReplies: unknown[] = [];
let uiExpected = 0;
let uiFinal: unknown[] = [];
const output = (record: unknown) => {
  const line = JSON.stringify(record) + '\n';
  if (batch !== null) batch += line;
  else process.stdout.write(line);
};
process.stdin.setEncoding('utf8');
let input = '';
process.stdin.on('data', (chunk: string) => {
  input += chunk;
  let end: number;
  while ((end = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, end);
    input = input.slice(end + 1);
    handle(line);
  }
});
function handle(line: string) {
  const command = JSON.parse(line);
  if (command.type === 'extension_ui_response') {
    phase(`ui-response:${command.id}`);
    uiReplies.push(command);
    if (uiReplies.length === uiExpected) {
      output({ type: 'message_update', assistantMessageEvent: {
        type: 'text_delta', delta: JSON.stringify(uiReplies),
      } });
      uiFinal.forEach(output);
    }
    return; // Native UI responses deliberately have no ACK.
  }
  const response = (data: unknown, success = true, extra = {}) => output({
    type: 'response', id: command.id, command: command.type, success, data, ...extra,
  });
  if (command.type === 'get_state') {
    phase('get_state');
    if (process.argv.includes('--no-ready')) return;
    if (process.argv.includes('--malformed-ready')) { response({}); return; }
    if (process.argv.includes('--wrong-ready')) {
      response({}, true, { command: 'prompt' });
      return;
    }
    const ready = () => {
      if (process.argv.includes('--startup-status')) output({ type: 'extension_ui_request',
        id: 'startup', method: 'setStatus', statusKey: 'fixture', statusText: 'loading' });
      output({ type: 'response', id: 'unrelated', command: 'get_state', success: true });
      response({ isStreaming: false, sessionId: String(process.pid) });
      phase('ready');
    };
    if (readyDelay) setTimeout(ready, readyDelay); else ready();
    return;
  }
  if (process.argv.includes('--ignore-prompt')) return;
  const scenario = JSON.parse(command.message);
  uiExpected = scenario.uiExpected ?? 0;
  uiFinal = scenario.uiFinal ?? [];
  uiReplies = [];
  phase('prompt'); phase(`prompt:${scenario.fixtureFence}`);
  if (scenario.noAck) return;
  if (scenario.exitBeforeAck) process.exit(0);
  const records = (values: unknown[] = []) => values.forEach(output);
  records(scenario.beforeAck);
  const reply = () => {
    if (scenario.batch) batch = '';
    response({ disposition: scenario.disposition ?? 'started' }, scenario.success ?? true,
      scenario.wrongCommand ? { command: 'get_state' } : { error: 'private RPC error' });
    if (scenario.inspect) output({ type: 'message_update', assistantMessageEvent: {
      type: 'text_delta', delta: JSON.stringify({
        args: process.argv.slice(2).filter(arg => !arg.startsWith('--trace-dir=')), override: Object.hasOwn(process.env, 'PI_PACKAGE_DIR'),
        pid: process.pid,
      }),
    } });
    process.stderr.write('private stderr prompt config\n');
    if (scenario.fragment) {
      const bytes = Buffer.from(JSON.stringify({ type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Привет 🌍\u2028\u2029' },
      }) + '\r\n');
      for (const byte of bytes) process.stdout.write(Buffer.from([byte]));
    }
    records(scenario.records);
    if (scenario.later) {
      const later = () => { records(scenario.later); phase('later'); phase(`later:${scenario.laterGate}`); };
      if (scenario.laterGate) afterConsumption(scenario.laterGate, later);
      else setTimeout(later, scenario.laterDelay ?? 150);
    }
    publishFixtureFence(scenario, output);
    phase('records');
    if (batch !== null) { process.stdout.write(batch); batch = null; }
    afterConsumption(scenario.fixtureGate, () => {
      if (scenario.raw) process.stdout.write(scenario.raw);
      if (scenario.invalidUtf8) process.stdout.write(Buffer.from([0xff, 0x0a]));
      if (scenario.exit) process.exit(0);
      if (scenario.eof) process.stdout.end();
    });
  };
  if (scenario.delayAck) setTimeout(reply, scenario.delayAck);
  else reply();
}
