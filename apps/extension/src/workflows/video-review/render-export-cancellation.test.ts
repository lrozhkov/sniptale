import { expect, it, vi } from 'vitest';
import { state, argsFixture } from './render-export.test-support';
import * as mediaOutput from './media-output';
import { writeReviewFrames } from './render-export';
import * as sampling from './export-source-sampling';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { ExportEnhancementError } from '../../features/video/composition/export-enhancement/enhancer';

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

it('stops the selected algorithm on failure, drains its owner and never encodes a stale frame', async () => {
  const args = argsFixture();
  args.advanced.ui.mode = 'advanced';
  args.advanced.ui.tracks.zoom = true;
  args.advanced.zoom.enabled = true;
  args.advanced.zoom.regions = [createQuickEditZoomRegion({ id: 'source', at: 0, duration: 2 })];
  args.advanced.zoom.regions[0]!.enter.duration = 0;
  args.advanced.zoom.regions[0]!.exit.duration = 0;
  const error = new ExportEnhancementError('clark-x2', 'device-lost');
  const enhancer = {
    withEnhancedRegion: vi.fn(async () => {
      throw error;
    }),
    dispose: vi.fn(async () => undefined),
  };
  const factory = vi.spyOn(sampling, 'createReviewExportSampling').mockReturnValueOnce(enhancer);
  try {
    await expect(writeReviewFrames(args)).rejects.toMatchObject({ stage: 'compose', cause: error });
    expect(enhancer.withEnhancedRegion).toHaveBeenCalled();
    expect(enhancer.dispose).toHaveBeenCalledOnce();
    expect(state.encoded).toHaveLength(0);
    for (const sample of state.drawn) expect(sample.close).toHaveBeenCalledOnce();
  } finally {
    factory.mockRestore();
  }
});
