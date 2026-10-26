import { expect, it, vi } from 'vitest';
import { state, argsFixture } from './render-export.test-support';
import * as mediaOutput from './media-output';
import { writeReviewFrames } from './render-export';

it('cancels a pending encoder admission before waiting for its rejection', async () => {
  const args = argsFixture();
  const controller = new AbortController();
  const entered = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<void>();
  const createOutput = mediaOutput.createReviewMediaOutput;
  const cancel = vi.fn(async () => pending.reject(controller.signal.reason));
  const factory = vi
    .spyOn(mediaOutput, 'createReviewMediaOutput')
    .mockImplementationOnce((input) => {
      const tracks = createOutput(input);
      tracks.output.cancel = cancel;
      tracks.video.source.add = vi.fn(async () => {
        entered.resolve();
        await pending.promise;
      });
      return tracks;
    });
  const rendering = writeReviewFrames({ ...args, signal: controller.signal });
  const rejected = expect(rendering).rejects.toMatchObject({ name: 'AbortError' });
  try {
    await entered.promise;
    controller.abort();
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    pending.reject(controller.signal.reason);
    await rejected;
    factory.mockRestore();
  }
  expect(state.encoded).toHaveLength(0);
  for (const sample of state.drawn) expect(sample.close).toHaveBeenCalledOnce();
});

it('releases an output acquired while aborting before encoding starts', async () => {
  const args = argsFixture();
  const controller = new AbortController();
  const createOutput = mediaOutput.createReviewMediaOutput;
  const cancel = vi.fn(async () => undefined);
  const start = vi.fn(async () => undefined);
  const factory = vi
    .spyOn(mediaOutput, 'createReviewMediaOutput')
    .mockImplementationOnce((input) => {
      const tracks = createOutput(input);
      tracks.output.cancel = cancel;
      tracks.output.start = start;
      controller.abort();
      return tracks;
    });
  try {
    await expect(writeReviewFrames({ ...args, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  } finally {
    factory.mockRestore();
  }
});
