import type { NativeCommand, QuestionReply } from './types.ts';

export const BODY_LIMIT = 65_536;
export const ID = /^[A-Za-z0-9._-]{1,128}$/;
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'schema');
  return value as Record<string, unknown>;
}

export function lexicalId(value: unknown): string {
  if (typeof value !== 'string' || !ID.test(value)) throw new ApiError(400, 'schema');
  return value;
}

export function sessionId(value: unknown): string {
  const id = lexicalId(value);
  // Session IDs must survive standard URL dot-segment normalization unchanged.
  if (id === '.' || id === '..') throw new ApiError(400, 'schema');
  return id;
}

export function commandBody(value: Record<string, unknown>): NativeCommand {
  if (typeof value.type !== 'string' || !value.type) throw new ApiError(400, 'schema');
  return value as NativeCommand;
}

export function compactBody(value: Record<string, unknown>): Record<string, unknown> & { customInstructions?: string } {
  if (Object.keys(value).some(key => key !== 'customInstructions')
    || ('customInstructions' in value && typeof value.customInstructions !== 'string')) throw new ApiError(400, 'schema');
  return value as Record<string, unknown> & { customInstructions?: string };
}

export function replyBody(value: Record<string, unknown>): QuestionReply {
  const { requestId, method } = value;
  if (typeof requestId !== 'string' || requestId.length === 0
    || typeof method !== 'string' || !['confirm', 'select', 'input'].includes(method)) throw new ApiError(400, 'schema');
  if (value.cancelled === true) fields(value, ['requestId', 'method', 'cancelled']);
  else if (method === 'confirm') {
    fields(value, ['requestId', 'method', 'confirmed']);
    if (typeof value.confirmed !== 'boolean') throw new ApiError(400, 'schema');
  } else {
    fields(value, ['requestId', 'method', 'value']);
    if (typeof value.value !== 'string') throw new ApiError(400, 'schema');
  }
  return value as unknown as QuestionReply;
}

export function fields(value: Record<string, unknown>, names: readonly string[]) {
  if (Object.keys(value).length !== names.length || names.some(name => !(name in value))) {
    throw new ApiError(400, 'schema');
  }
}
