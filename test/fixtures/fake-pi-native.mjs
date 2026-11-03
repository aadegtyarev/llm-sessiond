#!/usr/bin/env node
import { createInterface } from "node:readline";
import { appendFileSync, writeFileSync } from "node:fs";
import { respondToPiRequest } from "./fake-pi-native-responses.mjs";
const scenario =
  process.argv[process.argv.indexOf("--fake-scenario") + 1] ?? "normal";
const pidPath = process.env.FAKE_PI_PID_FILE;
const journal = process.env.FAKE_PI_JOURNAL;
if (!pidPath || !journal) process.exit(2);
writeFileSync(pidPath, String(process.pid));
writeFileSync(journal, "");
const state = { effort: "high" };
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    process.exit(3);
  }
  appendFileSync(
    journal,
    `${JSON.stringify({
      type: request.type,
      id: request.id,
      hasImages: Array.isArray(request.images),
      imageShapeValid:
        Array.isArray(request.images) &&
        request.images.every(
          (image) =>
            image.type === "image" &&
            typeof image.mimeType === "string" &&
            typeof image.data === "string",
        ),
      exactText: request.message === "private prompt",
      streamingBehavior: request.streamingBehavior,
      hasInputId: Object.hasOwn(request, "inputId"),
      level: request.level,
    })}\n`,
  );
  const send = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
  respondToPiRequest(request, scenario, state, send);
});
