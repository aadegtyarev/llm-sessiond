// Independent HTTP/SSE test client: no project TypeScript imports.
import assert from 'node:assert/strict';

export function apiClient(port, token) {
  const base = `http://127.0.0.1:${port}`;
  const headers = { Authorization: `Bearer ${token}` };
  async function request(path, body, status = 200, options = {}) {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), ...options,
      signal: AbortSignal.timeout(15_000),
    });
    const value = await response.json();
    assert.equal(response.status, status, JSON.stringify(value));
    return value;
  }
  return { base, headers, request, stream: () => stream(base, headers) };
}

async function stream(base, headers) {
  const controller = new AbortController();
  const response = await fetch(base + '/events', { headers, signal: controller.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/event-stream/);
  const events = [];
  const waiters = new Set();
  let ended = false;
  let failure;
  const notify = () => { for (const wake of [...waiters]) wake(); };
  const done = (async () => {
    try {
      let text = '';
      const decoder = new TextDecoder();
      for await (const chunk of response.body) {
        text += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = text.indexOf('\n\n')) >= 0) {
          const frame = text.slice(0, end); text = text.slice(end + 2);
          const [eventLine, dataLine] = frame.split('\n');
          assert.match(eventLine, /^event: (core|ready)$/);
          assert.ok(dataLine.startsWith('data: '));
          events.push({ event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) });
          notify();
        }
      }
    } catch (error) { if (!controller.signal.aborted) failure = error; }
    finally { ended = true; notify(); }
  })();
  async function next(predicate, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('SSE evidence deadline')), timeoutMs);
      function finish(error, value) {
        clearTimeout(timer); waiters.delete(check);
        if (error) reject(error); else resolve(value);
      }
      function check() {
        const match = events.find(predicate);
        if (match) finish(undefined, match);
        else if (failure || ended) finish(failure ?? new Error('SSE lost before evidence'));
      }
      waiters.add(check); check();
    });
  }
  const result = { events, next, done, close: async () => { controller.abort(); await done; } };
  await next(frame => frame.event === 'ready');
  return result;
}
