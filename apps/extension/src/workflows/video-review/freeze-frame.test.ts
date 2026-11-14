import { afterEach, expect, it, vi } from 'vitest';
import { readReviewFreezeFrame } from './freeze-frame';
const io = vi.hoisted(() => ({ dispose: vi.fn(), close: vi.fn(), sample: vi.fn(), first: 0 }));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    dispose = io.dispose;
    async getPrimaryVideoTrack() {
      return { canDecode: async () => true, getFirstTimestamp: async () => io.first };
    }
  },
  VideoSampleSink: class {
    getSample = io.sample;
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  io.first = 0;
});
it('retains original decoded VFR timing and closes the frame without reading pixels', async () => {
  io.sample.mockResolvedValue({ timestamp: 3.98, duration: 0.04, close: io.close });
  expect(await readReviewFreezeFrame(new Blob(), 4, 12, new AbortController().signal)).toEqual({
    frameTime: 3.98,
    frameDuration: 0.04,
  });
  expect(io.close).toHaveBeenCalledOnce();
  expect(io.dispose).toHaveBeenCalledOnce();
});
it('uses the first real PTS and the last original frame at EOF', async () => {
  io.first = 0.033;
  io.sample.mockResolvedValueOnce({ timestamp: 0.033, duration: 0.04, close: io.close });
  await readReviewFreezeFrame(new Blob(), 0, 12, new AbortController().signal);
  expect(io.sample).toHaveBeenLastCalledWith(0.033);
  io.sample.mockResolvedValueOnce({ timestamp: 11.98, duration: 0.02, close: io.close });
  expect(
    await readReviewFreezeFrame(new Blob(), 12, 12, new AbortController().signal)
  ).toMatchObject({ frameTime: 11.98 });
  expect(io.close).toHaveBeenCalledTimes(2);
});
it('releases a decoded frame that arrives after cancellation and admits no result', async () => {
  const sample = Promise.withResolvers<{ timestamp: number; duration: number; close(): void }>();
  const entered = Promise.withResolvers<void>();
  io.sample.mockImplementation(() => {
    entered.resolve();
    return sample.promise;
  });
  const controller = new AbortController();
  const pending = readReviewFreezeFrame(new Blob(), 4, 12, controller.signal);
  await entered.promise;
  controller.abort(new Error('obsolete'));
  sample.resolve({ timestamp: 3.98, duration: 0.04, close: io.close });
  await expect(pending).rejects.toThrow('obsolete');
  expect(io.close).toHaveBeenCalledOnce();
});
