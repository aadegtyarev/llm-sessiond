import type { HarnessEvent, NativeQuestion, QuestionReply, ReplyOutcome } from './types.ts';
import { interactionEvent } from './pi-interaction-events.ts';
import type { RecordValue } from './pi-wire.ts';

type PendingQuestion = { question: NativeQuestion; expires: number; used: boolean; ambiguous: boolean;
  written: boolean; noLongerPending: boolean };

export function createPiQuestions(
  emit: (event: HarnessEvent) => void,
  write: (record: RecordValue) => Promise<ReplyOutcome>,
) {
  const requests = new Map<string, PendingQuestion>();
  let lost = false;
  let unsupportedDialog = false;
  function invalidate() { lost = true; }
  function event(record: RecordValue) {
    if (record.type === 'extension_ui_request' && record.method === 'editor') unsupportedDialog = true;
    // A repeated ID, even malformed, cannot silently replace an earlier request.
    if (record.type === 'extension_ui_request' && typeof record.id === 'string') {
      const previous = requests.get(record.id);
      if (previous) { previous.ambiguous = true; return; }
    }
    const observation = interactionEvent(record);
    if (record.type === 'extension_ui_request' && ['confirm', 'select', 'input'].includes(String(record.method))
      && observation?.type !== 'question') unsupportedDialog = true;
    if (!observation || lost) return;
    if (observation.type === 'question') {
      const request = observation.question;
      const timeout = request.timeout;
      requests.set(request.requestId, { question: request, used: false, ambiguous: false, written: false, noLongerPending: false,
        expires: timeout ? performance.now() + (timeout > 2_147_483_647 ? 1 : timeout) : Infinity });
    }
    emit(observation);
  }
  function barrier() {
    // Capture BEFORE get_state dispatch. Pi RPC consumes UI lines synchronously before
    // handling the following command (rpc-mode handleInputLine). Its correlated idle
    // readback proves these IDs no longer pending, not whether Pi consumed or expired them.
    const written = [...requests.values()].filter(request => request.written && !request.ambiguous);
    return () => { if (!lost) for (const request of written) if (!request.ambiguous) request.noLongerPending = true; };
  }
  return { event, invalidate, reply, barrier,
    get quiescent() {
      return !lost && !unsupportedDialog && [...requests.values()].every(request => !request.ambiguous && request.noLongerPending);
    },
    get controlAdmissible() {
      return !lost && !unsupportedDialog && [...requests.values()].every(request =>
        !request.ambiguous && (request.noLongerPending || request.written));
    },
  };

  async function reply(answer: QuestionReply): Promise<ReplyOutcome> {
    if (lost) return { kind: 'unknown' };
    if (!answer || typeof answer.requestId !== 'string') return { kind: 'rejected' };
    const pending = requests.get(answer.requestId);
    if (!pending) return { kind: 'rejected' };
    if (pending.ambiguous || performance.now() >= pending.expires) return { kind: 'unknown' };
    if (pending.used || answer.method !== pending.question.method) return { kind: 'rejected' };
    const record: RecordValue = { type: 'extension_ui_response', id: answer.requestId };
    if ('cancelled' in answer) {
      if (answer.cancelled !== true || 'value' in answer || 'confirmed' in answer) return { kind: 'rejected' };
      record.cancelled = true;
    } else if (answer.method === 'confirm') {
      if (typeof answer.confirmed !== 'boolean' || 'value' in answer) return { kind: 'rejected' };
      record.confirmed = answer.confirmed;
    } else {
      if (typeof answer.value !== 'string' || 'confirmed' in answer) return { kind: 'rejected' };
      if (pending.question.method === 'select' && !pending.question.options.includes(answer.value)) {
        return { kind: 'rejected' };
      }
      record.value = answer.value;
    }
    // Claim before the write: concurrent duplicate answers never replay a response.
    pending.used = true;
    try {
      const result = await write(record);
      pending.written = result.kind === 'written';
      return result;
    } catch { invalidate(); return { kind: 'unknown' }; }
  }
}
