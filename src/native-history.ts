import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { CoreError, type NativeBinding } from './types.ts';

export const NATIVE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function nativeIdentity(file: string): string {
  const stat = lstatSync(file, { bigint: true });
  if (!stat.isFile() || stat.nlink !== 1n || realpathSync(file) !== file) throw new CoreError('native-invalid');
  return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
}

export function checkNative(binding: NativeBinding, allowEmpty = false): string | null {
  try {
    if (!binding.identity || nativeIdentity(binding.file) !== binding.identity) throw new Error();
    const text = readFileSync(binding.file, 'utf8');
    if (text === '' && allowEmpty && binding.nativeId === null) return null;
    return parseNative(text, binding);
  } catch { throw new CoreError('native-invalid'); }
}

function parseNative(text: string, binding: NativeBinding): string {
  const lines = text.trimEnd().split('\n').map(line => JSON.parse(line));
  const header = lines.shift();
  if (!header || header.type !== 'session' || !NATIVE_ID.test(header.id)
    || ![1, 2, 3].includes(header.version) || typeof header.timestamp !== 'string'
    || !Number.isFinite(Date.parse(header.timestamp)) || !isAbsolute(header.cwd)
    || canonicalDirectory(header.cwd) !== binding.cwd
    || (binding.nativeId !== null && header.id !== binding.nativeId)) throw new Error();
  const ids = new Set<string>();
  for (const entry of lines) {
    if (!entry || typeof entry !== 'object' || typeof entry.type !== 'string' || entry.type === 'session') throw new Error();
    // Legacy v1 is linear; Pi migrates it. V2/v3 must have unambiguous tree references.
    if (header.version > 1) {
      if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)
        || (entry.parentId !== null && !ids.has(entry.parentId))) throw new Error();
      ids.add(entry.id);
    }
  }
  return header.id;
}

export function canonicalDirectory(path: string): string {
  const canonical = realpathSync(path);
  if (!lstatSync(canonical).isDirectory()) throw new CoreError('native-invalid');
  return canonical;
}
