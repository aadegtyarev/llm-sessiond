import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionCore, type ReplyOutcome, type SessionView } from '../src/core.ts';
import { fixture, boundary, message, settled } from './pi-support.ts';
import { answers, dialogs } from './pi-interaction-records.ts';

for (const state of ['starting', 'running'] as const) {
  test(`pi-reply-reentry: immediate subscriber replies during ${state}`, async t => {
    const f = await fixture(t, state === 'starting' ? ['--startup-questions'] : []);
    const core = new SessionCore(f.port);
    const outcomes: Promise<ReplyOutcome | { error: string }>[] = [];
    const views: SessionView[] = [];
    const order: string[] = [];
    core.subscribe(event => {
      if (event.type !== 'question') return;
      const id = event.question.requestId;
      order.push(`A:${id}`);
      views.push(core.get(event.sessionId));
      // Invoke immediately, while question publication is still delivering to A.
      outcomes.push(core.reply(event.sessionId, answers.find(answer => answer.requestId === id)!)
        .catch(error => ({ error: String(error) })));
      order.push(`returned:${id}`);
    });
    core.subscribe(event => {
      if (event.type === 'question') order.push(`B:${event.question.requestId}`);
    });
    core.create('s');
    if (state === 'starting') {
      const start = core.start('s').then(view => ({ view }), error => ({ error }));
      await f.until(() => outcomes.length === 3, 'startup questions published');
      assert.deepEqual(await Promise.all(outcomes), answers.map(() => ({ kind: 'written' })));
      assert.ok('view' in await start);
      const phases = f.phases();
      assert.ok(phases.indexOf('startup-questions') < phases.indexOf('ui-response:confirm-id'));
      assert.ok(phases.indexOf('ui-response:input-id') < phases.indexOf('startup-replies-consumed'));
      assert.ok(phases.indexOf('startup-replies-consumed') < phases.indexOf('ready'));
      assert.equal(core.get('s').input, null);
    } else {
      await core.start('s');
      await core.send('s', 'i', JSON.stringify({
        records: [boundary, ...dialogs], uiExpected: 3, uiFinal: [message('stop'), settled()],
      }));
      await f.until(() => outcomes.length === 3, 'running questions published');
      assert.deepEqual(await Promise.all(outcomes), answers.map(() => ({ kind: 'written' })));
      await f.until(() => core.get('s').input?.status === 'completed', 'reply continuation settled');
    }
    // All verdicts are outside isolated subscribers and the Port health boundary.
    assert.deepEqual(views.map(view => view.status), [state, state, state]);
    assert.deepEqual(views.map(view => view.input?.status ?? null),
      state === 'starting' ? [null, null, null] : ['pending', 'pending', 'pending']);
    assert.deepEqual(order, dialogs.flatMap(({ id }) => [`A:${id}`, `returned:${id}`, `B:${id}`]));
    await f.phase('ui-response:input-id');
    const frames = f.phases().filter(phase => phase.startsWith('ui-frame:'))
      .map(phase => JSON.parse(phase.slice('ui-frame:'.length)));
    assert.deepEqual(frames, [
      { type: 'extension_ui_response', id: 'confirm-id', confirmed: true },
      { type: 'extension_ui_response', id: 'select-id', value: 'blue' },
      { type: 'extension_ui_response', id: 'input-id', value: 'hello' },
    ]);
    assert.equal(core.get('s').status, 'running');
    f.assertHealthy();
    await core.stop('s'); await core.shutdown(); await f.closed();
  });
}
