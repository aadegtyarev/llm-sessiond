export const boundary = { type: 'agent_start' };
export const message = (stopReason: string) => ({
  type: 'message_end', message: {
    role: 'assistant', stopReason, content: [{ type: 'text', text: 'private duplicate' }],
    api: 'fake-api', provider: 'fake-provider', model: 'fake-model', timestamp: 1,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  },
});
export const settled = (aborted: unknown = false) => ({ type: 'agent_settled', aborted });
export const final = (reason = 'stop', aborted: unknown = false) => [
  boundary, message(reason), { type: 'agent_end', willRetry: false }, settled(aborted),
];
