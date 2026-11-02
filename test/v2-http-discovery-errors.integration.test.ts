import { describe, expect, it } from "vitest";
import { ApiError } from "../src/core/api-error.js";
import { SERVICE_VERSION } from "../src/api/service-version.js";
import { createDiscoveryFixture } from "./v2-http-discovery-fixture.js";
import { expectSafeError } from "./v2-http-discovery-support.js";

describe("v2 discovery safe HTTP errors and package version", () => {
  it("hides every backend ApiError behind a complete strict 503 DTO", async () => {
    const fixture = await createDiscoveryFixture();
    const secret = new ApiError(
      500,
      "PRIVATE_CODE",
      "private message/cause/token",
    );
    const assertSafe = async (response: Response) => {
      const error = await expectSafeError(response, 503, "unavailable");
      expect(JSON.stringify(error)).not.toContain("PRIVATE");
      expect(JSON.stringify(error)).not.toContain("private message");
    };
    try {
      await expectSafeError(
        await fetch(`${fixture.base}/api/v2/no-such-route`),
        404,
        "not-found",
      );
      const realFence = fixture.runtime.assertReady.bind(fixture.runtime);
      fixture.runtime.assertReady = () => {
        throw secret;
      };
      await assertSafe(await fetch(`${fixture.base}/api/v2/health`));
      fixture.runtime.assertReady = realFence;
      const realList = fixture.runtime.registry.list.bind(
        fixture.runtime.registry,
      );
      fixture.runtime.registry.list = () => {
        throw secret;
      };
      await assertSafe(await fetch(`${fixture.base}/api/v2/harnesses`));
      fixture.runtime.registry.list = realList;
      Object.defineProperty(fixture.adapter.descriptor, "id", {
        configurable: true,
        enumerable: true,
        get: () => {
          throw secret;
        },
      });
      await assertSafe(await fetch(`${fixture.base}/api/v2/harnesses`));
      Object.defineProperty(fixture.adapter.descriptor, "id", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: "third-party",
      });
      Object.defineProperty(fixture.other.descriptor, "id", {
        configurable: true,
        enumerable: true,
        get: () => {
          throw secret;
        },
      });
      await assertSafe(await fetch(`${fixture.base}/api/v2/harnesses`));
    } finally {
      await fixture.dispose();
    }
  });
  it("uses packaged llm-sessiond version despite environment changes", async () => {
    const fixture = await createDiscoveryFixture();
    const previous = process.env.npm_package_version;
    try {
      process.env.npm_package_version = "99.9.9";
      const first = await fetch(`${fixture.base}/api/v2/health`).then((r) =>
        r.json(),
      );
      process.env.npm_package_version = "88.8.8";
      const second = await fetch(`${fixture.base}/api/v2/health`).then((r) =>
        r.json(),
      );
      expect(first.serviceVersion).toBe(SERVICE_VERSION);
      expect(second.serviceVersion).toBe(SERVICE_VERSION);
      expect(SERVICE_VERSION).toBe("0.1.0");
    } finally {
      if (previous === undefined) delete process.env.npm_package_version;
      else process.env.npm_package_version = previous;
      await fixture.dispose();
    }
  });
});
