import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

export const allowanceMs = 5_000;

export async function until(predicate: () => boolean, phase = 'protocol observation',
  timeoutMs = allowanceMs, diagnostics: () => string = () => '') {
  const started = performance.now();
  while (!predicate() && performance.now() - started < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.ok(predicate(), `${phase}: exceeded ${timeoutMs}ms; ${diagnostics()}`);
}

export function phaseTrace() {
  const directory = mkdtempSync(join(tmpdir(), 'pi-test-phases-'));
  const phases = () => readdirSync(directory).filter(name => /^\d+$/.test(name)).flatMap(name =>
    readFileSync(join(directory, name), 'utf8').split('\n').filter(Boolean));
  return { flag: `--trace-dir=${directory}`, phases,
    release: (gate: string) => writeFileSync(join(directory, gate), ''),
    count: (phase: string) => phases().filter(value => value === phase).length,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
