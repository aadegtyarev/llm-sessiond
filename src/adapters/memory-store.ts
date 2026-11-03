import type {
  SessionRecord,
  SessionStore,
} from "../interfaces/runtime-ports.js";

export class MemorySessionStore implements SessionStore {
  readonly #sessions = new Map<string, SessionRecord>();
  constructor(private readonly owner: () => boolean = () => true) {}

  assertOwner(): void {
    if (!this.owner()) throw new Error("Store owner unavailable");
  }

  read(id: string): SessionRecord | undefined {
    this.assertOwner();
    const value = this.#sessions.get(id);
    return value ? structuredClone(value) : undefined;
  }

  list(): SessionRecord[] {
    this.assertOwner();
    return [...this.#sessions.values()].map((value) => structuredClone(value));
  }

  write(session: SessionRecord): void {
    this.assertOwner();
    this.#sessions.set(session.id, structuredClone(session));
  }

  delete(id: string): void {
    this.assertOwner();
    this.#sessions.delete(id);
  }
}
