export function waitReady(child) {
  return new Promise((resolve, reject) => {
    let pending = "";
    let settled = false;
    const timer = setTimeout(() => finish(() => reject(Error())), 10000);
    const finish = (done) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.removeListener("data", read);
      child.removeListener("error", failed);
      child.removeListener("close", failed);
      done();
    };
    const failed = () => finish(() => reject(Error()));
    const read = (chunk) => {
      pending += chunk.toString();
      if (pending.length > 2048) return failed();
      let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        const match = line.match(
          /^llm-sessiond v2 listening on 127\.0\.0\.1:(\d+)$/,
        );
        if (match)
          return finish(() => resolve(`http://127.0.0.1:${match[1]}/api/v2`));
      }
    };
    child.stdout.on("data", read);
    child.once("error", failed);
    child.once("close", failed);
  });
}
