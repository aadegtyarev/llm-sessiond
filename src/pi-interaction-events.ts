import type { DisplayValue, InteractionEvent, NativeQuestion } from './types.ts';
import { snapshot } from './events.ts';
import type { RecordValue } from './pi-wire.ts';

function display(value: unknown): value is DisplayValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(display);
  return typeof value === 'object' && value !== null && Object.values(value).every(display);
}

export function question(record: RecordValue): NativeQuestion | null {
  if (typeof record.id !== 'string' || !record.id || typeof record.title !== 'string') return null;
  if (record.timeout !== undefined && (typeof record.timeout !== 'number'
    || !Number.isFinite(record.timeout) || record.timeout < 0)) return null;
  const base = { requestId: record.id, title: record.title,
    ...(record.timeout === undefined ? {} : { timeout: record.timeout as number }) };
  if (record.method === 'confirm' && typeof record.message === 'string') {
    return snapshot({ ...base, method: 'confirm', message: record.message });
  }
  if (record.method === 'select' && Array.isArray(record.options)
    && record.options.every(item => typeof item === 'string')) {
    return snapshot({ ...base, method: 'select', options: record.options });
  }
  if (record.method === 'input' && (record.placeholder === undefined || typeof record.placeholder === 'string')) {
    return snapshot({ ...base, method: 'input',
      ...(record.placeholder === undefined ? {} : { placeholder: record.placeholder }) });
  }
  return null;
}

/** Whitelist only display fields; never forward the native record wholesale. */
export function interactionEvent(record: RecordValue): InteractionEvent | null {
  if (record.type === 'extension_ui_request') {
    if (record.method === 'setStatus' && typeof record.statusKey === 'string'
      && (record.statusText === undefined || typeof record.statusText === 'string')) {
      return { type: 'notification', method: 'setStatus', statusKey: record.statusKey,
        ...(record.statusText === undefined ? {} : { statusText: record.statusText }) };
    }
    if (record.method === 'notify' && typeof record.message === 'string'
      && (record.notifyType === undefined || ['info', 'warning', 'error'].includes(String(record.notifyType)))) {
      return { type: 'notification', method: 'notify', message: record.message,
        level: (record.notifyType ?? 'info') as 'info' | 'warning' | 'error' };
    }
    const request = question(record);
    return request ? { type: 'question', question: request } : null;
  }
  if (typeof record.toolCallId !== 'string' || !record.toolCallId || typeof record.toolName !== 'string') return null;
  const base = { toolCallId: record.toolCallId, toolName: record.toolName };
  if (record.type === 'tool_execution_start' && display(record.args)) {
    return snapshot({ type: 'tool', phase: 'start', ...base, args: record.args });
  }
  if (record.type === 'tool_execution_update' && display(record.args) && display(record.partialResult)) {
    return snapshot({ type: 'tool', phase: 'update', ...base, args: record.args, partialResult: record.partialResult });
  }
  if (record.type === 'tool_execution_end' && display(record.result) && typeof record.isError === 'boolean'
    && (record.durationMs === undefined || (typeof record.durationMs === 'number'
      && Number.isFinite(record.durationMs) && record.durationMs >= 0))) {
    return snapshot({ type: 'tool', phase: 'end', ...base, result: record.result, isError: record.isError,
      ...(record.durationMs === undefined ? {} : { durationMs: record.durationMs }) });
  }
  return null;
}
