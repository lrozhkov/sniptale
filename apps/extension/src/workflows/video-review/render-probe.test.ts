import { state, argsFixture } from './render-export.test-support';
import { expect, it, vi } from 'vitest';
import { writeReviewFrames } from './render-export';

it('renders a read-only size probe without encoding audio or calling its output writer', async () => {
  const args = argsFixture({ frameRate: 30 });
  const add = vi.fn(async () => undefined);
  const before = state.configurations.length;
  const receipt = await writeReviewFrames({ ...args, frameProbe: { add } });
  expect(add).toHaveBeenCalledTimes(45);
  expect(args.writer.writeAt).not.toHaveBeenCalled();
  expect(state.configurations).toHaveLength(before);
  expect(receipt.audioPackets).toBe(0);
  for (const sample of state.drawn) expect(sample.close).toHaveBeenCalled();
});
