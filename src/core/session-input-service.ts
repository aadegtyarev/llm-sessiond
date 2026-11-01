import type { HarnessSession } from "./ports.js";
import type { EventBus } from "./event-bus.js";
import type { SessionInput, SessionRecord } from "./types.js";
import { ApiError } from "./api-error.js";

export class SessionInputService {
  async submit(
    record: SessionRecord,
    runtime: HarnessSession,
    events: EventBus,
    input: SessionInput,
  ): Promise<string> {
    if (record.currentInput || record.pendingSubmit !== undefined)
      throw new ApiError(
        409,
        "INPUT_BUSY",
        "session already has an active input",
      );
    const bytes = (input.images ?? []).reduce(
      (sum, image) => sum + Buffer.from(image.data, "base64").length,
      0,
    );
    if (bytes > 20 * 1024 * 1024)
      throw new ApiError(413, "LIMIT_EXCEEDED", "images exceed size limit");
    const token = ++record.submitSequence;
    const generation = record.runtimeGeneration;
    record.pendingSubmit = token;
    try {
      const inputId = await runtime.submit(input.text, input.images);
      if (
        generation !== record.runtimeGeneration ||
        record.pendingSubmit !== token
      ) {
        if (runtime.isInputActive(inputId))
          events.publish(record.id, "input.state", {
            inputId,
            state: "uncertain",
            reason: "session stopped during submit",
          });
        throw new ApiError(
          409,
          "INPUT_UNCERTAIN",
          "input was interrupted by session lifecycle",
        );
      }
      if (runtime.isInputActive(inputId)) {
        record.currentInput = inputId;
        events.publish(record.id, "input.state", {
          inputId,
          state: "accepted",
        });
        runtime.acceptInput(inputId);
      }
      return inputId;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (String(error).includes("SESSION_INPUT_BUSY"))
        throw new ApiError(
          409,
          "INPUT_BUSY",
          "session already has an active input",
        );
      const uncertain =
        String(error).includes("UNCERTAIN") ||
        String(error).includes("TIMEOUT");
      throw new ApiError(
        uncertain ? 409 : 500,
        uncertain ? "INPUT_UNCERTAIN" : "INPUT_FAILED",
        uncertain
          ? "input delivery is uncertain; do not retry"
          : "input could not be submitted",
      );
    } finally {
      if (record.pendingSubmit === token) record.pendingSubmit = undefined;
    }
  }
  async cancel(
    record: SessionRecord,
    runtime: HarnessSession,
    events: EventBus,
    inputId: string,
  ): Promise<void> {
    if (record.currentInput !== inputId)
      throw new ApiError(409, "INPUT_NOT_CURRENT", "input is not current");
    try {
      await runtime.cancel(inputId);
    } catch {
      throw new ApiError(
        409,
        "CANCEL_FAILED",
        "input could not be cancelled safely",
      );
    }
  }
}
