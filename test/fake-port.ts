import assert from 'node:assert/strict';
import { CoreError, SessionCore, type HarnessEvent, type HarnessPort, type PortOutcome } from '../src/core.ts';

export type Deferred<T> = { promise: Promise<T>; resolve(value: T): void };

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

export class FakePort implements HarnessPort {
  readonly emitters = new Map<string, (event: HarnessEvent) => void>();
  readonly sends: Array<{ sessionId: string; inputId: string; text: string }> = [];
  readonly stops: string[] = [];
  startOutcome: PortOutcome = { kind: 'confirmed' };
  sendOperation: () => Promise<PortOutcome> = async () => ({ kind: 'confirmed' });

  async start(sessionId: string, emit: (event: HarnessEvent) => void): Promise<PortOutcome> {
    this.emitters.set(sessionId, emit);
    return this.startOutcome;
  }

  async send(sessionId: string, inputId: string, text: string): Promise<PortOutcome> {
    this.sends.push({ sessionId, inputId, text });
    return this.sendOperation();
  }

  async stop(sessionId: string): Promise<PortOutcome> {
    this.stops.push(sessionId);
    return { kind: 'confirmed' };
  }

  emit(sessionId: string, event: HarnessEvent): void {
    this.emitters.get(sessionId)?.(event);
  }
}

export async function running(port = new FakePort(), sessionId = 's1') {
  const core = new SessionCore(port);
  core.create(sessionId);
  await core.start(sessionId);
  return { core, port };
}

export async function rejectsCode(promise: Promise<unknown>, code: CoreError['code']): Promise<void> {
  await assert.rejects(promise, (error: unknown) => error instanceof CoreError && error.code === code);
}
