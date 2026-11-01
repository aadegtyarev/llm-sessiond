import { readFileSync } from "node:fs";
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
if (!/^\d+\.\d+\.\d+$/.test(packageJson.version))
  throw new Error("package version must be semver");
console.log(`version ${packageJson.version} is valid`);
