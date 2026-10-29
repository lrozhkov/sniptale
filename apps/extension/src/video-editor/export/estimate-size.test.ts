import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
const mocks = vi.hoisted(() => ({
  dispose: vi.fn(),
  renderFrame: vi.fn(async (_time: number, _signal: AbortSignal) => ({})),
  measure: vi.fn(),
  create: vi.fn(),
}));
vi.mock('../preview/cache/materializer', () => ({
  createVideoPreviewFrameMaterializer: (args: unknown) => {
    mocks.create(args);
    return { dispose: mocks.dispose, renderFrame: mocks.renderFrame };
  },
}));
vi.mock('../../workflows/video/export-size', () => ({ measureVideoExportSize: mocks.measure }));
import { estimateProjectExportSize } from './estimate-size';
import type { measureVideoExportSize } from '../../workflows/video/export-size';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('samples the selected output range at final dimensions and disposes its isolated materializer', async () => {
  vi.stubGlobal('document', {});
  vi.stubGlobal(
    'VideoFrame',
    class {
      close() {}
    }
  );
  mocks.measure.mockImplementation(async (args: Parameters<typeof measureVideoExportSize>[0]) => {
    expect(args.duration).toBe(2);
    expect(args.profile).toMatchObject({ width: 1904, height: 1064, fps: 30, codec: 'hevc' });
    await args.render(async () => undefined);
    return { bytes: 100, lowerBytes: 75, upperBytes: 135, sampledSeconds: 2 };
  });
  const project = {
    ...createEmptyVideoProject(),
    fps: 24,
    duration: 10,
    width: 1904,
    height: 1064,
  };
  await estimateProjectExportSize({
    project,
    assetUrls: {},
    settings: {
      downloadAfterExport: false,
      format: 'MP4',
      mp4VideoCodec: 'HEVC',
      width: 1904,
      height: 1064,
      fps: 30,
      quality: 'HIGH',
      resolution: '1080P',
      scope: 'selected-range',
      rangeStartSeconds: 3,
      rangeEndSeconds: 5,
    },
    signal: new AbortController().signal,
  });
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ sampleFps: 30 }));
  expect(project.fps).toBe(24);
  expect(mocks.renderFrame).toHaveBeenCalledTimes(60);
  expect(mocks.renderFrame.mock.calls[0]?.[0]).toBe(3);
  expect(mocks.dispose).toHaveBeenCalledOnce();
});
it('disposes the materializer if encoding is unavailable', async () => {
  vi.stubGlobal('document', {});
  mocks.measure.mockRejectedValue(new Error('unsupported'));
  const project = { ...createEmptyVideoProject(), duration: 1 };
  await expect(
    estimateProjectExportSize({
      project,
      assetUrls: {},
      settings: {
        downloadAfterExport: false,
        format: 'MP4',
        mp4VideoCodec: 'HEVC',
        width: 1920,
        height: 1080,
        fps: 30,
        quality: 'HIGH',
        resolution: 'SOURCE',
      },
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('unsupported');
  expect(mocks.dispose).toHaveBeenCalledOnce();
});

it.each([
  ['MP4', 'AVC', 'VP9', 'avc', false],
  ['MP4', 'VP9', 'VP9', 'vp9', true],
  ['WEBM', 'AVC', 'VP8', 'vp8', false],
  ['WEBM', 'AVC', 'VP9', 'vp9', true],
] as const)(
  'matches %s/%s/%s and subtitle/audio choices',
  async (format, mp4VideoCodec, webmVideoCodec, codec, burnInSubtitles) => {
    vi.stubGlobal('document', {});
    const { createVideoClipFromAsset } =
      await import('../../features/video/project/factories/clip');
    const { createSubtitleClip } =
      await import('../../features/video/project/factories/overlay-clip');
    const project = { ...createEmptyVideoProject(), duration: 1 };
    const asset: (typeof project.assets)[number] = {
      id: 'source',
      type: 'VIDEO',
      name: 'Source',
      createdAt: 0,
      source: { kind: 'project-asset', projectAssetId: 'source' },
      metadata: {
        width: 1920,
        height: 1080,
        duration: 1,
        hasAudio: true,
        mimeType: 'video/mp4',
        size: 1000,
        audioPeaks: null,
      },
    };
    project.assets = [asset];
    project.clips = [
      createVideoClipFromAsset(project.tracks[0]!.id, asset, 1920, 1080, 0, {
        muted: burnInSubtitles,
      }),
      createSubtitleClip(project.tracks[0]!.id, 1920, 1080, 0),
    ];
    mocks.measure.mockImplementation(async (args: Parameters<typeof measureVideoExportSize>[0]) => {
      expect(args.profile.codec).toBe(codec);
      expect(args.audioBitrate).toBe(burnInSubtitles ? 0 : 192000);
      return { bytes: 100, lowerBytes: 75, upperBytes: 135, sampledSeconds: 1 };
    });
    await estimateProjectExportSize({
      project,
      assetUrls: {},
      signal: new AbortController().signal,
      settings: {
        ...(format === 'MP4' ? { format, mp4VideoCodec } : { format, webmVideoCodec }),
        burnInSubtitles,
        fps: 30,
        width: 1920,
        height: 1080,
        resolution: 'SOURCE',
        quality: 'HIGH',
        downloadAfterExport: false,
      },
    });
    expect(mocks.dispose).toHaveBeenCalledOnce();
  }
);

it('does not estimate adaptive output from constant-rate samples', async () => {
  await expect(
    estimateProjectExportSize({
      project: createEmptyVideoProject(),
      assetUrls: {},
      signal: new AbortController().signal,
      settings: {
        format: 'WEBM',
        webmVideoCodec: 'VP9',
        fps: 60,
        frameRateMode: 'adaptive',
        width: 160,
        height: 90,
        quality: 'HIGH',
        resolution: 'SOURCE',
        downloadAfterExport: false,
      },
    })
  ).rejects.toThrow('Adaptive');
  expect(mocks.measure).not.toHaveBeenCalled();
});
