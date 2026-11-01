import { PiHarnessAdapter } from "./harness/pi-adapter.js";
import { SessionService } from "./core/session-service.js";
import { NodeProcessProvider } from "./process/node-provider.js";
import { createApiServer } from "./api/server.js";

const service = new SessionService(
  new PiHarnessAdapter(new NodeProcessProvider()),
);
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4317);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("PORT must be a valid TCP port");
const server = createApiServer(service, host);
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  console.log(
    `llm-sessiond listening on 127.0.0.1:${typeof address === "object" && address ? address.port : port}`,
  );
});
const shutdown = (): void => {
  server.close();
  void service.shutdown().finally(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
