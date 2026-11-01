import type { JsonValue } from "./generic-json.js";

export const STANDARD_CAPABILITIES = [
  "harness.launch",
  "harness.stop",
  "harness.resume",
  "input.submit",
  "input.submit-images",
  "input.cancel",
  "input.cancel-current",
  "status.read",
  "usage.read",
  "models.read",
  "models.change",
  "effort.read",
  "effort.change",
  "options.read",
  "options.write",
  "commands.read",
  "commands.run",
  "session.reload",
  "file.send",
  "permission.callback",
] as const;
export type StandardCapability = (typeof STANDARD_CAPABILITIES)[number];
export interface ExtensionOperation {
  name: string;
  effect: "read" | "write";
  guardRequired: boolean;
}
export interface ExtensionDescriptor {
  namespace: string;
  version: number;
  operations: ExtensionOperation[];
  events: string[];
}
export interface HarnessDescriptor {
  id: string;
  aliases: string[];
  capabilities: string[];
  metadata?: Record<string, string>;
  options?: Array<Record<string, JsonValue>>;
  extensions?: ExtensionDescriptor[];
}
export interface AdapterCheckpoint {
  namespace: string;
  version: number;
  data: JsonValue;
}
export interface HarnessAdapter {
  descriptor: HarnessDescriptor;
  checkpoint?: { namespace: string; version: number };
  validateCheckpoint(value: JsonValue): boolean;
  isResumable?(checkpoint: AdapterCheckpoint): boolean;
  migrateCheckpoint?(
    from: number,
    data: JsonValue,
  ): AdapterCheckpoint | undefined;
  validateExtension?(
    namespace: string,
    version: number,
    kind: "request" | "result" | "event",
    value: JsonValue,
  ): boolean;
  migrateExtension?(
    namespace: string,
    from: number,
    kind: "request" | "result" | "event",
    value: JsonValue,
  ): { version: number; value: JsonValue } | undefined;
}
