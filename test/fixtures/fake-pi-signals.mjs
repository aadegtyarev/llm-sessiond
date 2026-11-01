export function handleFakeSigterm(getPendingAck, clearPendingAck, write) {
  const ack = getPendingAck();
  if (ack) {
    clearPendingAck();
    write(ack);
    setTimeout(() => process.exit(0), 50);
  } else process.exit(0);
}
