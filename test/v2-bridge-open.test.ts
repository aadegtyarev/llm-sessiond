import { expect, it, vi } from "vitest";
import { handleV2Frame } from "../src/api/v2-bridge-open.js";

it("fails callback-bearing open without acknowledging it", () => {
  const client = { bufferedAmount: 0, send: vi.fn(), close: vi.fn() };
  const open = {
    apiVersion: "v2",
    type: "client.open",
    requestId: "r",
    protocolRevision: 1,
    callbacks: ["tool.permission"],
  };
  expect(
    handleV2Frame(
      client as never,
      Buffer.from(JSON.stringify(open)),
      false,
      false,
      "boot",
      "conn",
    ),
  ).toBe("continue");
  expect(JSON.parse(client.send.mock.calls[0]![0] as string)).toMatchObject({
    type: "request.failed",
    requestId: "r",
  });
});
