type InputEvents = {
  subscribe(
    listener: (event: {
      sessionId: string;
      inputId: string;
      state: string;
      reason?: string;
    }) => void,
  ): () => void;
};
export function waitForInputState(
  events: InputEvents,
  sessionId: string,
  state: string,
) {
  let unsubscribe = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<{
    sessionId: string;
    inputId: string;
    state: string;
    reason?: string;
  }>((resolve, reject) => {
    unsubscribe = events.subscribe((event) => {
      if (event.sessionId === sessionId && event.state === state)
        resolve(event);
    });
    timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${state}`)),
      2_000,
    );
  });
  return {
    promise,
    cleanup: () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    },
  };
}
