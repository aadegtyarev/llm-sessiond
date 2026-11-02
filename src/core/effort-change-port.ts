export type EffortChangeOutcome = "applied" | "not-applied" | "unknown";

export interface EffortChangeCallContext {
  readonly expectedNativeSessionId?: string;
  isCurrent(): boolean;
  remainingMs(): number;
  beforeMutationWrite(): boolean;
}

export interface EffortChangeExecutionPort {
  changeEffort(
    level: string,
    context: EffortChangeCallContext,
  ): Promise<unknown>;
}
