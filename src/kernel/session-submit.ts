import type {
  ImageInput,
  SessionRecord,
  SubmitOutcome,
} from "../interfaces/runtime-ports.js";
import type { RuntimeState } from "./runtime-state.js";
import { submitOutcome } from "./port-outcomes.js";
import { current, port, read } from "./store-access.js";
import { newId, writeGuard } from "./runtime-support.js";
import { setInput } from "./runtime-events.js";
import { settleSubmission } from "./session-submit-result.js";
import { resumeForInput } from "./session-resume-admission.js";
import { sessionId } from "./session-records.js";
import { validateImages } from "./session-images.js";

export async function submitInput(
  state: RuntimeState,
  id: string,
  text: string,
  images?: ImageInput[],
): Promise<{
  inputId: string;
  resumed: boolean;
  outcome?: "not-applied" | "unknown";
  failure?: string;
}> {
  if (!current(state) || state.closing) throw new Error("Runtime unavailable");
  id = sessionId(id);
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 256 * 1024)
    throw new Error("Invalid input");
  const safeImages = validateImages(images);
  const inputId = newId(state);
  let session: SessionRecord | undefined = read(state, id);
  if (!session) throw new Error("Session unavailable");
  const target = port(state, session.harnessId);
  if (!target.descriptor.capabilities.includes("input.submit"))
    throw new Error("Input unsupported");
  if (
    safeImages.length &&
    !target.descriptor.capabilities.includes("input.submit-images")
  )
    throw new Error("Image input unsupported");
  if (state.inputs.has(id)) throw new Error("Input busy");
  const admission = await resumeForInput(state, id, session);
  const resumed = admission.resumed;
  session = admission.session;
  if (admission.failed) return { inputId, resumed, outcome: "unknown" };
  if (
    !session ||
    session.status !== "running" ||
    state.closing ||
    state.stopping.has(id)
  )
    return { inputId, resumed, outcome: resumed ? "unknown" : "not-applied" };
  const epoch = state.sources.get(id)!;
  setInput(state, id, inputId, "pending");
  let outcome: SubmitOutcome;
  try {
    outcome = submitOutcome(
      await target.port.submit(
        id,
        {
          inputId,
          text,
          ...(images === undefined ? {} : { images: safeImages }),
        },
        () => writeGuard(state, id, epoch),
      ),
    );
  } catch {
    outcome = { kind: "uncertain" };
  }
  return {
    inputId,
    resumed,
    ...settleSubmission(state, id, inputId, epoch, outcome),
  };
}
