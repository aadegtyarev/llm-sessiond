// Loaded by native Pi, not an SDK bridge. No runtime Pi package dependency.
export const RELOAD_ENV = 'LLM_SESSIOND_RELOAD_COMMAND';
export const RELOAD_DESCRIPTION = 'llm-sessiond internal reload command';

interface ReloadAPI {
  registerCommand(name: string, command: {
    description: string;
    handler(args: string, context: { reload(): Promise<void> }): Promise<void>;
  }): void;
}

export default function reloadExtension(pi: ReloadAPI): void {
  const name = process.env[RELOAD_ENV];
  if (!name || !/^llm-sessiond-reload-[0-9a-f-]{36}$/.test(name)) return;
  pi.registerCommand(name, {
    description: RELOAD_DESCRIPTION,
    async handler(_args, context) { await context.reload(); return; },
  });
}
