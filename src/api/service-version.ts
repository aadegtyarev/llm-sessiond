import { createRequire } from "node:module";

const metadata = createRequire(import.meta.url)("../../package.json") as {
  version?: unknown;
};
if (typeof metadata.version !== "string")
  throw new Error("service package metadata is unavailable");
export const SERVICE_VERSION = metadata.version;
