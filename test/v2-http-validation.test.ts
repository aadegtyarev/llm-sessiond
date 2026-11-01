import { describe, expect, it } from "vitest";
import { load } from "./v2-fixture-support.js";
import { validateHttp } from "./v2-http-schema.js";

describe("strict API v2 HTTP fixture schemas", () => {
  it("accepts exact route-specific methods, paths, statuses, bodies", () => {
    const files = [
      "http-core.json",
      "http-lifecycle.json",
      "http-inputs.json",
      "http-capabilities.json",
    ];
    const rows = files.flatMap((file) => load(file).routes);
    rows.push(load("http-edge-cases.json").extensionRoute);
    for (const row of rows) expect(validateHttp(row)).toBe(true);
    expect(rows.map(([method, path]: string[]) => `${method} ${path}`)).toEqual(
      [
        "GET /health",
        "GET /harnesses",
        "GET /sessions",
        "POST /sessions",
        "GET /sessions/S1",
        "PATCH /sessions/S1",
        "DELETE /sessions/S1",
        "POST /sessions/S1/stop",
        "POST /sessions/S1/resume",
        "POST /sessions/S1/inputs",
        "POST /sessions/S1/inputs/opaque.input-1/cancel",
        "POST /sessions/S1/cancel-current",
        "GET /sessions/S1/status",
        "GET /sessions/S1/models",
        "POST /sessions/S1/model",
        "GET /sessions/S1/efforts",
        "POST /sessions/S1/effort",
        "GET /sessions/S1/options",
        "PATCH /sessions/S1/options",
        "GET /sessions/S1/commands",
        "POST /sessions/S1/extensions/third-harness.audit/inspect",
      ],
    );
    const caps = load("http-capabilities.json");
    expect(caps.usageVariants).toEqual([
      { usage: {} },
      { usage: { contextTokens: null, contextPercent: null } },
    ]);
    expect(
      validateHttp([
        "GET",
        "/sessions/S1/status",
        200,
        null,
        {
          session: {
            id: "S1",
            harnessId: "x",
            cwd: "/work",
            status: "running",
          },
          live: { usage: caps.usageVariants[0].usage },
        },
      ]),
    ).toBe(true);
    expect(
      validateHttp([
        "GET",
        "/sessions/S1/status",
        200,
        null,
        {
          session: {
            id: "S1",
            harnessId: "x",
            cwd: "/work",
            status: "running",
          },
          live: { usage: caps.usageVariants[1].usage },
        },
      ]),
    ).toBe(true);
    expect(
      caps.routes.find(
        (row: unknown[]) =>
          row[0] === "POST" && row[1] === "/sessions/S1/model",
      )[4].effortConfirmed,
    ).toBe(false);
  });
});
