import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiFixture } from './api-support.ts';
import { fixture, boundary, message, settled } from './pi-support.ts';
import { dialogs } from './pi-interaction-records.ts';
import { BODY_LIMIT } from '../src/daemon-schema.ts';

for (const dialog of dialogs) for (const cancelled of [false, true]) {
  test(`daemon opaque 1025-character native ${dialog.method} ID: ${cancelled ? 'cancel' : 'answer'}`, async t => {
    const native = await fixture(t);
    const api = await apiFixture(t, native.port);
    const stream = await api.stream();
    t.after(() => stream.close());
    const requestId = `${dialog.method}:` + 'x'.repeat(1024 - dialog.method.length);
    assert.equal(requestId.length, 1025);
    await api.running();
    await api.request('/sessions/s/send', { inputId: 'question', text: JSON.stringify({
      records: [boundary, { ...dialog, id: requestId }], uiExpected: 1, uiFinal: [message('stop'), settled()],
    }) });
    const observed = await stream.next(f => f.event === 'core' && f.data.type === 'question');
    assert.ok(observed.event === 'core' && observed.data.type === 'question');
    const { type: _type, id: _id, ...questionFields } = dialog;
    assert.deepEqual(observed.data.question, { requestId, ...questionFields });
    const payload = cancelled ? { cancelled: true } : dialog.method === 'confirm' ? { confirmed: true }
      : { value: dialog.method === 'select' ? 'blue' : 'hello' };
    const answer = { requestId, method: dialog.method, ...payload };
    assert.deepEqual(await api.request('/sessions/s/reply', { ...answer, requestId: requestId + 'wrong' }), { kind: 'rejected' });
    assert.deepEqual(await api.request('/sessions/s/reply', { ...answer, requestId: 'x'.repeat(BODY_LIMIT) }, 413),
      { error: { code: 'body-too-large' } });
    assert.equal((await api.request('/sessions/s')).input.status, 'pending');
    assert.deepEqual(await api.request('/sessions/s/reply', answer), { kind: 'written' });
    assert.deepEqual(await api.request('/sessions/s/reply', answer), { kind: 'rejected' });
    const consumed = await stream.next(f => f.event === 'core' && f.data.type === 'text' && f.data.text.includes('extension_ui_response'));
    assert.ok(consumed.event === 'core' && consumed.data.type === 'text');
    // This public native continuation echoes the actual received frame, not the ACK.
    assert.deepEqual(JSON.parse(consumed.data.text), [{ type: 'extension_ui_response', id: requestId, ...payload }]);
    await stream.next(f => f.event === 'core' && f.data.type === 'input' && f.data.input.status === 'completed');
    assert.deepEqual((await api.request('/sessions/s')).input, { inputId: 'question', status: 'completed' });
    native.assertHealthy(); api.health.assertHealthy();
  });
}
