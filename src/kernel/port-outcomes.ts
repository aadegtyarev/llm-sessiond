import type {
  CancelOutcome,
  StartOutcome,
  StopOutcome,
  SubmitOutcome,
} from "../interfaces/runtime-ports.js";
import { copySafeJson } from "./safe-json.js";

export function submitOutcome(value: unknown): SubmitOutcome {
  try {
    if (!value || typeof value !== "object") return { kind: "uncertain" };
    const item = value as { kind?: unknown; reason?: unknown };
    if (item.kind === "accepted" || item.kind === "uncertain")
      return { kind: item.kind };
    if (
      item.kind === "rejected" &&
      [
        "prompt_rejected",
        "hold_timeout",
        "held_and_stopped",
        "canceled",
      ].includes(String(item.reason))
    )
      return {
        kind: "rejected",
        reason: item.reason as
          "prompt_rejected" | "hold_timeout" | "held_and_stopped" | "canceled",
      };
    return { kind: "uncertain" };
  } catch {
    return { kind: "uncertain" };
  }
}

export function cancelOutcome(value: unknown): CancelOutcome {
  try {
    if (!value || typeof value !== "object") return { kind: "uncertain" };
    const kind = (value as { kind?: unknown }).kind;
    return kind === "accepted" || kind === "rejected" || kind === "uncertain"
      ? { kind }
      : { kind: "uncertain" };
  } catch {
    return { kind: "uncertain" };
  }
}

export function stopOutcome(value: unknown): StopOutcome {
  try {
    return value &&
      typeof value === "object" &&
      (value as { kind?: unknown }).kind === "confirmed"
      ? { kind: "confirmed" }
      : { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  }
}

export function startOutcome(value: unknown): StartOutcome {
  try {
    if (!value || typeof value !== "object") return { kind: "uncertain" };
    const kind = (value as { kind?: unknown }).kind;
    if (kind === "failed" || kind === "uncertain") return { kind };
    if (kind !== "started") return { kind: "uncertain" };
    const result: Extract<StartOutcome, { kind: "started" }> = { kind };
    const nativeSessionId = (value as { nativeSessionId?: unknown })
      .nativeSessionId;
    if (nativeSessionId !== undefined) {
      if (typeof nativeSessionId !== "string") return { kind: "uncertain" };
      result.nativeSessionId = nativeSessionId;
    }
    const checkpoint = (value as { checkpoint?: unknown }).checkpoint;
    if (checkpoint !== undefined) {
      if (!checkpoint || typeof checkpoint !== "object")
        return { kind: "uncertain" };
      const item = checkpoint as {
        namespace?: unknown;
        version?: unknown;
        data?: unknown;
      };
      if (
        typeof item.namespace !== "string" ||
        !/^[a-z][a-z0-9._-]{0,63}$/.test(item.namespace) ||
        !Number.isSafeInteger(item.version) ||
        (item.version as number) < 1
      )
        return { kind: "uncertain" };
      result.checkpoint = {
        namespace: item.namespace,
        version: item.version as number,
        data: copySafeJson(item.data, 65536, 32),
      };
    }
    return result;
  } catch {
    return { kind: "uncertain" };
  }
}
