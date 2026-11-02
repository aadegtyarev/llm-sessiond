export interface LiveUsage {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  contextTokens?: number | null;
  contextWindow?: number;
  contextPercent?: number | null;
}
export interface LiveModel {
  provider: string;
  id: string;
  name: string;
}
export interface LiveStatus {
  model?: LiveModel;
  effort?: string;
  usage?: LiveUsage;
}
export interface LiveStatusExecutionPort {
  readLiveStatus(): Promise<LiveStatus>;
}
