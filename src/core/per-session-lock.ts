export class PerSessionLock {
  private readonly locks = new Map<string, Promise<void>>();
  async run<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(id, current);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.locks.get(id) === current) this.locks.delete(id);
    }
  }
}
