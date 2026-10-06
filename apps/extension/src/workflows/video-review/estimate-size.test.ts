import { afterEach, expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
const mocks = vi.hoisted(() => ({ measure: vi.fn(), write: vi.fn() }));
vi.mock('../video/export-size', () => ({ measureVideoExportSize: mocks.measure }));
vi.mock('./render-export', () => ({ writeReviewFrames: mocks.write }));
import { estimateReviewExportSize } from './estimate-size';
import type { measureVideoExportSize } from '../video/export-size';
afterEach(() => vi.resetAllMocks());
it('uses edited duration and selected fps while providing a sink that forbids writes', async () => {
  const close = vi.fn();
  mocks.write.mockImplementation(
    async (args: Parameters<typeof import('./render-export').writeReviewFrames>[0]) => {
      await args.frameProbe!.add({
        toVideoFrame: () => ({ close }),
      } as unknown as import('mediabunny').VideoSample);
    }
  );
  mocks.measure.mockImplementation(async (args: Parameters<typeof measureVideoExportSize>[0]) => {
    expect(args.profile).toMatchObject({
      width: 1904,
      height: 1064,
      fps: 30,
      codec: 'hevc',
      quality: 'HIGH',
    });
    expect(args.duration).toBe(8);
    expect(args.audioBitrate).toBe(0);
    await args.render(async () => undefined);
    return { bytes: 100, lowerBytes: 75, upperBytes: 135, sampledSeconds: 6 };
  });
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  await estimateReviewExportSize({
    file: new Blob(),
    index: {
      duration: 10,
      boundaries: [0, 10],
      container: 'mp4',
      videoCodec: 'avc',
      audioCodec: null,
      rotation: 0,
      width: 1904,
      height: 1064,
      frameRate: 40,
      outputCodecs: { mp4: ['hevc'], webm: [] },
    },
    edits: [{ id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 }],
    advanced,
    fragmentOffset: 0,
    renderSettings: {
      format: 'mp4',
      codec: 'hevc',
      resolution: '1080P',
      quality: 'HIGH',
      frameRate: 30,
    },
    signal: new AbortController().signal,
    readProjectAsset: async () => null,
  });
  expect(mocks.write).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  await expect(mocks.write.mock.calls[0]![0].writer.writeAt()).rejects.toThrow('must not write');
  expect(mocks.write.mock.calls[0]![0].frameProbe.add).toBeTypeOf('function');
});

function sourceFixture() {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  return {
    file: new Blob(),
    index: {
      duration: 2,
      boundaries: [0, 2],
      container: 'webm' as const,
      videoCodec: 'vp9' as const,
      audioCodec: null,
      rotation: 0 as const,
      width: 320,
      height: 180,
      frameRate: 30,
      outputCodecs: { mp4: [], webm: ['vp9' as const] },
    },
    edits: [],
    advanced,
    fragmentOffset: 0,
    signal: new AbortController().signal,
    readProjectAsset: async () => null,
  };
}
it.each([false, true])('accounts for added audio only when audible (muted=%s)', async (muted) => {
  const args = sourceFixture();
  args.advanced.ui.tracks.audio = true;
  args.advanced.audio.music = [
    {
      id: 'music',
      assetId: 'music',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 2,
      volume: 1,
      muted,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  mocks.measure.mockImplementation(async (input: Parameters<typeof measureVideoExportSize>[0]) => {
    expect(input.audioBitrate).toBe(muted ? 0 : 192000);
    expect(input.profile.quality).toBe('HIGH');
  });
  await estimateReviewExportSize(args);
});
it('rejects an unavailable profile before rendering', async () => {
  const args = sourceFixture();
  args.index.outputCodecs.webm = [];
  await expect(estimateReviewExportSize(args)).rejects.toThrow('unavailable');
  expect(mocks.write).not.toHaveBeenCalled();
  expect(mocks.measure).not.toHaveBeenCalled();
});
