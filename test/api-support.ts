import { randomBytes } from 'node:crypto';
import type { TestContext } from 'node:test';
import { listenDaemon } from '../src/daemon.ts';
import { FakePort } from './fake-port.ts';
import { fixtureHealth } from './pi-fixture-health.ts';
import { apiClient } from './api-client.mjs';
import type { HarnessPort } from '../src/types.ts';

export async function apiFixture(t: TestContext, port: HarnessPort = new FakePort()) {
  const health = fixtureHealth();
  const token = randomBytes(32).toString('base64url');
  const daemon = await listenDaemon({ token, port: 0, harness: health.wrap(port) });
  t.after(async () => { try { await daemon.close(); await daemon.closed; } finally { health.assertHealthy(); } });
  const client = apiClient(daemon.port, token);
  async function running(id = 's') {
    await client.request('/sessions', { sessionId: id });
    return client.request(`/sessions/${id}/start`, {});
  }
  return { ...client, token, daemon, running, health };
}
