import type { HarnessEvent, NativeQuestion, QuestionReply, ReplyOutcome } from './types.ts';
import { interactionEvent } from './pi-interaction-events.ts';
import type { RecordValue } from './pi-wire.ts';

type PendingQuestion = { question: NativeQuestion; expires: number; used: boolean; ambiguous: boolean };

export function createPiQuestions(
  emit: (event: HarnessEvent) => void,
  write: (record: RecordValue) => Promise<ReplyOutcome>,
) {
  const requests = new Map<string, PendingQuestion>();
  let lost = false;
  function invalidate() { lost = true; }
  function event(record: RecordValue) {
    // A repeated ID, even malformed, cannot silently replace an earlier request.
    if (record.type === 'extension_ui_request' && typeof record.id === 'string') {
      const previous = requests.get(record.id);
      if (previous) { previous.ambiguous = true; return; }
    }
    const observation = interactionEvent(record);
    if (!observation || lost) return;
    if (observation.type === 'question') {
      const request = observation.question;
      const timeout = request.timeout;
      requests.set(request.requestId, { question: request, used: false, ambiguous: false,
        expires: timeout ? performance.now() + (timeout > 2_147_483_647 ? 1 : timeout) : Infinity });
    }
    emit(observation);
  }
  return { event, invalidate, reply };

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
    try { return await write(record); }
    catch { invalidate(); return { kind: 'unknown' }; }
  }
}
