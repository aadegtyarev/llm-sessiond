import { object } from './pi-wire.ts';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numericFields(value: unknown, keys: readonly string[]): boolean {
  return record(value) && keys.every((key) =>
    typeof value[key] === 'number' && Number.isFinite(value[key]));
}

function contentBlock(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.type === 'text') return typeof value.text === 'string';
  if (value.type === 'thinking') return typeof value.thinking === 'string';
  return value.type === 'toolCall' && typeof value.id === 'string'
    && typeof value.name === 'string' && record(value.arguments);
}

// Required Native Pi 1.5 AssistantMessage shape, not an optional-metadata schema.
// Wire JSON already constrains tool arguments' values to JSON data.
export function assistantStopReason(value: unknown): string | undefined {
  const message = object(value);
  const usage = object(message.usage);
  if (message.role !== 'assistant' || !Array.isArray(message.content)
    || !message.content.every(contentBlock)
    || !['api', 'provider', 'model'].every((key) => typeof message[key] === 'string')
    || !numericFields(message, ['timestamp'])
    || !numericFields(usage, ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'])
    || !numericFields(usage.cost, ['input', 'output', 'cacheRead', 'cacheWrite', 'total'])
    || typeof message.stopReason !== 'string') return undefined;
  return message.stopReason;
}
