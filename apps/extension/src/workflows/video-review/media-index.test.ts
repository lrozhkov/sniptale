import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { inspectReviewMedia, chooseReviewVideoCodec } from './media-index';

it.each(['avc-aac.mp4', 'hevc-aac.mp4', 'vp8-opus.webm', 'vp9-opus.webm', 'av1-opus.webm'])(
  'indexes independent packets in real %s',
  async (name) => {
    const bytes = await readFile(`tooling/test/e2e/fixtures/review-${name}`);
    const index = await inspectReviewMedia(new Blob([bytes]), new AbortController().signal);
    expect(index.boundaries.slice(0, -1)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(index.duration).toBeCloseTo(12, 1);
    expect(index.frameRate).toBeGreaterThan(0);
    expect(index.frameRate).toBeLessThanOrEqual(120);
  }
);
it('probes a container-fitting video encoder for a real indexed file', async () => {
  const bytes = await readFile('tooling/test/e2e/fixtures/review-vp8-opus.webm');
  const index = await inspectReviewMedia(new Blob([bytes]), new AbortController().signal);
  // Node has no VideoEncoder, so the probe must degrade to null, never throw.
  expect(index.processedVideoCodec).toBeNull();
  expect(await chooseReviewVideoCodec(index.container, { width: 160, height: 90 })).toBeNull();
});
it('excludes every non-IDR recovery point in a real open-GOP stream', async () => {
  const bytes = await readFile('tooling/test/e2e/fixtures/review-avc-open-gop.mp4');
  const index = await inspectReviewMedia(new Blob([bytes]), new AbortController().signal);
  expect(index.boundaries).toEqual([0, 12]);
});
it('honors cancellation before opening an input', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(inspectReviewMedia(new Blob(), controller.signal)).rejects.toThrow();
});
