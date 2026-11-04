import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const surfaces = new URL('../docs/contracts/surfaces/', import.meta.url);
const root = new URL('../', import.meta.url);

function surfaceViolations(text: string, exists = existsSync): string[] {
  const violations: string[] = [];
  if (/\bgit\s+show\b/i.test(text)) violations.push('git show archive');
  const references = text.matchAll(/(?:docs\/contracts\/|\.\.\/)features\/[\w.-]+\.md\b/g);
  for (const [reference] of references) {
    const target = new URL(reference, reference.startsWith('docs/') ? root : surfaces);
    if (!exists(target)) violations.push(`deleted feature contract: ${reference}`);
  }
  return violations;
}

for (const name of readdirSync(surfaces).filter(name => name.endsWith('.md'))) {
  test(`surface-docs: ${name} describes current behavior without archival references`, () => {
    assert.deepEqual(surfaceViolations(readFileSync(new URL(name, surfaces), 'utf8')), []);
  });
}

for (const text of [
  '[core](../../../src/core.ts), [meta](../meta-contract.md), [Pi](pi-text-harness.md)',
  'Native Pi 1.5; current code revision abc1234; Node 24.',
]) {
  test(`surface-docs guard accepts current links/compatibility: ${text}`, () => {
    assert.deepEqual(surfaceViolations(text), []);
  });
}

test('surface-docs guard resolves an existing temporary feature reference', () => {
  const activeFeature = new URL('../features/active.md', surfaces);
  assert.deepEqual(surfaceViolations('[active](../features/active.md)', target => {
    assert.equal(String(target), activeFeature.href);
    return true;
  }), []);
});

// Build missing-path fixtures without creating dangling references for repo docs tooling.
const deletedFeature = ['docs', 'contracts', 'features', 'deleted.md'].join('/');
for (const text of [
  `\`git show abc123:${deletedFeature}\``,
  '`git show abc123:README.md`',
  'git\nshow abc123',
  '[old](../features/deleted.md)',
  `\`${deletedFeature}\``,
  `[old](https://github.com/owner/repo/blob/abc123/${deletedFeature})`,
]) {
  test(`surface-docs guard rejects archival reference: ${text}`, () => {
    assert.notDeepEqual(surfaceViolations(text, () => false), []);
  });
}
