export const dialogs = [
  { type: 'extension_ui_request', id: 'confirm-id', method: 'confirm', title: 'fixture confirm', message: 'benign?' },
  { type: 'extension_ui_request', id: 'select-id', method: 'select', title: 'fixture select', options: ['blue', 'green'] },
  { type: 'extension_ui_request', id: 'input-id', method: 'input', title: 'fixture input', placeholder: 'word' },
];
export const tools = [
  { type: 'tool_execution_start', toolCallId: 'tool-id', toolName: 'fixture', args: { nested: ['x'] } },
  { type: 'tool_execution_update', toolCallId: 'tool-id', toolName: 'fixture', args: {}, partialResult: { content: ['partial'] } },
  { type: 'tool_execution_end', toolCallId: 'tool-id', toolName: 'fixture', result: { content: ['final'] }, isError: false, durationMs: 3 },
];
export const notifications = [
  { type: 'extension_ui_request', id: 'status', method: 'setStatus', statusKey: 'fixture', statusText: 'waiting' },
  { type: 'extension_ui_request', id: 'clear', method: 'setStatus', statusKey: 'fixture' },
  { type: 'extension_ui_request', id: 'notify', method: 'notify', message: 'benign' },
];
export const answers = [
  { requestId: 'confirm-id', method: 'confirm' as const, confirmed: true },
  { requestId: 'select-id', method: 'select' as const, value: 'blue' },
  { requestId: 'input-id', method: 'input' as const, value: 'hello' },
] as const;
