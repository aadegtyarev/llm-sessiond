import readline from "node:readline";

const mode = process.env.CLAUDE_V2_MODE ?? "ok";
const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.type === "user") {
    if (mode === "text-no-replay") return;
    const sessionId =
      process.argv[
        process.argv.includes("--session-id")
          ? process.argv.indexOf("--session-id") + 1
          : process.argv.indexOf("--resume") + 1
      ];
    const replay = {
      type: "user",
      isReplay: true,
      session_id: sessionId,
      parent_tool_use_id: null,
      message: request.message,
    };
    const result = {
      type: "result",
      session_id: sessionId,
      parent_tool_use_id: null,
      subtype: mode === "text-error" ? "error_during_execution" : "success",
      is_error: mode === "text-error",
    };
    process.stdout.write(`${JSON.stringify(replay)}\n`);
    if (mode === "text-error")
      setTimeout(() => process.stdout.write(`${JSON.stringify(result)}\n`), 20);
    else process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (request.type !== "control_request") return;
  if (mode === "timeout" || mode === "missing") return;
  if (mode === "malformed") return process.stdout.write("{bad-json}\n");
  if (mode === "oversized")
    return process.stdout.write(`${"x".repeat(1024 * 1024 + 1)}\n`);
  if (mode === "early-exit" || mode === "missing-transcript") {
    process.stdout.write(
      `${JSON.stringify({ type: "result", subtype: "error_during_execution" })}\n`,
    );
    process.exit(1);
  }
  if (mode === "mismatch")
    process.stdout.write(
      `${JSON.stringify({ type: "system", subtype: "init", session_id: "00000000-0000-4000-8000-000000000000" })}\n`,
    );
  if (mode === "metadata-mismatch")
    process.stdout.write(
      `${JSON.stringify({ type: "system", subtype: "metadata", session_id: "00000000-0000-4000-8000-000000000000" })}\n`,
    );
  const responseId =
    mode === "wrong-correlation" ? "wrong" : request.request_id;
  const response =
    mode === "rejected"
      ? { subtype: "error", request_id: responseId }
      : { subtype: "success", request_id: responseId, response: {} };
  const metadata =
    mode === "fragmented"
      ? `${JSON.stringify({ type: "system", subtype: "ui_invalidate", text: "é" })}\r\n`
      : "";
  const output = Buffer.from(
    `${metadata}${JSON.stringify({ type: "control_response", response })}\r\n`,
  );
  if (mode === "fragmented") {
    const split = output.indexOf(Buffer.from("é")) + 1;
    process.stdout.write(output.subarray(0, split));
    setTimeout(() => process.stdout.write(output.subarray(split)), 5);
  } else process.stdout.write(output);
});
