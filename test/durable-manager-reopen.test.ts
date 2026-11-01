import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HarnessRegistry } from "../src/core/adapter-registry.js";
import { DurableSessionManager } from "../src/core/durable-session-manager.js";
import { openSessionDatabase } from "../src/persistence/sqlite-database.js";
import { OwnedStoreLease } from "../src/persistence/owned-store.js";
import { SessionRepository } from "../src/persistence/session-repository.js";
import { synthetic } from "./durable-manager-support.js";
describe("durable manager SQLite persistence", () => {
  it("reopens launch status and adapter identity from the store", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "manager-reopen-"));
    const db = openSessionDatabase(path.join(dir, "state.sqlite"));
    const lease = await OwnedStoreLease.acquire(dir, db);
    try {
      const repository = new SessionRepository(db);
      const manager = new DurableSessionManager(
        repository,
        new HarnessRegistry([synthetic], "third"),
        {
          create: () => ({
            launch: async () => ({
              nativeSessionId: "native",
              checkpoint: {
                namespace: "synthetic.audit",
                version: 3,
                data: { key: "v" },
              },
            }),
            resume: async () => ({}),
            stop: async () => {},
          }),
        },
        lease.generation,
        () => "sqlite-session",
      );
      const cwd = await realpath(process.cwd());
      const created = await manager.create({
        cwd,
        options: { profile: "persisted" },
      });
      expect(created.status).toBe("running");
      await manager.stop(created.id);
      await lease.release();
      db.close();
      const reopened = openSessionDatabase(path.join(dir, "state.sqlite"));
      const nextLease = await OwnedStoreLease.acquire(dir, reopened);
      try {
        const repository = new SessionRepository(reopened);
        const row = repository.get("sqlite-session");
        expect(row?.status).toBe("stopped");
        expect(row?.cwd).toBe(cwd);
        expect(row?.adapterOptions).toEqual({ profile: "persisted" });
        const resumeCalls: unknown[] = [];
        let launches = 0;
        const reopenedManager = new DurableSessionManager(
          repository,
          new HarnessRegistry([synthetic], "third"),
          {
            create: () => ({
              launch: async () => {
                launches++;
                return {};
              },
              resume: async (input) => {
                resumeCalls.push(input);
                return {
                  ...(input.checkpoint ? { checkpoint: input.checkpoint } : {}),
                  ...(input.nativeSessionId
                    ? { nativeSessionId: input.nativeSessionId }
                    : {}),
                };
              },
              stop: async () => {},
            }),
          },
          nextLease.generation,
        );
        await reopenedManager.resume("sqlite-session");
        expect(launches).toBe(0);
        expect(resumeCalls[0]).toMatchObject({
          cwd,
          options: { profile: "persisted" },
          nativeSessionId: "native",
          checkpoint: { data: { key: "v" } },
        });
      } finally {
        await nextLease.release();
        reopened.close();
      }
    } finally {
      if (db.isOpen) db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
