import type { NativeModel, SessionSettings } from './types.ts';

/** Only these fields may cross the native model/settings boundary. */
export function modelSnapshot(value: unknown): NativeModel | null {
  if (!value || typeof value !== 'object') return null;
  const model = value as Record<string, unknown>;
  if (typeof model.provider !== 'string' || !model.provider
    || typeof model.id !== 'string' || !model.id
    || (model.name !== undefined && typeof model.name !== 'string')) return null;
  return Object.freeze({ provider: model.provider, id: model.id,
    ...(model.name === undefined ? {} : { name: model.name as string }) });
}

export function settingsSnapshot(value: SessionSettings): SessionSettings {
  const model = modelSnapshot(value.model);
  if ((value.model !== null && !model) || typeof value.thinkingLevel !== 'string'
    || !Array.isArray(value.availableThinkingLevels)
    || value.availableThinkingLevels.some(level => typeof level !== 'string' || !level)
    || !value.availableThinkingLevels.includes(value.thinkingLevel)) throw new Error('invalid settings');
  return Object.freeze({ model, thinkingLevel: value.thinkingLevel,
    availableThinkingLevels: Object.freeze([...value.availableThinkingLevels]) });
}
