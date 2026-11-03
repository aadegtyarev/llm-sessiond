export function deferUnsubscribe(unsubscribe: () => void): void {
  setImmediate(() => {
    try {
      unsubscribe();
    } catch {
      /* Detach only this observer. */
    }
  });
}
