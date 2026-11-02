import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function seedRunningSession(root, state, cwd) {
  const { openSessionDatabase } = await import(
    pathToFileURL(path.join(root, "dist/persistence/sqlite-database.js"))
  );
  const { SessionRepository } = await import(
    pathToFileURL(path.join(root, "dist/persistence/session-repository.js"))
  );
  await mkdir(state, { recursive: true, mode: 0o700 });
  const db = openSessionDatabase(path.join(state, "sessions.sqlite3"));
  try {
    new SessionRepository(db).create({
      id: "seed",
      harnessId: "claude-code",
      cwd,
      status: "running",
      createdAt: new Date().toISOString(),
    });
  } finally {
    db.close();
  }
}
