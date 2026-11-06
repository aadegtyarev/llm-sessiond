function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function content(value: unknown, role: 'system' | 'user' | 'assistant' | 'toolResult' | 'edit'): boolean {
  if (typeof value === 'string') return role !== 'assistant' && role !== 'toolResult';
  if (!Array.isArray(value)) return false;
  return value.every(block => {
    if (!record(block)) return false;
    if (block.type === 'text') return typeof block.text === 'string';
    if (block.type === 'image') return role !== 'system' && role !== 'assistant'
      && typeof block.data === 'string' && typeof block.mimeType === 'string';
    if (role !== 'assistant' && role !== 'edit') return false;
    if (block.type === 'thinking') return typeof block.thinking === 'string';
    return block.type === 'toolCall' && typeof block.id === 'string'
      && typeof block.name === 'string' && record(block.arguments);
  });
}

function message(value: unknown, version: number): boolean {
  if (!record(value) || typeof value.role !== 'string') return false;
  switch (value.role) {
    case 'system':
      return content(value.content, 'system')
        && (value.sections === undefined || (record(value.sections)
          && Object.values(value.sections).every(section => section === null || typeof section === 'string')))
        && (value.toolsAdded === undefined || (Array.isArray(value.toolsAdded)
          && value.toolsAdded.every(tool => record(tool) && typeof tool.name === 'string'
            && typeof tool.description === 'string' && record(tool.parameters))))
        && (value.toolsRemoved === undefined || (Array.isArray(value.toolsRemoved)
          && value.toolsRemoved.every(tool => record(tool) && typeof tool.name === 'string')));
    case 'user': return content(value.content, 'user');
    case 'assistant': return content(value.content, 'assistant');
    case 'toolResult': return content(value.content, 'toolResult') && typeof value.toolCallId === 'string'
      && typeof value.toolName === 'string' && typeof value.isError === 'boolean';
    case 'hookMessage':
      if (version >= 3) return false; // Pi's v2→v3 migration renames this historical role.
      // Falls through: its context payload is the historical CustomMessage shape.
    case 'custom': return content(value.content, 'user') && typeof value.customType === 'string'
      && typeof value.display === 'boolean';
    case 'bashExecution': return typeof value.command === 'string' && typeof value.output === 'string'
      && typeof value.cancelled === 'boolean' && typeof value.truncated === 'boolean';
    case 'branchSummary': return typeof value.summary === 'string'
      && (value.fromId === null || typeof value.fromId === 'string');
    case 'compactionSummary': return typeof value.summary === 'string' && tokenCount(value.tokensBefore);
    default: return true; // AgentMessage permits augmented-host extension roles.
  }
}

// Pi 1.5 session-manager: sessionEntryToContextMessages/projectContextEntry and
// migrateV1ToV2. Validate required context payloads, not provider metadata or replay.
export function validNativeContextEntry(entry: Record<string, unknown>, version: number): boolean {
  switch (entry.type) {
    case 'message': return message(entry.message, version);
    case 'custom_message': return content(entry.content, 'user') && typeof entry.customType === 'string'
      && typeof entry.display === 'boolean';
    case 'branch_summary': return typeof entry.summary === 'string' && typeof entry.fromId === 'string';
    case 'compaction': return typeof entry.summary === 'string' && tokenCount(entry.tokensBefore)
      && (version === 1 ? Number.isInteger(entry.firstKeptEntryIndex) && Number(entry.firstKeptEntryIndex) >= 1
        : typeof entry.firstKeptEntryId === 'string')
      && (entry.systemMessage === undefined || (record(entry.systemMessage)
        && entry.systemMessage.role === 'system' && message(entry.systemMessage, version)));
    case 'context_edit': return typeof entry.targetId === 'string' && (entry.replacement === null
      || (record(entry.replacement) && content(entry.replacement.content, 'edit')));
    case 'model_change': return typeof entry.provider === 'string' && typeof entry.modelId === 'string';
    case 'thinking_level_change': return typeof entry.thinkingLevel === 'string';
    default: return true; // State/display-only and unknown extension entries remain opaque.
  }
}

function tokenCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
