// Node-only stream-json fixture. Never imports or launches a native harness.
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
const mode = process.argv[2];
if (mode === 'marker') writeFileSync(process.argv[3], 'spawned');
const send = record => process.stdout.write(JSON.stringify(record) + '\n');
const answer = (record, response = {}, subtype = 'success') => send({
  type: 'control_response', response: { subtype, request_id: record.request_id,
    ...(subtype === 'error' ? { error: 'native initialization refused' } : { response }),
    future: { untouched: [1, false] } }, metadata: { native: true },
});
const held = [];
let initialized;
const keepAlive = setInterval(() => {}, 1000);
if (mode === 'ignore-term') process.on('SIGTERM', () => {});
const lines = createInterface({ input: process.stdin });
lines.on('close', () => {
  if (!['ignore-term', 'ready-loss', 'ready-pending', 'ready-error'].includes(mode)) clearInterval(keepAlive);
});
lines.on('line', line => {
  const record = JSON.parse(line);
  if (record.type === 'control_request') {
    const subtype = record.request.subtype;
    if (subtype === 'initialize') {
      initialized = record;
      if (mode === 'ready-loss') { process.stdout.end(); return; }
      if (mode === 'ready-pending') return;
      send({ type: 'system', subtype: 'init', private: 'must-not-display' });
      process.stderr.write('private stderr must-not-display\n');
      answer(record, { observedInitialize: record }, mode === 'ready-error' ? 'error' : 'success');
      return;
    }
    if (subtype === 'hold') { held.push(record); return; }
    if (subtype === 'release') {
      for (const request of held.splice(0).reverse()) answer(request, { original: request });
    }
    if (subtype === 'inspect') {
      answer(record, { pid: process.pid, argv: process.argv.slice(2), cwd: process.cwd(), original: record, initialized });
    } else if (subtype === 'native_error') answer(record, {}, 'error');
    else answer(record, { original: record });
    return;
  }
  if (record.type === 'fixture_emit') {
    for (const value of record.records) send(value);
  }
  if (record.type === 'control_response') {
    send({ type: 'result', subtype: 'success', is_error: false,
      result: 'explicit permission received', echoedAnswer: record, session_id: 'native-history' });
  }
  if (record.type === 'fixture_exit') process.exit(0);
  if (record.type === 'fixture_malformed') process.stdout.write('malformed\n');
  if (record.type === 'fixture_eof') process.stdout.end();
});
