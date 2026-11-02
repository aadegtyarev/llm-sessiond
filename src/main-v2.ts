import { startV2 } from "./v2-bootstrap.js";

let stopping = false;
let shutdown: (() => Promise<void>) | undefined;
let finishing: Promise<void> | undefined;
const onSignal = (): void => {
  stopping = true;
  if (shutdown) void finishShutdown();
};
function finishShutdown(): Promise<void> {
  finishing ??= (async () => {
    try {
      await shutdown?.();
    } catch {
      console.error("llm-sessiond shutdown unconfirmed");
      process.exitCode = 1;
    } finally {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    }
  })();
  return finishing;
}

process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);
try {
  const application = await startV2(() => stopping);
  shutdown = application.shutdown;
  const address = application.server.address();
  if (typeof address === "object" && address)
    console.log(`llm-sessiond v2 listening on 127.0.0.1:${address.port}`);
  if (stopping) await finishShutdown();
} catch (error) {
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
  const cancelled =
    error instanceof Error && error.message === "STARTUP_CANCELLED";
  if (!cancelled) console.error("llm-sessiond v2 startup failed");
  process.exitCode = cancelled ? 0 : 1;
}
