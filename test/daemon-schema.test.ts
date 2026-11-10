import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, commandBody, compactBody, record } from '../src/daemon-schema.ts';

const schemaError = (error: unknown) => error instanceof ApiError && error.status === 400 && error.code === 'schema';

for (const value of [undefined, null, [], false, 0, 'text']) {
  test(`daemon-schema record: rejects non-object ${JSON.stringify(value)}`, () => {
    assert.throws(() => record(value), schemaError);
  });
}

for (const [name, validate, valid, invalid] of [
  ['commandBody', commandBody,
    [{ type: ' \t\n' }, { type: 'future_native', arbitrary: { nested: [1, null, '🙂'] } },
      { type: 'control_response', response: { request_id: 'q', response: { behavior: 'deny' } }, extra: true }],
    [{}, ...['', null, 0, false, [], {}].map(type => ({ type }))]],
  ['compactBody', compactBody,
    [{}, { customInstructions: '' }, { customInstructions: 'preserve 🙂' }],
    [...[null, 0, false, [], {}].map(customInstructions => ({ customInstructions })),
      { type: 'compact' }, { extra: true }, { customInstructions: '', extra: true }]],
] as const) {
  for (const body of valid) {
    test(`daemon-schema ${name}: accepts without normalization ${JSON.stringify(body)}`, () => {
      const expected = structuredClone(body);
      assert.equal(validate(Object.freeze(body)), body);
      assert.deepEqual(body, expected);
    });
  }
  for (const body of invalid) {
    test(`daemon-schema ${name}: rejects ${JSON.stringify(body)}`, () => {
      assert.throws(() => validate(body), schemaError);
    });
  }
}
