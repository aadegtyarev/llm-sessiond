import { SessionCore, createHarnessRegistry, type HarnessPort, type NativeResponse } from '../src/core.ts';
import { createPiHarness } from '../src/pi-harness.ts';
import { FakePort } from './fake-port.ts';

// Compile-only fixture: never start a native process or execute these commands.
async function singlePortTypes() {
  const pi = new SessionCore(createPiHarness());
  const fake = new SessionCore(new FakePort());
  const annotated: HarnessPort<NativeResponse> = new FakePort();
  const legacy = new SessionCore(annotated);
  for (const core of [pi, fake, legacy]) {
    const response: NativeResponse = await core.command('s', { type: 'prompt' });
    const id: string = response.id;
    const command: string = response.command;
    const success: boolean = response.success;
    const type: 'response' = response.type;
    // @ts-expect-error Legacy native fields must not silently become any.
    const wrongId: number = response.id;
    void [id, command, success, type, wrongId];
  }
  // Check inference itself, not just assignment through the legacy annotation.
  const piId: string = (await pi.command('s', { type: 'prompt' })).id;
  const fakeSuccess: boolean = (await fake.command('s', { type: 'prompt' })).success;
  // @ts-expect-error Inferred Pi success is boolean, not any or number.
  const wrongPiSuccess: number = (await pi.command('s', { type: 'prompt' })).success;
  // @ts-expect-error Inferred FakePort id is string, not any or number.
  const wrongFakeId: number = (await fake.command('s', { type: 'prompt' })).id;
  void [piId, fakeSuccess, wrongPiSuccess, wrongFakeId];
}

async function neutralPortTypes(port: HarnessPort) {
  const core = new SessionCore(port);
  const result = await core.command('s', { type: 'user' });
  // @ts-expect-error A neutral native result has no guaranteed Pi id.
  const id: string = result.id;
  void id;
  const registry = createHarnessRegistry(new Map([['opaque', port]]), 'opaque');
  const registered = new SessionCore(registry);
  registered.create('s', 'opaque');
  await registered.command('s', { type: 'user', extra: { arbitrary: true } });
}
