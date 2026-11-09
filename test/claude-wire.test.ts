import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claudeWireDouble } from './claude-wire-double.ts';

const control = (request_id?: string) => ({ type: 'control_request',
  ...(request_id === undefined ? {} : { request_id }), request: { subtype: 'future_native', value: false } });

test('claude wire: reverse full native replies need neither callback nor drain', { timeout: 2000 }, async t => {
  const f = claudeWireDouble(); t.after(f.cleanup);
  const a = f.wire.command(control('original-a'));
  const b = f.wire.command(control('original-b'));
  const answerB = f.respond(1, { subtype: 'error', error: 'native refusal', usage: { all: 8 }, future: [1] });
  assert.deepEqual(await b, answerB);
  const answerA = f.respond(0, { response: { models: ['native'], unknown: true } });
  assert.deepEqual(await a, answerA);
  assert.equal(f.losses, 0);
});

test('claude wire: pending native control does not queue interrupt, users or explicit permission answer', { timeout: 2000 }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = claudeWireDouble(); t.after(f.cleanup);
  let done = false;
  const long = f.wire.command(control()); void long.then(() => { done = true; });
  t.mock.timers.tick(600_000); await Promise.resolve();
  assert.equal(done, false); assert.equal(f.wire.broken, false);
  const interrupt = f.wire.command({ ...control('interrupt'), request: { subtype: 'interrupt' } });
  const interruptAnswer = f.respond(1);
  assert.deepEqual(await interrupt, interruptAnswer);
  const permission = { type: 'control_response', response: { subtype: 'success',
    request_id: 'native-permission', response: { behavior: 'allow', updatedInput: { x: [1] } } } };
  const records = [{ type: 'user', message: { role: 'user', content: 'a' } },
    { type: 'user', message: { role: 'user', content: 'b' } }, permission, { type: 'future_oneway', v: 3 }];
  const writes = records.map(record => f.wire.command(record));
  for (let index = 2; index < f.frames.length; index++) f.release(index);
  assert.deepEqual(await Promise.all(writes), records.map(() => ({ kind: 'written' })));
  assert.deepEqual(f.frames.slice(2), records);
  assert.deepEqual(f.events, []); // All writes finished before any native result/ACK.
  assert.equal(done, false);
  const answer = f.respond(0); assert.deepEqual(await long, answer);
});

for (const order of ['callback-first', 'drain-first'] as const) {
  test(`claude wire: one-way written requires callback AND drain (${order})`, { timeout: 2000 }, async t => {
    const f = claudeWireDouble(); t.after(f.cleanup);
    let done = false;
    const write = f.wire.command({ type: 'user' }); void write.then(() => { done = true; });
    if (order === 'callback-first') f.callbacks[0](); else f.stdin.emit('drain');
    await Promise.resolve(); assert.equal(done, false);
    if (order === 'callback-first') f.stdin.emit('drain'); else f.callbacks[0]();
    assert.deepEqual(await write, { kind: 'written' });
  });
}

test('claude wire: correlation admission is before write; only INFLIGHT IDs reserved', { timeout: 2000 }, async t => {
  const f = claudeWireDouble(); t.after(f.cleanup);
  const first = f.wire.command(control('same'));
  await assert.rejects(f.wire.command(control('same')), { code: 'harness-rejected' });
  for (const invalid of [null, 3, {}, false]) {
    await assert.rejects(f.wire.command({ ...control(), request_id: invalid }), { code: 'harness-rejected' });
  }
  await assert.rejects(f.wire.command({ type: 'control_request', request: [] }), { code: 'harness-rejected' });
  await assert.rejects(f.wire.command({ type: 'compact' }), { code: 'harness-rejected' });
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  await assert.rejects(f.wire.command({ type: 'user', cyclic }), { code: 'harness-rejected' });
  assert.equal(f.frames.length, 1);
  f.respond(0); await first;
  const reused = f.wire.command(control('same')); f.respond(1); await reused;
  const generated = f.wire.command(control());
  assert.equal(typeof f.frames[2].request_id, 'string');
  assert.notEqual(f.frames[2].request_id, 'same'); f.respond(2); await generated;
});

for (const loss of ['write-error', 'write-throw', 'exit', 'close', 'eof', 'stdin-error', 'stdout-error', 'stderr-error', 'child-error', 'stop'] as const) {
  for (const received of [false, true]) {
    test(`claude wire: ${loss}, response already received=${received}`, { timeout: 2000 }, async t => {
      const f = claudeWireDouble(); t.after(f.cleanup);
      const pending = f.wire.command(control());
      const answer = received ? f.respond() : null;
      const oneWay = f.wire.command({ type: 'user' });
      const rejected = assert.rejects(oneWay, { code: 'harness-unknown' });
      if (loss === 'write-error') f.callbacks[0](new Error('private'));
      else if (loss === 'write-throw') {
        f.stdin.write = () => { throw new Error('private'); };
        assert.equal(await f.wire.command(control()), null);
      } else if (loss === 'exit' || loss === 'close') f.child.emit(loss);
      else if (loss === 'eof') f.stdout.end('{truncated');
      else if (loss === 'stdin-error') f.stdin.emit('error', new Error('private'));
      else if (loss === 'stdout-error') f.stdout.emit('error', new Error('private'));
      else if (loss === 'stderr-error') f.stderr.emit('error', new Error('private'));
      else if (loss === 'child-error') f.child.emit('error', new Error('private'));
      else f.wire.fail();
      assert.deepEqual(await pending, answer); await rejected;
      assert.equal(f.losses, 1);
      assert.equal(await f.wire.command(control()), null);
    });
  }
}

for (const malformed of [
  'not json\n', '[]\n', 'null\n', '{}\n', '{"type":1}\n',
  JSON.stringify({ type: 'control_response', request_id: 'outer-not-nested' }) + '\n',
  JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: 3 } }) + '\n',
  JSON.stringify({ type: 'control_response', response: { subtype: 'unknown', request_id: 'r' } }) + '\n',
  JSON.stringify({ type: 'control_request', request_id: 2, request: { subtype: 'can_use_tool' } }) + '\n',
  JSON.stringify({ type: 'control_cancel_request', request_id: null }) + '\n',
  Buffer.from([0xff]), Buffer.from([0xe2, 0x82]), '{"type":"result"}', '\ufeff{}\n',
]) {
  test(`claude wire: malformed/UTF8/truncated EOF ${JSON.stringify(malformed)}`, { timeout: 2000 }, async t => {
    const f = claudeWireDouble(); t.after(f.cleanup);
    const pending = f.wire.command(control());
    f.stdout.end(malformed);
    assert.equal(await pending, null); assert.equal(f.losses, 1);
  });
}

test('claude wire: continuous LF/CRLF fatal streaming decoder preserves split Unicode and native records', t => {
  const f = claudeWireDouble(); t.after(f.cleanup);
  const record = { type: 'result', session_id: 'not-local', result: '🙂 Привет\u2028\u2029', usage: { all: 1 } };
  for (const ending of ['\n', '\r\n']) {
    for (const byte of Buffer.from(JSON.stringify(record) + ending)) f.stdout.write(Buffer.from([byte]));
  }
  assert.deepEqual(f.events, [record, record]);
  f.stderr.write('private diagnostics'); assert.equal(f.losses, 0);
});

test('claude wire: pending registered before synchronous native answer, even if local write throws afterward', { timeout: 2000 }, async t => {
  const f = claudeWireDouble(); t.after(f.cleanup);
  const answer = { type: 'control_response', response: { request_id: 'sync', subtype: 'success', future: [1] } };
  f.stdin.write = () => { f.send(answer); throw new Error('late private write failure'); };
  assert.deepEqual(await f.wire.command(control('sync')), answer);
});

test('claude wire: one-way without backpressure still waits callback, and written survives later loss', { timeout: 2000 }, async t => {
  const f = claudeWireDouble(); t.after(f.cleanup);
  f.stdin.write = (line, callback) => {
    f.frames.push(JSON.parse(line)); f.callbacks.push(callback); return true;
  };
  let done = false;
  const result = f.wire.command({ type: 'user' }); void result.then(() => { done = true; });
  await Promise.resolve(); assert.equal(done, false);
  f.callbacks[0]();
  assert.deepEqual(await result, { kind: 'written' });
  f.child.emit('exit');
  assert.deepEqual(await result, { kind: 'written' });
});

test('claude wire: synchronous local callback cannot bypass false write return/drain', { timeout: 2000 }, async t => {
  const f = claudeWireDouble(); t.after(f.cleanup);
  f.stdin.write = (_line, callback) => { callback(); return false; };
  let done = false;
  const result = f.wire.command({ type: 'user' }); void result.then(() => { done = true; });
  await Promise.resolve(); assert.equal(done, false);
  f.stdin.emit('drain'); assert.deepEqual(await result, { kind: 'written' });
});

test('claude wire: unrelated native reply does not claim pending request; many pending share drain listener', { timeout: 2000 }, async t => {
  const f = claudeWireDouble(); t.after(f.cleanup);
  let done = false;
  const results = Array.from({ length: 24 }, (_, i) => f.wire.command(control(`native-${i}`)));
  void results[0].then(() => { done = true; });
  f.send({ type: 'control_response', response: { subtype: 'success', request_id: 'unrelated', response: {} } });
  await Promise.resolve(); assert.equal(done, false);
  assert.equal(f.stdin.listenerCount('drain'), 1);
  const answers = [];
  for (let i = 23; i >= 0; i--) answers.unshift(f.respond(i));
  assert.deepEqual(await Promise.all(results), answers);
  assert.deepEqual(f.events, []); assert.equal(f.losses, 0);
});

// Identical bytes: coalesced, every two-chunk split, and byte-by-byte UTF8 splits.
function* chunkPartitions(bytes: Buffer) {
  yield [bytes];
  for (let cut = 1; cut < bytes.length; cut++) yield [bytes.subarray(0, cut), bytes.subarray(cut)];
  yield [...bytes].map(byte => Buffer.from([byte]));
}

for (const subtype of ['success', 'error', 'initialize-error'] as const) {
  for (const ending of ['\n', '\r\n']) {
    test(`claude wire: full ${subtype} before invalid UTF8 survives every chunk partition (${JSON.stringify(ending)})`, { timeout: 5000 }, async () => {
      const native = { type: 'control_response', response: {
        request_id: 'controlled-id', subtype: subtype === 'success' ? 'success' : 'error',
        ...(subtype === 'success' ? { response: { complete: true, text: '🙂 Привет\u2028\u2029' } }
          : { error: `${subtype}: native 拒否🙂`, usage: { input_tokens: 3 } }),
        future: { nested: [1, false] },
      }, metadata: { preserve: [1, false] } };
      const bytes = Buffer.concat([Buffer.from(JSON.stringify(native) + ending), Buffer.from([0xff])]);
      for (const chunks of chunkPartitions(bytes)) {
        const f = claudeWireDouble();
        try {
          const pending = f.wire.command({ ...control('controlled-id'), request: {
            subtype: subtype === 'initialize-error' ? 'initialize' : 'inspect', hooks: null,
          } });
          for (const chunk of chunks) f.stdout.write(chunk);
          assert.equal(f.wire.broken, true); // Invalid suffix needs no LF/EOF to fail.
          assert.equal(f.losses, 1);
          assert.deepEqual(await pending, native); // No callback or drain released.
          f.callbacks[0](new Error('later private write failure'));
          f.stdin.emit('drain');
          assert.deepEqual(await pending, native);
        } finally { f.cleanup(); }
      }
    });
  }
}

test('claude wire: native permission/result/cancel and display prefix frames all precede fatal UTF8 under every partition', { timeout: 5000 }, () => {
  const records = [
    { type: 'result', session_id: 'native-not-local', is_error: true, errors: ['native 🙂 error'], usage: { all: 3 }, future: [1] },
    { type: 'control_request', request_id: 'native-permission', request: { subtype: 'can_use_tool',
      tool_use_id: 'native-tool', input: { paths: ['🙂', 'two'] }, permission_suggestions: [{ future: true }] } },
    { type: 'control_cancel_request', request_id: 'native-permission', future: { all: true } },
    { type: 'stream_event', parent_tool_use_id: null, event: {
      type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'actual 🙂 Привет' } } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'native-tool', name: 'Read', input: { path: '🙂' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'native-tool', content: 'native output', is_error: false }] } },
  ];
  const after = { type: 'result', result: 'MUST NOT be delivered after corruption' };
  const bytes = Buffer.concat([
    Buffer.from(records.map(record => JSON.stringify(record) + '\r\n').join('')),
    Buffer.from('{"type":"result","result":"'), Buffer.from([0xff]), Buffer.from('"}\n'),
    Buffer.from(JSON.stringify(after) + '\n'),
  ]);
  for (const chunks of chunkPartitions(bytes)) {
    const f = claudeWireDouble();
    try {
      for (const chunk of chunks) f.stdout.write(chunk);
      assert.deepEqual(f.events, records);
      assert.equal(f.losses, 1);
      f.send(after);
      assert.deepEqual(f.events, records);
    } finally { f.cleanup(); }
  }
});

for (const malformed of [Buffer.from('not json\n'), Buffer.from('{"type":3}\n'), Buffer.from([0xff, 0x0a])]) {
  test(`claude wire: multiple complete replies survive first malformed frame; unreplied requests and local writes remain unknown (${malformed.toString('hex')})`, { timeout: 2000 }, async t => {
    const f = claudeWireDouble(); t.after(f.cleanup);
    const a = f.wire.command(control('a'));
    const b = f.wire.command(control('b'));
    const missing = f.wire.command(control('missing'));
    const write = f.wire.command({ type: 'user' });
    const rejected = assert.rejects(write, { code: 'harness-unknown' });
    const nativeA = { type: 'control_response', response: { request_id: 'a', subtype: 'success', response: { complete: true } }, future: [1] };
    const nativeB = { type: 'control_response', response: { request_id: 'b', subtype: 'error', error: 'native refusal 🙂' }, metadata: { all: true } };
    const record = { type: 'result', is_error: false, usage: { input_tokens: 3 } };
    const tooLate = { type: 'control_response', response: { request_id: 'missing', subtype: 'success', response: {} } };
    f.stdout.write(Buffer.concat([
      Buffer.from([nativeA, nativeB, record].map(r => JSON.stringify(r) + '\n').join('')),
      malformed, Buffer.from(JSON.stringify(tooLate) + '\n' + JSON.stringify({ type: 'result', late: true }) + '\n'),
    ]));
    assert.deepEqual(await a, nativeA);
    assert.deepEqual(await b, nativeB);
    assert.equal(await missing, null);
    await rejected;
    assert.deepEqual(f.events, [record]);
    assert.equal(f.losses, 1);
  });
}

test('claude wire: complete prefix remains delivered but truncated multibyte JSON frame stays unknown at EOF', { timeout: 2000 }, async t => {
  const f = claudeWireDouble(); t.after(f.cleanup);
  const pending = f.wire.command(control());
  const record = { type: 'result', result: 'complete 🙂' };
  f.stdout.write(Buffer.concat([Buffer.from(JSON.stringify(record) + '\n{"type":"result","result":"'), Buffer.from([0xe2, 0x82])]));
  assert.deepEqual(f.events, [record]);
  assert.equal(f.wire.broken, false);
  f.stdout.end();
  assert.equal(await pending, null);
  assert.equal(f.losses, 1);
  assert.deepEqual(f.events, [record]);
});

test('claude wire: invalid UTF8 in an unfinished frame fails promptly without LF or EOF', { timeout: 2000 }, async t => {
  const f = claudeWireDouble(); t.after(f.cleanup);
  const pending = f.wire.command(control());
  f.stdout.write(Buffer.from('{"type":"result","result":"'));
  f.stdout.write(Buffer.from([0xff]));
  assert.equal(f.wire.broken, true);
  assert.equal(f.losses, 1);
  assert.equal(await pending, null);
  assert.deepEqual(f.events, []);
});
