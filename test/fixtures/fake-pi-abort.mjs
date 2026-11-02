export function handleFakeAbort(command, mode, held, setHeld, write) {
  const settle = () => {
    setHeld(false);
    write({ type: "agent_settled" });
  };
  const ack = (success) =>
    write({
      type: "response",
      id: command.id,
      command: "abort",
      success,
      data: {},
    });
  if (mode === "abort-reject") ack(false);
  else if (mode === "abort-delay-settle") {
    ack(true);
    setTimeout(settle, 100);
  } else if (mode === "abort-settle-before-ack") {
    setTimeout(settle, 10);
    setTimeout(() => ack(true), 30);
  } else if (mode === "abort-settle-before-reject") {
    setTimeout(settle, 10);
    setTimeout(() => ack(false), 30);
  } else if (mode === "abort-timeout-settled") setTimeout(settle, 10);
  else if (mode === "abort-timeout-late-settle") setTimeout(settle, 120);
  else {
    ack(true);
    if (held) settle();
  }
}
