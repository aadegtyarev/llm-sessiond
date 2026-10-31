import type { ChildProcess } from "node:child_process";
import type { ImageInput, SessionRecord } from "./types.js";

export interface ProcessProvider {
  launch(executable: string, args: string[], cwd: string): ChildProcess;
  shutdown?(): Promise<void>;
}
export interface HarnessAdapter {
  readonly id: string;
  launch(session: SessionRecord, nativeId?: string): Promise<HarnessSession>;
  shutdown?(): Promise<void>;
}
export interface HarnessSession {
  readonly child: ChildProcess;
  readonly nativeSessionId: string;
  submit(text: string, images?: ImageInput[]): Promise<string>;
  cancel(inputId: string): Promise<void>;
  isInputActive(inputId: string): boolean;
  acceptInput(inputId: string): void;
  stop(): Promise<void>;
  onEvent(
    listener: (type: string, data: Record<string, unknown>) => void,
  ): void;
}
