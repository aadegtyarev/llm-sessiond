import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { SessionCore } from '../src/core.ts';
import type { HarnessEvent, NativeBinding, PortOutcome } from '../src/types.ts';
import { FakePort } from './fake-port.ts';

export function nativeHeader(id = randomUUID(), cwd = process.cwd()) {
  return JSON.stringify({ type: 'session', version: 3, id, cwd, timestamp: new Date().toISOString() }) + '\n';
}
export class NativePort extends FakePort {
  starts = 0;
  healthy = true;
  readonly bindings = new Map<string, NativeBinding>();
  override async start(id: string, emit: (event: HarnessEvent) => void, binding?: NativeBinding): Promise<PortOutcome> {
    this.starts++;
    if (!binding) { this.healthy = false; return { kind: 'unknown' }; }
    this.bindings.set(id, binding);
    if (readFileSync(binding.file, 'utf8') === '') writeFileSync(binding.file, nativeHeader(undefined, binding.cwd));
    return super.start(id, emit);
  }
}
export function nativeFixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'sessiond-native-unit-'));
  const options = { stateDir: join(root, 'state'), nativeSessionDir: join(root, 'native') };
  mkdirSync(options.nativeSessionDir);
  const port = new NativePort();
  const core = new SessionCore(port, options);
  t.after(() => { rmSync(root, { recursive: true, force: true }); assert.equal(port.healthy, true); });
  return { root, options, core, port };
}
export function metadataPath(stateDir: string, id = 's'): string {
  const name = readdirSync(stateDir).find(name => name.endsWith('.json')
    && JSON.parse(readFileSync(join(stateDir, name), 'utf8')).id === id);
  assert.ok(name, `metadata exists for ${id}`);
  return join(stateDir, name);
}
export function blockWrites(stateDir: string) {
  const parked = `${stateDir}.parked`;
  renameSync(stateDir, parked); writeFileSync(stateDir, 'write obstruction');
  return () => { rmSync(stateDir); renameSync(parked, stateDir); };
}
