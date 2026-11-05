import type { CoreEvent } from '../src/types.ts';
export type Frame = { event: 'ready'; data: Record<string, never> } | { event: 'core'; data: CoreEvent };
export interface ApiStream {
  events: Frame[];
  next(predicate: (frame: Frame) => boolean, timeoutMs?: number): Promise<Frame>;
  done: Promise<void>;
  close(): Promise<void>;
}
export function apiClient(port: number, token: string): {
  base: string;
  headers: { Authorization: string };
  request(path: string, body?: unknown, status?: number, options?: RequestInit): Promise<any>;
  stream(): Promise<ApiStream>;
};
