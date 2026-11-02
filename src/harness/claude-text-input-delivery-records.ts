import { classifyClaudeInputRecord } from "./claude-text-input-protocol.js";
export type ClaudeDeliveryRecord =
  ReturnType<typeof classifyClaudeInputRecord> | "out-of-order";

export class ClaudeTextInputDeliveryRecords {
  ack = false;
  outcome?: "success" | "failure";
  constructor(
    private readonly sessionId: string,
    private readonly text: string,
  ) {}
  record(line: string): ClaudeDeliveryRecord {
    const record = classifyClaudeInputRecord(line, this.sessionId, this.text);
    if (record === "ack") this.ack = true;
    else if (record === "success" || record === "failure") {
      if (!this.ack) return "out-of-order";
      this.outcome = record;
    }
    return record;
  }
}
