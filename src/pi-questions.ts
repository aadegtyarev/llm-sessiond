import type { HarnessEvent, QuestionMethod, QuestionReply, ReplyOutcome } from './types.ts';
import { interactionEvent } from './pi-interaction-events.ts';
import type { RecordValue } from './pi-wire.ts';

export function createPiQuestions(
  emit: (event: HarnessEvent) => void,
  write: (record: RecordValue) => Promise<ReplyOutcome>,
) {
  const requests = new Map<string, QuestionMethod>();
  let lost = false;
  function invalidate() { lost = true; requests.clear(); }
  function event(record: RecordValue) {
    const observation = interactionEvent(record);
    if (!observation || lost) return;
    if (observation.type === 'question') {
      requests.set(observation.question.requestId, observation.question.method);
    }
    emit(observation);
  }
  return { event, invalidate, reply };

  async function reply(answer: QuestionReply): Promise<ReplyOutcome> {
    if (lost) return { kind: 'unknown' };
    if (!answer || typeof answer.requestId !== 'string') return { kind: 'rejected' };
    if (requests.get(answer.requestId) !== answer.method) return { kind: 'rejected' };
    const record: RecordValue = { type: 'extension_ui_response', id: answer.requestId };
    if ('cancelled' in answer) {
      if (answer.cancelled !== true || 'value' in answer || 'confirmed' in answer) return { kind: 'rejected' };
      record.cancelled = true;
    } else if (answer.method === 'confirm') {
      if (typeof answer.confirmed !== 'boolean' || 'value' in answer) return { kind: 'rejected' };
      record.confirmed = answer.confirmed;
    } else {
      if (typeof answer.value !== 'string' || 'confirmed' in answer) return { kind: 'rejected' };
      record.value = answer.value;
    }
    try { return await write(record); }
    catch { invalidate(); return { kind: 'unknown' }; }
  }
}
