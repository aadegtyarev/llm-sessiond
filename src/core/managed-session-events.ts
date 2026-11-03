import type { ManagedSessionView } from "./managed-session-view.js";
import { captureSession } from "./managed-session-view.js";
import type { ManagedInputEvent } from "./input-runtime-events.js";
export type { ManagedSessionView } from "./managed-session-view.js";
export type ManagedSessionEvent =
  | { kind: "session.changed"; session: ManagedSessionView }
  | { kind: "session.deleted"; sessionId: string }
  | {
      kind: "harness.event";
      sessionId: string;
      event: { kind: "output"; text: string };
    }
  | {
      kind: "harness.event";
      sessionId: string;
      event: {
        kind: "input";
        inputEvent: Pick<ManagedInputEvent, "inputId" | "state"> & {
          failure?: { reason: NonNullable<ManagedInputEvent["reason"]> };
        };
      };
    };
export interface ManagedSessionEventRecord {
  revision: number;
  event: ManagedSessionEvent;
}
export interface ManagedSessionSnapshot {
  afterRevision: number;
  sessions: ManagedSessionView[];
}
export interface ManagedSessionEventFeed {
  subscribe(listener: (record: ManagedSessionEventRecord) => void): () => void;
  snapshot(): ManagedSessionSnapshot;
}
export function cloneDomainEvent(
  event: ManagedSessionEvent,
): ManagedSessionEvent {
  if (event.kind === "session.changed")
    return {
      kind: event.kind,
      session: captureSession(
        event.session as Parameters<typeof captureSession>[0],
      ),
    };
  if (event.kind === "session.deleted") return { ...event };
  if (event.event.kind === "output")
    return { ...event, event: { ...event.event } };
  return {
    ...event,
    event: {
      kind: "input",
      inputEvent: {
        ...event.event.inputEvent,
        ...(event.event.inputEvent.failure
          ? { failure: { ...event.event.inputEvent.failure } }
          : {}),
      },
    },
  };
}
