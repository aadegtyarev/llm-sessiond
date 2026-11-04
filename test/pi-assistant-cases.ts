import { message } from './pi-support.ts';
import type { RecordValue } from '../src/pi-wire.ts';

export function malformedAssistants(reason: string): [string, unknown][] {
  const cases: [string, unknown][] = [];
  function change(path: string, value: unknown) {
    const changed: RecordValue = structuredClone(message(reason).message);
    const keys = path.split('.');
    let target = changed;
    for (const key of keys.slice(0, -1)) target = target[key] as RecordValue;
    const key = keys.at(-1)!;
    if (value === undefined) delete target[key];
    else target[key] = value;
    const label = typeof value === 'number' ? String(value) : JSON.stringify(value) ?? 'missing';
    cases.push([`${path}=${label}`, changed]);
  }
  for (const field of ['role', 'api', 'provider', 'model', 'stopReason']) {
    for (const value of [undefined, null, 7, false, [], {}]) change(field, value);
  }
  for (const value of [undefined, null, '1', false, {}, [], Infinity, NaN]) {
    change('timestamp', value);
  }
  for (const path of ['usage', 'usage.cost']) {
    for (const value of [undefined, null, '', 0, [], {}]) change(path, value);
  }
  for (const field of ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens']) {
    for (const value of [undefined, '0', null, false, {}, [], Infinity, NaN]) {
      change(`usage.${field}`, value);
    }
  }
  for (const field of ['input', 'output', 'cacheRead', 'cacheWrite', 'total']) {
    for (const value of [undefined, '0', null, false, {}, [], Infinity, NaN]) {
      change(`usage.cost.${field}`, value);
    }
  }
  for (const value of [undefined, null, 'private duplicate', {}, 0,
    [null], ['text'], [{}], [{ type: 'image', data: '', mimeType: 'image/png' }],
    [{ type: 'text' }], [{ type: 'text', text: 1 }],
    [{ type: 'thinking' }], [{ type: 'thinking', thinking: false }],
    [{ type: 'toolCall', id: 'id', name: 'tool' }],
    [{ type: 'toolCall', name: 'tool', arguments: {} }],
    [{ type: 'toolCall', id: 'id', arguments: {} }],
    [{ type: 'toolCall', id: 1, name: 'tool', arguments: {} }],
    [{ type: 'toolCall', id: 'id', name: 1, arguments: {} }],
    [{ type: 'toolCall', id: 'id', name: 'tool', arguments: [] }],
    [{ type: 'toolCall', id: 'id', name: 'tool', arguments: null }],
    [{ type: 'toolCall', id: 'id', name: 'tool', arguments: '{}' }],
  ]) change('content', value);
  cases.push(['role/reason only', { role: 'assistant', stopReason: reason }],
    ['message missing', undefined], ['message null', null], ['message array', []]);
  return cases;
}
