import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { CoreError, type NativeBinding } from './types.ts';
import { validNativeContextEntry } from './native-context.ts';

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
  // Pi migrates an absent version as v1; an explicit null/unknown version is invalid.
  const version = header?.version === undefined ? 1 : header.version;
  if (!header || header.type !== 'session' || !NATIVE_ID.test(header.id)
    || ![1, 2, 3].includes(version) || typeof header.timestamp !== 'string'
    || !Number.isFinite(Date.parse(header.timestamp)) || !isAbsolute(header.cwd)
    || canonicalDirectory(header.cwd) !== binding.cwd
    || (binding.nativeId !== null && header.id !== binding.nativeId)) throw new Error();
  const parents = new Map<string, string | null>();
  for (const [index, entry] of lines.entries()) {
    if (!entry || typeof entry !== 'object' || typeof entry.type !== 'string' || entry.type === 'session') throw new Error();
    // Legacy v1 is linear; Pi migrates it. V2/v3 must have unambiguous tree references.
    if (!validNativeContextEntry(entry, version)) throw new Error();
    if (version > 1) {
      if (typeof entry.id !== 'string' || !entry.id || parents.has(entry.id)
        || (entry.parentId !== null && !parents.has(entry.parentId))) throw new Error();
      if (entry.type === 'context_edit' && !parents.has(entry.targetId)) throw new Error();
      parents.set(entry.id, entry.parentId);
      if (entry.type === 'compaction') {
        // Retain-none refers to self; any retained range must start on this parent chain.
        let ancestor: string | null = entry.id;
        while (ancestor !== null && ancestor !== entry.firstKeptEntryId) ancestor = parents.get(ancestor) ?? null;
        if (ancestor === null) throw new Error();
      }
    } else if (entry.type === 'compaction' && entry.firstKeptEntryIndex > index + 1) {
      // v1 indices include the header; migration assigns the current ID before resolving self.
      throw new Error();
    }
  }
  return header.id;
}

export function canonicalDirectory(path: string): string {
  const canonical = realpathSync(path);
  if (!lstatSync(canonical).isDirectory()) throw new CoreError('native-invalid');
  return canonical;
}
