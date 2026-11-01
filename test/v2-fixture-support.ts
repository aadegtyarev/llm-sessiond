import { readFileSync } from "node:fs";

const root = new URL("./fixtures/v2/contracts/", import.meta.url);
// Fixture contracts intentionally model heterogeneous golden documents.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const load = (name: string): any =>
  JSON.parse(readFileSync(new URL(name, root), "utf8"));
export const containsKey = (value: unknown, key: string): boolean => {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([name, child]) => name === key || containsKey(child, key),
  );
};
