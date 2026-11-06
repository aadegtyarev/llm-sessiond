import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { CoreError, type NativeBinding, type SessionRecord } from './types.ts';
import { canonicalDirectory, checkNative, nativeIdentity, NATIVE_ID } from './native-history.ts';
import { createSessionRecord } from './harness-session.ts';

export interface NativeOptions { stateDir: string; nativeSessionDir: string; cwd?: string }
const ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Concrete metadata I/O only. Core owns admission, transitions and runtime ownership. */
export class NativeRegistry {
  readonly stateDir: string;
  readonly nativeDir: string;
  readonly cwd: string;
  private readonly locks: { file: string; identity: string }[] = [];
  constructor(options: NativeOptions) {
    mkdirSync(options.stateDir, { recursive: true, mode: 0o700 });
    mkdirSync(options.nativeSessionDir, { recursive: true, mode: 0o700 });
    this.stateDir = canonicalDirectory(options.stateDir);
    this.nativeDir = canonicalDirectory(options.nativeSessionDir);
    this.cwd = canonicalDirectory(options.cwd ?? process.cwd());
    try {
      for (const root of new Set([this.stateDir, this.nativeDir])) {
        const file = join(root, '.llm-sessiond.lock');
        const fd = openSync(file, 'wx', 0o600);
        try {
          this.locks.push({ file, identity: nativeIdentity(file) });
          writeFileSync(fd, randomUUID()); fsyncSync(fd);
        } finally { closeSync(fd); }
      }
    } catch {
      this.release();
      throw new CoreError('storage-failed');
    }
  }
  release(): void {
    for (const lock of [...this.locks].reverse()) {
      // Never remove a lock installed by somebody else, even at the same path.
      if (nativeIdentity(lock.file) !== lock.identity) throw new CoreError('storage-failed');
      unlinkSync(lock.file);
      this.locks.splice(this.locks.indexOf(lock), 1);
    }
  }
  save(session: SessionRecord): void {
    const path = this.path(session.id);
    for (const other of this.load()) {
      if (other.id === session.id) continue;
      if (other.native!.file === session.native!.file
        || (session.native!.nativeId !== null && other.native!.nativeId === session.native!.nativeId)
        || (session.native!.identity !== null && other.native!.identity === session.native!.identity)) throw new CoreError('native-owned');
    }
    const temporary = join(this.stateDir, `.${randomUUID()}.tmp`);
    let fd: number | undefined;
    try {
      const data = { version: 1, id: session.id, status: session.status,
        input: session.input && { inputId: session.input.inputId, status: session.input.status, generation: session.input.generation },
        inputIds: [...session.inputIds], generation: session.generation,
        native: session.native, deleting: session.deleting === true };
      fd = openSync(temporary, 'wx', 0o600);
      writeFileSync(fd, JSON.stringify(data));
      fsyncSync(fd); closeSync(fd); fd = undefined;
      renameSync(temporary, path);
      this.syncDirectory();
    } catch {
      throw new CoreError('storage-failed');
    } finally {
      if (fd !== undefined) closeSync(fd);
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  load(): SessionRecord[] {
    try {
      const sessions = readdirSync(this.stateDir).filter(name => name.endsWith('.json')).map(name => {
        const file = join(this.stateDir, name);
        nativeIdentity(file);
        const data = JSON.parse(readFileSync(file, 'utf8'));
        if (data.version !== 1 || this.path(data.id) !== file
          || !['created', 'starting', 'running', 'stopped', 'failed', 'unknown'].includes(data.status)
          || !Number.isSafeInteger(data.generation) || data.generation < 0
          || !Array.isArray(data.inputIds) || data.inputIds.some((id: unknown) => typeof id !== 'string')
          || new Set(data.inputIds).size !== data.inputIds.length || typeof data.deleting !== 'boolean') throw new Error();
        const binding = data.native;
        if (!binding || typeof binding.fresh !== 'boolean' || typeof binding.file !== 'string' || dirname(binding.file) !== this.nativeDir
          || typeof binding.cwd !== 'string' || canonicalDirectory(binding.cwd) !== binding.cwd
          || (binding.identity !== null && typeof binding.identity !== 'string')
          || (binding.nativeId !== null && (typeof binding.nativeId !== 'string' || !NATIVE_ID.test(binding.nativeId)))) throw new Error();
        const session = createSessionRecord(data.id);
        session.native = binding;
        session.generation = data.generation + 1;
        for (const id of data.inputIds) session.inputIds.add(id);
        session.deleting = data.deleting;
        const clean = ['created', 'stopped'].includes(data.status) && binding.identity !== null;
        session.status = clean ? data.status : 'unknown';
        session.stopRequested = !clean;
        if (data.input !== null) {
          if (!data.input || !session.inputIds.has(data.input.inputId)
            || !Number.isSafeInteger(data.input.generation) || data.input.generation < 0 || data.input.generation > data.generation
            || !['pending', 'completed', 'failed', 'cancelled', 'unknown'].includes(data.input.status)) throw new Error();
          session.input = { inputId: data.input.inputId, status: clean ? data.input.status : 'unknown', generation: data.input.generation };
        }
        return session;
      });
      const paths = new Set<string>(), ids = new Set<string>(), identities = new Set<string>();
      for (const session of sessions) {
        const binding = session.native!;
        if (paths.has(binding.file) || (binding.nativeId && ids.has(binding.nativeId))
          || (binding.identity && identities.has(binding.identity))) throw new Error();
        paths.add(binding.file);
        if (binding.nativeId) ids.add(binding.nativeId);
        if (binding.identity) identities.add(binding.identity);
      }
      return sessions;
    } catch { throw new CoreError('storage-failed'); }
  }
  reservation(): NativeBinding {
    return { file: join(this.nativeDir, `${randomUUID()}.jsonl`), cwd: this.cwd, nativeId: null, identity: null, fresh: true };
  }
  allocate(binding: NativeBinding): void {
    try {
      const fd = openSync(binding.file, 'wx', 0o600);
      fsyncSync(fd); closeSync(fd);
      binding.identity = nativeIdentity(binding.file);
      this.syncDirectory(this.nativeDir);
    } catch { throw new CoreError('storage-failed'); }
  }
  catalogue(): NativeBinding[] {
    const candidates: NativeBinding[] = [];
    for (const name of readdirSync(this.nativeDir).filter(name => name.endsWith('.jsonl'))) {
      const file = join(this.nativeDir, name);
      try {
        const identity = nativeIdentity(file);
        const header = JSON.parse(readFileSync(file, 'utf8').split('\n')[0]);
        const binding = { file, identity, cwd: canonicalDirectory(header.cwd), nativeId: header.id, fresh: false };
        checkNative(binding);
        candidates.push(binding);
      } catch { /* Invalid/empty/aliased files are not importable. Never modify them. */ }
    }
    return candidates;
  }
  resolve(nativeId: string): NativeBinding {
    if (!NATIVE_ID.test(nativeId)) throw new CoreError('native-invalid');
    const matches = this.catalogue().filter(binding => binding.nativeId === nativeId);
    if (matches.length !== 1) throw new CoreError('native-invalid');
    return matches[0];
  }
  remove(session: SessionRecord): void {
    const binding = session.native!;
    try {
      let present = false;
      try { lstatSync(binding.file); present = true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (present) {
        checkNative(binding, binding.fresh);
        unlinkSync(binding.file);
      } else if (!session.deleting) throw new CoreError('native-invalid');
      this.syncDirectory(this.nativeDir);
      if (existsSync(this.path(session.id))) unlinkSync(this.path(session.id));
      this.syncDirectory();
    } catch (error) {
      if (error instanceof CoreError) throw error;
      throw new CoreError('storage-failed');
    }
  }
  private syncDirectory(directory = this.stateDir): void {
    // Windows does not permit fsync on directory handles. Atomic rename still applies.
    if (process.platform === 'win32') return;
    const fd = openSync(directory, 'r');
    try { fsyncSync(fd); } finally { closeSync(fd); }
  }
  private path(id: string): string {
    if (!ID.test(id) || id === '.' || id === '..') throw new CoreError('native-invalid');
    // Lowercase base32 is injective for accepted ASCII IDs even on case-insensitive
    // filesystems; the prefix avoids Windows device names, and 128 bytes stay <255 chars.
    const alphabet = '0123456789abcdefghijklmnopqrstuv';
    let encoded = '', buffer = 0, bits = 0;
    for (const byte of Buffer.from(id, 'utf8')) {
      buffer = (buffer << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        encoded += alphabet[(buffer >>> bits) & 31];
      }
      buffer &= (1 << bits) - 1;
    }
    if (bits > 0) encoded += alphabet[(buffer << (5 - bits)) & 31];
    return join(this.stateDir, `session-${encoded}.json`);
  }
}
