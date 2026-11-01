export type LeaseOp =
  | { op: "connect"; connectionId: string }
  | { op: "bind"; connectionId: string; sessionId: string }
  | {
      op: "request";
      connectionId: string;
      sessionId: string;
      callbackId: string;
      timeoutSeconds: number;
    }
  | {
      op: "result";
      connectionId: string;
      bindingId: string;
      callbackId: string;
    }
  | { op: "cancel"; callbackId: string }
  | { op: "unbind"; connectionId: string; bindingId: string }
  | { op: "disconnect"; connectionId: string }
  | { op: "advance"; seconds: number }
  | { op: "status"; sessionId: string };
