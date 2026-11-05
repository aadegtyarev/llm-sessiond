import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request as httpRequest } from 'node:http';
import { apiFixture } from './api-support.ts';
import { BODY_LIMIT } from '../src/daemon-schema.ts';

for (const path of ['/sessions', '/events', '/shutdown', '/unknown']) {
  test(`daemon auth required before routing: ${path}`, async t => {
    const api = await apiFixture(t);
    for (const Authorization of ['', 'Bearer short', `Bearer ${'x'.repeat(43)}`, `Basic ${api.token}`, `Bearer ${api.token}, other`]) {
      const response = await fetch(api.base + path, { headers: { Authorization } });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: { code: 'auth' } });
    }
    assert.deepEqual(await api.request('/sessions'), []);
  });
}

test('daemon rejects malformed transport/JSON/DTO/oversize before effects', async t => {
  const api = await apiFixture(t);
  for (const [body, code] of [['{', 'json'], ['null', 'schema'], ['[]', 'schema'], ['{"sessionId":"a","rawRpc":{}}', 'schema']]) {
    assert.deepEqual(await api.request('/sessions', {}, 400, { body }), { error: { code } });
  }
  for (const value of ['', '../x', 'x/y', 'x'.repeat(129), 1, null]) {
    await api.request('/sessions', { sessionId: value }, 400);
  }
  await api.request('/sessions', {}, 415, { headers: api.headers });
  await api.request('/sessions', { sessionId: 'oversize', text: 'x'.repeat(BODY_LIMIT) }, 413);
  await api.request(`/sessions?token=not-a-credential`, undefined, 400);
  await api.request('/sessions', undefined, 400, { headers: { ...api.headers, Origin: 'http://example.test' } });
  await api.request('/sessions/%73', undefined, 400);
  await api.request('/sessions', undefined, 405, { method: 'DELETE' });
  assert.deepEqual(await api.request('/sessions'), []);
});

for (const scenario of ['duplicate-auth', 'chunked-oversize', 'invalid-utf8']) {
  test(`daemon raw admission: ${scenario}`, async t => {
    const api = await apiFixture(t);
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const headers = scenario === 'duplicate-auth'
        ? ['Authorization', `Bearer ${api.token}`, 'Authorization', `Bearer ${api.token}`]
        : ['Authorization', `Bearer ${api.token}`, 'Content-Type', 'application/json'];
      const req = httpRequest(api.base + '/sessions', { method: 'POST', headers: [...headers, 'Host', new URL(api.base).host] }, res => {
        let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode!, body }));
      });
      req.on('error', reject);
      if (scenario === 'chunked-oversize') { req.write('x'.repeat(BODY_LIMIT)); req.end('x'); }
      else if (scenario === 'invalid-utf8') req.end(Buffer.from([0xff]));
      else req.end();
    });
    assert.equal(result.status, scenario === 'duplicate-auth' ? 401 : scenario === 'invalid-utf8' ? 400 : 413);
    assert.equal(result.body.includes(api.token), false);
    assert.deepEqual(await api.request('/sessions'), []);
  });
}
