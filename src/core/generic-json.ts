export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export class SafeValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SafeValidationError";
  }
}
