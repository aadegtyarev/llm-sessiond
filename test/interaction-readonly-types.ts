import type { CoreEvent } from '../src/types.ts';

// Compile-only regression: tsc must reject mutation of every new public field.
function interactionFieldsAreReadonly(event: CoreEvent): void {
  if (event.type === 'tool') {
    // @ts-expect-error public discriminant is immutable
    event.type = 'tool';
    // @ts-expect-error public session identity is immutable
    event.sessionId = 'changed';
    // @ts-expect-error public phase is immutable
    event.phase = event.phase;
    // @ts-expect-error public tool identity is immutable
    event.toolCallId = 'changed';
    // @ts-expect-error public tool name is immutable
    event.toolName = 'changed';
    if (event.phase === 'start' || event.phase === 'update') {
      // @ts-expect-error public args are immutable
      event.args = {};
    }
    if (event.phase === 'update') {
      // @ts-expect-error public partial result is immutable
      event.partialResult = {};
    }
    if (event.phase === 'end') {
      // @ts-expect-error public result is immutable
      event.result = {};
      // @ts-expect-error public failure evidence is immutable
      event.isError = true;
      // @ts-expect-error public duration is immutable
      event.durationMs = 0;
    }
  }
  if (event.type === 'question') {
    // @ts-expect-error question discriminant is immutable
    event.type = 'question';
    // @ts-expect-error question payload reference is immutable
    event.question = event.question;
  }
  if (event.type === 'notification') {
    // @ts-expect-error notification discriminant is immutable
    event.type = 'notification';
    // @ts-expect-error notification method is immutable
    event.method = event.method;
    if (event.method === 'setStatus') {
      // @ts-expect-error public status key is immutable
      event.statusKey = 'changed';
      // @ts-expect-error public status text is immutable
      event.statusText = 'changed';
    } else {
      // @ts-expect-error public message is immutable
      event.message = 'changed';
      // @ts-expect-error public severity is immutable
      event.level = 'warning';
    }
  }
}
