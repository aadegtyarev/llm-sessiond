import type { DisplayValue, HarnessEvent, NativeRecord } from './types.ts';
import { claudeObject } from './claude-wire.ts';

// Ephemeral display association only: no turn completion or user/result resolver.
export function createClaudeEvents(emit: (event: HarnessEvent) => void) {
  const tools = new Map<string, { name: string; args: DisplayValue }>();
  // Block indexes are local to a native parent stream, not the whole channel.
  const assemblies = new Map<string | null, Map<number, { id: string; json: string }>>();
  function clear() { tools.clear(); assemblies.clear(); }
  function toolUse(value: unknown) {
    const block = claudeObject(value);
    if (block?.type !== 'tool_use' || typeof block.id !== 'string'
      || typeof block.name !== 'string' || !claudeObject(block.input)) return;
    const prior = tools.get(block.id);
    const args = block.input as DisplayValue;
    tools.set(block.id, { name: block.name, args });
    if (!prior) {
      emit({ type: 'tool', phase: 'start', toolCallId: block.id, toolName: block.name, args });
    } else {
      emit({ type: 'tool', phase: 'update', toolCallId: block.id,
        toolName: block.name, args, partialResult: args });
    }
  }
  function toolResult(value: unknown) {
    const block = claudeObject(value);
    if (block?.type !== 'tool_result' || typeof block.tool_use_id !== 'string'
      || !('content' in block) || ('is_error' in block && typeof block.is_error !== 'boolean')) return;
    const tool = tools.get(block.tool_use_id);
    if (!tool) return; // A native ID alone cannot invent the missing tool name/start.
    tools.delete(block.tool_use_id);
    emit({ type: 'tool', phase: 'end', toolCallId: block.tool_use_id, toolName: tool.name,
      result: block.content as DisplayValue, isError: block.is_error === true });
  }
  function event(record: NativeRecord) {
    if (record.type === 'result' || record.type === 'control_request'
      || record.type === 'control_cancel_request') {
      emit({ type: 'native-record', record });
    }
    const message = claudeObject(record.message);
    if (Array.isArray(message?.content)) {
      if (record.type === 'assistant') for (const block of message.content) toolUse(block);
      if (record.type === 'user') for (const block of message.content) toolResult(block);
    }
    if (record.type !== 'stream_event') return;
    const stream = claudeObject(record.event);
    const delta = claudeObject(stream?.delta);
    if (stream?.type === 'content_block_delta' && delta?.type === 'text_delta'
      && typeof delta.text === 'string') emit({ type: 'text', text: delta.text });
    const parent = record.parent_tool_use_id ?? null;
    if (parent !== null && typeof parent !== 'string') return;
    if (stream?.type === 'message_start' || stream?.type === 'message_stop') {
      assemblies.delete(parent);
      return; // Message assembly ends, not native tool execution.
    }
    if (typeof stream?.index !== 'number') return;
    let blocks = assemblies.get(parent);
    if (stream.type === 'content_block_start') {
      blocks?.delete(stream.index);
      const block = claudeObject(stream.content_block);
      if (block?.type === 'tool_use' && typeof block.id === 'string'
        && typeof block.name === 'string' && claudeObject(block.input)) {
        toolUse(block);
        if (!blocks) { blocks = new Map(); assemblies.set(parent, blocks); }
        blocks.set(stream.index, { id: block.id, json: '' });
      }
    }
    if (stream.type === 'content_block_delta' && delta?.type === 'input_json_delta'
      && typeof delta.partial_json === 'string') {
      const block = blocks?.get(stream.index);
      const tool = block && tools.get(block.id);
      if (!block || !tool) return;
      block.json += delta.partial_json;
      try {
        const args: unknown = JSON.parse(block.json);
        if (claudeObject(args)) tool.args = args as DisplayValue;
      } catch { /* A native partial JSON fragment is not a malformed wire frame. */ }
      emit({ type: 'tool', phase: 'update', toolCallId: block.id, toolName: tool.name,
        args: tool.args, partialResult: block.json });
    }
    // A content block ending is not the execution ending. Only tool_result is.
    if (stream.type === 'content_block_stop') blocks?.delete(stream.index);
    if (blocks?.size === 0) assemblies.delete(parent);
  }
  return { event, clear };
}
