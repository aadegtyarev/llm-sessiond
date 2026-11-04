import assert from 'node:assert/strict';
import test from 'node:test';
import { interactionEvent } from '../src/pi-interaction-events.ts';
import { tools, dialogs, notifications } from './pi-interaction-records.ts';

for (const record of [...tools, ...dialogs, ...notifications]) {
  test(`pi-interaction-events: whitelist and snapshot ${JSON.stringify(record)}`, () => {
    const source = structuredClone(record);
    const event = interactionEvent({ ...source, privateDiagnostic: 'do not expose' })!;
    assert.ok(event);
    assert.equal(JSON.stringify(event).includes('privateDiagnostic'), false);
    if (event.type === 'tool') {
      assert.equal(Object.isFrozen(event), true);
      assert.equal(event.toolCallId, 'tool-id');
    }
    if ('args' in source) source.args = { changed: [] } as never;
    if ('options' in source && source.options) source.options.push('mutated');
    assert.equal(JSON.stringify(event).includes('mutated'), false);
    assert.equal(JSON.stringify(event).includes('changed'), false);
  });
}

const malformed = [
  ...tools.map(record => ({ ...record, toolCallId: '' })),
  ...tools.map(record => ({ ...record, toolName: 42 })),
  { ...tools[0], args: undefined },
  { ...tools[1], partialResult: undefined },
  { ...tools[2], result: undefined },
  { ...tools[2], isError: 'false' },
  { ...tools[2], durationMs: -1 },
  ...dialogs.map(record => ({ ...record, id: '' })),
  ...dialogs.map(record => ({ ...record, title: null })),
  ...dialogs.map(record => ({ ...record, timeout: -1 })),
  { ...dialogs[0], message: 42 },
  { ...dialogs[1], options: ['blue', null] },
  { ...dialogs[2], placeholder: false },
  { ...notifications[0], statusKey: 1 },
  { ...notifications[0], statusText: null },
  { ...notifications[2], message: null },
  { ...notifications[2], notifyType: 'other' },
  { type: 'extension_ui_request', id: 'widget', method: 'setWidget' },
  { type: 'extension_ui_request', id: 'editor', method: 'editor', title: 'outside scope' },
  { type: 'stderr', text: 'private' },
  { type: 'response', command: 'private' },
];
for (const record of malformed) {
  test(`pi-interaction-events: ignores malformed/unsupported ${JSON.stringify(record)}`, () => {
    assert.equal(interactionEvent(record), null);
  });
}
