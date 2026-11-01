import { createInterface } from "node:readline";
const mode = process.env.PI_V2_MODE ?? "ok";
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.type !== "get_state" || mode === "timeout") return;
  if (mode === "malformed") {
    process.stdout.write("not-json\n");
    return;
  }
  if (mode === "missing") {
    process.stdout.write(
      `${JSON.stringify({ type: "response", id: request.id, command: "get_state", success: true, data: {} })}\n`,
    );
    return;
  }
  const id = mode === "mismatch" ? "other-id" : "native-exact";
  const success = mode !== "rejected";
  process.stdout.write(
    `${JSON.stringify({ type: "response", id: request.id, command: "get_state", success, data: { sessionId: id } })}\n`,
  );
});
