import { descriptorSchema } from "./adapter-descriptor-schema.js";
import { SafeValidationError } from "./generic-json.js";
import { validateJson } from "./json-bounds.js";
import type { HarnessAdapter } from "./adapter-contracts.js";

export class HarnessRegistry {
  private readonly adapters = new Map<string, HarnessAdapter>();
  private readonly aliases = new Map<string, string>();
  private readonly namespaces = new Set<string>();
  constructor(adapters: HarnessAdapter[], readonly defaultId?: string) {
    for (const adapter of adapters) this.register(adapter);
    if (defaultId && !this.adapters.has(this.resolve(defaultId).descriptor.id)) {
      throw new SafeValidationError("UNKNOWN_DEFAULT_ADAPTER");
    }
  }
  register(adapter: HarnessAdapter): void {
    const descriptor = descriptorSchema.safeParse(adapter.descriptor);
    if (!descriptor.success || this.adapters.has(adapter.descriptor.id)) throw new SafeValidationError("INVALID_ADAPTER_REGISTRATION");
    if (adapter.descriptor.options) validateJson(adapter.descriptor.options, 8192, 5);
    if (adapter.checkpoint && (!/^[a-z][a-z0-9._-]{0,127}$/.test(adapter.checkpoint.namespace) || !Number.isSafeInteger(adapter.checkpoint.version) || adapter.checkpoint.version < 1)) throw new SafeValidationError("INVALID_CHECKPOINT_REGISTRATION");
    const keys = [adapter.descriptor.id, ...adapter.descriptor.aliases];
    if (new Set(keys).size !== keys.length || keys.some((key) => this.aliases.has(key))) throw new SafeValidationError("ADAPTER_ID_COLLISION");
    const extensions = adapter.descriptor.extensions ?? [];
    if (new Set(extensions.map((item) => item.namespace)).size !== extensions.length || extensions.some((item) => this.namespaces.has(item.namespace))) throw new SafeValidationError("EXTENSION_COLLISION");
    this.adapters.set(adapter.descriptor.id, adapter);
    for (const extension of extensions) this.namespaces.add(extension.namespace);
    for (const key of keys) this.aliases.set(key, adapter.descriptor.id);
  }
  resolve(id?: string): HarnessAdapter {
    const key = id ?? this.defaultId;
    const canonical = key && this.aliases.get(key);
    const adapter = canonical && this.adapters.get(canonical);
    if (!adapter) throw new SafeValidationError("UNKNOWN_ADAPTER");
    return adapter;
  }
  list(): HarnessAdapter[] { return [...this.adapters.values()]; }
}
