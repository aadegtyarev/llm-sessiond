import { expect } from "vitest";

export async function waitForFrames(
  frames: unknown[],
  count: number,
): Promise<void> {
  const deadline = Date.now() + 3000;
  while (frames.length < count && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 5));
  expect(frames.length).toBeGreaterThanOrEqual(count);
}
