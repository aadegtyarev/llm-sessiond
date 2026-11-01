export type PiDurableInputEvent = {
  inputId: string;
  state: "completed" | "uncertain" | "failed";
  reason?: "prompt_rejected";
};
