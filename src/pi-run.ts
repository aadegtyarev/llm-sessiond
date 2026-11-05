import type { HarnessEvent, PortOutcome } from './types.ts';
import { object, type RecordValue } from './pi-wire.ts';
import { assistantStopReason } from './pi-assistant.ts';

type Input = { inputId: string; started: boolean; boundary: boolean; reason?: unknown };
export function createPiRun(emit: (event: HarnessEvent) => void) {
  let input: Input | null = null;
  let blocked = false;
  let nativeActive = false;
  let cancelling: Input | null = null;
  let cancellationSettlement: RecordValue | null = null;
  function uncertain() {
    blocked = true;
    const previous = input;
    input = null;
    if (previous?.started) emit({
      type: 'input-failed', inputId: previous.inputId, certainty: 'unknown',
    });
  }
  function begin(inputId: string) {
    if (blocked || input || nativeActive || cancelling) return null;
    const owned: Input = { inputId, started: false, boundary: false };
    input = owned;
    return owned;
  }
  function acknowledge(owned: Input, record: RecordValue): PortOutcome {
    if (input !== owned) return { kind: 'unknown' };
    if (record.success === false) { input = null; return { kind: 'rejected' }; }
    if (object(record.data).disposition !== 'started' || nativeActive) {
      uncertain();
      return { kind: 'unknown' };
    }
    owned.started = true;
    return { kind: 'confirmed' };
  }
  async function cancel(inputId: string, abort: () => Promise<RecordValue | null>): Promise<PortOutcome> {
    const owned = input;
    if (blocked || cancelling || !owned?.started || !owned.boundary
      || owned.inputId !== inputId || !nativeActive) return { kind: 'rejected' };
    cancelling = owned; // Reserve synchronously, before writing an untargeted native abort.
    const response = await abort();
    const settlement = cancellationSettlement;
    cancelling = null;
    cancellationSettlement = null;
    if (response?.success === true && settlement && input === owned && !blocked) {
      // Native abort ACK awaits idle; own settled.aborted is independent of LLM DTO.
      input = null;
      emit({ type: 'input-cancelled', inputId: owned.inputId });
      return { kind: 'confirmed' };
    }
    // A natural terminal already published is never rewritten by a late abort response.
    if (response?.success === false && !settlement) return { kind: 'rejected' };
    if (input === owned) uncertain();
    return { kind: 'unknown' };
  }
  function finish(record: RecordValue, owned: Input) {
    input = null; // Clear before publishing: a subscriber may submit the next input.
    const success = record.aborted === false && owned.reason === 'stop';
    const failure = (record.aborted === false && owned.reason === 'error')
      || (record.aborted === true && owned.reason === 'aborted');
    if (!success && !failure) blocked = true;
    emit(success ? { type: 'input-completed', inputId: owned.inputId } : {
        type: 'input-failed', inputId: owned.inputId,
        certainty: failure ? 'definitive' : 'unknown',
      });
  }
  function event(record: RecordValue) {
    if (blocked) {
      publishText(record);
      return;
    }
    if (record.type === 'agent_start') {
      nativeActive = true;
      if (cancelling) { uncertain(); return; }
      if (input?.started) { input.boundary = true; input.reason = undefined; }
      else if (input) uncertain(); // A run before our ACK cannot be claimed later.
    }
    if (record.type === 'message_end' && input?.boundary) {
      if (cancellationSettlement) { uncertain(); return; }
      const message = object(record.message);
      if (message.role === 'assistant' || typeof message.role !== 'string') {
        // A malformed later assistant must discard any earlier terminal evidence.
        input.reason = assistantStopReason(record.message);
      }
    }
    if (record.type === 'agent_settled') {
      if (cancellationSettlement) { uncertain(); return; }
      nativeActive = false;
      const owned = input;
      if (!owned) return;
      if (!owned.started || !owned.boundary) { uncertain(); return; }
      if (cancelling === owned && record.aborted === true) {
        cancellationSettlement = record; // ACK must drain before admission can reopen.
      } else finish(record, owned);
    }
    publishText(record);
  }
  function publishText(record: RecordValue) {
    const update = object(record.assistantMessageEvent);
    if (record.type === 'message_update' && update.type === 'text_delta'
      && typeof update.delta === 'string') emit({ type: 'text', text: update.delta });
  }
  return { begin, acknowledge, uncertain, event, cancel };
}
