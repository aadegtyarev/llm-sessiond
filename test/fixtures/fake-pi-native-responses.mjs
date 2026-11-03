import { fakePiPrompt } from "./fake-pi-native-turn.mjs";

export function respondToPiRequest(request, scenario, state, send) {
  const respond = (data = {}) =>
    send({
      type: "response",
      id: request.id,
      command: request.type,
      success: true,
      data,
    });
  if (request.type === "get_state") {
    if (scenario === "bad-session")
      return respond({ sessionId: "wrong-id", thinkingLevel: state.effort });
    if (scenario === "bad-ready")
      return respond({ sessionId: "", thinkingLevel: state.effort });
    return respond({
      sessionId: "pi-native-opaque",
      thinkingLevel: state.effort,
      model: { provider: "test", id: "model-1", name: "Test" },
    });
  }
  if (request.type === "get_session_stats")
    return respond({
      tokens: { total: 3, input: 1, output: 2 },
      contextUsage: { tokens: 3, contextWindow: 100, percent: 3 },
    });
  if (request.type === "get_available_models")
    return respond({
      models: [
        { provider: "test", id: "model-1" },
        { provider: "test", id: "model-2", name: "Model 2", ignored: true },
      ],
    });
  if (request.type === "get_available_thinking_levels")
    return respond({ levels: ["low", "high"] });
  if (request.type === "get_commands")
    return respond({
      commands: [
        { source: "extension", name: "review", description: "Review" },
        { source: "extension", name: "help" },
        { source: "extension", name: "reload" },
        { source: "builtin", name: "built" },
        { source: "extension", name: "Bad Name" },
      ],
    });
  if (request.type === "set_thinking_level") {
    state.effort = request.level;
    if (scenario === "slow-effort") return setTimeout(respond, 25);
    return respond();
  }
  if (request.type === "prompt")
    return fakePiPrompt(request, scenario, send, respond);
  if (request.type === "abort") {
    if (scenario === "abort-before-ack") {
      send({ type: "agent_settled" });
      setTimeout(respond, 5);
    } else {
      respond();
      send({ type: "agent_settled" });
    }
    return;
  }
  send({
    type: "response",
    id: request.id,
    command: request.type,
    success: false,
  });
}
