import type {
  PublicSession,
  SessionRecord,
} from "../interfaces/runtime-ports.js";
import { copySafeJson } from "./safe-json.js";
import { cleanCheckpoint } from "./checkpoint-data.js";

export function sessionId(id: unknown): string {
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id))
    throw new Error("Invalid identifier");
  return id;
}

export function cleanRecord(session: SessionRecord): SessionRecord {
  try {
    if (
      !session ||
      !["starting", "running", "stopped", "failed", "uncertain"].includes(
        session.status,
      )
    )
      throw new Error();
    const clean: SessionRecord = {
      id: sessionId(session.id),
      harnessId: session.harnessId,
      cwd: session.cwd,
      status: session.status,
    };
    if (typeof clean.harnessId !== "string" || typeof clean.cwd !== "string")
      throw new Error();
    if (session.createdAt !== undefined) {
      if (
        typeof session.createdAt !== "string" ||
        !Number.isFinite(Date.parse(session.createdAt))
      )
        throw new Error();
      clean.createdAt = session.createdAt;
    }
    if (session.adapterState !== undefined)
      clean.adapterState = copySafeJson(session.adapterState, 65536, 32);
    if (session.name !== undefined) {
      if (typeof session.name !== "string") throw new Error();
      clean.name = session.name;
    }
    if (session.nativeSessionId !== undefined) {
      if (typeof session.nativeSessionId !== "string") throw new Error();
      clean.nativeSessionId = session.nativeSessionId;
    }
    if (session.adapterOptions !== undefined)
      clean.adapterOptions = copySafeJson(
        session.adapterOptions,
        8192,
        5,
      ) as Record<string, unknown>;
    if (session.failureReason !== undefined) {
      if (
        typeof session.failureReason !== "string" ||
        !/^[A-Z0-9_]{1,64}$/.test(session.failureReason)
      )
        throw new Error();
      clean.failureReason = session.failureReason;
    }
    if (session.failedAt !== undefined) {
      if (
        typeof session.failedAt !== "string" ||
        !Number.isFinite(Date.parse(session.failedAt))
      )
        throw new Error();
      clean.failedAt = session.failedAt;
    }
    if (session.checkpoint !== undefined)
      clean.checkpoint = cleanCheckpoint(session.checkpoint);
    return structuredClone(clean);
  } catch {
    throw new Error("Invalid session record");
  }
}

export function publicSession(session: SessionRecord): PublicSession {
  const clean = cleanRecord(session);
  const safe: PublicSession = {
    id: clean.id,
    harnessId: clean.harnessId,
    cwd: clean.cwd,
    status: clean.status,
  };
  if (clean.name !== undefined) safe.name = clean.name;
  if (clean.nativeSessionId !== undefined)
    safe.nativeSessionId = clean.nativeSessionId;
  if (clean.adapterOptions !== undefined)
    safe.adapterOptions = clean.adapterOptions;
  if (clean.failureReason !== undefined)
    safe.failureReason = clean.failureReason;
  if (clean.failedAt !== undefined) safe.failedAt = clean.failedAt;
  return structuredClone(safe);
}
