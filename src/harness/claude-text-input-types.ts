export type ClaudeTextWriter = (
  record: string,
  callback: (error?: Error | null) => void,
) => void;
export type ClaudeInputEvent = {
  inputId: string;
  state: "accepted" | "completed" | "failed" | "uncertain";
};
