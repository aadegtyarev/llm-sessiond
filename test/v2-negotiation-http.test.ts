import { describe, expect, it } from "vitest";
import { load } from "./v2-fixture-support.js";

describe("v2 negotiation and HTTP golden fixtures", () => {
  it("checks negotiation, opaque identity, and instance mismatch", () => {
    const f = load("negotiation.json");
    expect(f.health).toMatchObject({
      apiVersion: "v2",
      protocolRevision: 1,
      status: "ready",
      supportedApiVersions: ["v1", "v2"],
    });
    expect(f.opaqueIds.sessionId).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
    expect(f.opaqueIds.caseDistinct[0]).not.toBe(f.opaqueIds.caseDistinct[1]);
    expect(f.registry.harnesses[0].aliases).toContain("alt-third");
    expect(f.instanceMismatch).toMatchObject({
      expectedStatus: 503,
      expectedOutcome: "not-applied",
    });
  });
  it("covers every documented HTTP method, route, status, request, and response", () => {
    const fixtures = [
      "http-core.json",
      "http-lifecycle.json",
      "http-inputs.json",
      "http-capabilities.json",
    ];
    const routes = fixtures
      .flatMap((name) => load(name).routes)
      .map(([method, path]: string[]) => `${method} ${path}`);
    expect(routes).toEqual([
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
    ]);
    expect(
      fixtures
        .flatMap((name) => load(name).routes)
        .every((route: unknown[]) => route.length === 5),
    ).toBe(true);
    const life = load("http-lifecycle.json").routes;
    expect(life.find((route: unknown[]) => route[0] === "PATCH")[3]).toEqual({
      name: null,
    });
    expect(
      load("http-capabilities.json").routes.find(
        (route: unknown[]) => route[0] === "PATCH",
      )[3],
    ).toEqual({ resetKeys: ["layout"] });
    const edge = load("http-edge-cases.json");
    expect(edge.partialSubmit.error).toMatchObject({
      outcome: "unknown",
      resumed: true,
    });
    expect(edge.extension).toMatchObject({ method: "POST", status: 200 });
    const caps = load("http-capabilities.json");
    expect(caps.usageVariants).toEqual([
      { usage: {} },
      { usage: { contextTokens: null, contextPercent: null } },
    ]);
    expect(
      caps.routes.find(
        (route: unknown[]) =>
          route[0] === "POST" && route[1] === "/sessions/S1/model",
      )[4].effortConfirmed,
    ).toBe(false);
  });
});
