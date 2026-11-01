import type {
  InputCommandOutcome,
  InputFailureReason,
} from "./execution-input-port.js";

const REASONS = new Set<InputFailureReason>([
  "prompt_rejected",
  "hold_timeout",
  "held_and_stopped",
  "canceled",
]);
export function normalizeInputOutcome(value: unknown): InputCommandOutcome {
  if (!value || typeof value !== "object") return { kind: "uncertain" };
  const row = value as Record<string, unknown>;
  if (row.kind === "accepted" && Object.keys(row).length === 1)
    return { kind: "accepted" };
  if (row.kind === "uncertain" && Object.keys(row).length === 1)
    return { kind: "uncertain" };
  if (
    row.kind === "rejected" &&
    Object.keys(row).sort().join(",") === "kind,reason" &&
    typeof row.reason === "string" &&
    REASONS.has(row.reason as InputFailureReason)
  )
    return { kind: "rejected", reason: row.reason as InputFailureReason };
  return { kind: "uncertain" };
}
export async function observeInputCommand(
  value: Promise<unknown>,
  timeoutMs: number,
): Promise<InputCommandOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<InputCommandOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "uncertain" }), timeoutMs);
  });
  const command = value.then(normalizeInputOutcome, () => ({
    kind: "uncertain" as const,
  }));
  void command.catch(() => {});
  const outcome = await Promise.race([command, timeout]);
  if (timer) clearTimeout(timer);
  return outcome;
}
