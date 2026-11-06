import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CoreError, type NativeBinding, type ModelChoice } from './types.ts';
import { checkNative } from './native-history.ts';

export interface NativeStartupSelection {
  readonly modelChange?: ModelChoice;
  readonly responseModel?: ModelChoice;
  readonly thinkingLevel?: string;
}
type Entry = { type: string; id: string; parentId: string | null; provider?: unknown; modelId?: unknown;
  thinkingLevel?: unknown; message?: { role?: unknown; api?: unknown; provider?: unknown; model?: unknown } };
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Reference existing bytes, never a settings/history copy or a failed launch tail. */
export function pinNativeStartup(binding: NativeBinding): void {
  checkNative(binding, binding.fresh);
  const bytes = readFileSync(binding.file);
  if (!bytes.length) return;
  if (!binding.startupReference) binding.startupReference = Object.freeze({ prefixByteLength: bytes.length, sha256: digest(bytes) });
  nativeStartupSelection(binding);
}

/** Only selected-branch model/effort metadata; no context projection or replay. */
export function nativeStartupSelection(binding: NativeBinding): NativeStartupSelection | null {
  checkNative(binding, binding.fresh);
  if (!binding.startupReference) return null;
  try {
    const bytes = readFileSync(binding.file);
    const ref = binding.startupReference;
    if (bytes.length < ref.prefixByteLength) throw new Error();
    const prefix = bytes.subarray(0, ref.prefixByteLength);
    if (digest(prefix) !== ref.sha256) throw new Error();
    return selectedMetadata(prefix);
  } catch { throw new CoreError('native-invalid'); }
}

function choice(provider: unknown, modelId: unknown): ModelChoice {
  if (typeof provider !== 'string' || !provider || typeof modelId !== 'string' || !modelId) throw new Error();
  return Object.freeze({ provider, modelId });
}

function selectedMetadata(prefix: Buffer): NativeStartupSelection {
  const records = prefix.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
  const header = records.shift() as { version?: number };
  const entries = records as Entry[];
  let branch = entries;
  if ((header.version ?? 1) > 1) {
    const byId = new Map(entries.map(entry => [entry.id, entry]));
    branch = [];
    let entry = entries.at(-1);
    while (entry) {
      branch.push(entry);
      entry = entry.parentId === null ? undefined : byId.get(entry.parentId);
    }
    branch.reverse();
  }
  let thinkingLevel: string | undefined;
  for (const entry of branch) if (entry.type === 'thinking_level_change') {
    if (typeof entry.thinkingLevel !== 'string' || !entry.thinkingLevel) throw new Error();
    thinkingLevel = entry.thinkingLevel;
  }
  // Native virtual-models.getBranchSelection: a physical response wins unless the
  // preceding model_change still denotes a registered pi-virtual model. Resolve
  // that discriminator privately against the CURRENT native catalogue, not here.
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type === 'model_change') return { modelChange: choice(entry.provider, entry.modelId), thinkingLevel };
    if (entry.type === 'message' && entry.message?.role === 'assistant' && entry.message.api !== 'pi-virtual') {
      const previous = branch.slice(0, i).findLast(entry => entry.type === 'model_change');
      return { responseModel: choice(entry.message.provider, entry.message.model), thinkingLevel,
        ...(previous ? { modelChange: choice(previous.provider, previous.modelId) } : {}) };
    }
  }
  return { thinkingLevel };
}
