import { EventEmitter } from "node:events";
import type { EventEnvelope } from "./types.js";
import { eventEnvelopeSchema } from "./event-schema.js";

export class EventBus extends EventEmitter {
  private sequence = 0;
  publish(
    sessionId: string,
    type: string,
    data: Record<string, unknown> = {},
  ): EventEnvelope {
    const event: EventEnvelope = {
      apiVersion: "v1",
      eventId: ++this.sequence,
      sessionId,
      type,
      at: new Date().toISOString(),
      data,
    };
    eventEnvelopeSchema.parse(event);
    this.emit("event", event);
    return event;
  }
}
