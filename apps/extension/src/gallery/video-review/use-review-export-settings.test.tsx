// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewMediaIndex, ReviewOutputCodec } from '../../workflows/video-review/media-index';
import { useReviewExportSettings } from './use-review-export-settings';
const probe = vi.hoisted(() => vi.fn());
vi.mock('../../workflows/video-review/media-index', () => ({ supportedReviewVideoCodecs: probe }));

it('reprobes output dimensions and rejects stale or failed capability results', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.canvas = { width: 1920, height: 1080 };
  const index: ReviewMediaIndex = {
    duration: 2,
    boundaries: [0, 2],
    videoCodec: 'avc',
    audioCodec: null,
    container: 'mp4',
    rotation: 0,
  };
  const requests: { resolve(codecs: ReviewOutputCodec[]): void; reject(error: Error): void }[] = [];
  probe.mockImplementation(
    () => new Promise((resolve, reject) => requests.push({ resolve, reject }))
  );
  let hook!: ReturnType<typeof useReviewExportSettings>;
  function Harness() {
    hook = useReviewExportSettings(index, advanced);
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(hook.index?.outputCodecs?.mp4).toEqual([]);
    expect(probe).toHaveBeenCalledWith('mp4', {
      width: 1920,
      height: 1080,
      bitrate: 8_000_000,
      fps: 30,
    });
    await act(async () =>
      hook.setRenderSettings({ quality: 'HIGH', resolution: '720P', frameRate: 30 })
    );
    await act(async () => {
      requests[2]!.resolve(['avc']);
      requests[3]!.resolve(['vp9']);
    });
    expect(hook.index?.outputCodecs?.webm).toEqual(['vp9']);
    await act(async () => {
      requests[0]!.resolve(['hevc']);
      requests[1]!.resolve(['vp8']);
    });
    expect(hook.index?.outputCodecs?.mp4).toEqual(['avc']);
    await act(async () =>
      hook.setRenderSettings({ quality: 'ULTRA', resolution: '2160P', frameRate: 60 })
    );
    await act(async () => {
      requests[4]!.reject(new Error('unavailable'));
      requests[5]!.resolve([]);
    });
    expect(hook.index?.outputCodecs?.mp4).toEqual([]);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('probes 1904x1064 at explicit 30fps and retains HEVC for a 40fps source', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  probe.mockReset();
  probe.mockImplementation(
    async (format: string, settings: { fps: number; width: number; height: number }) =>
      format === 'mp4' && settings.fps === 30 && settings.width === 1904 && settings.height === 1064
        ? ['hevc']
        : []
  );
  const root = createRoot(document.createElement('div'));
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  const index: ReviewMediaIndex = {
    duration: 2,
    boundaries: [0, 2],
    videoCodec: 'avc',
    audioCodec: null,
    container: 'mp4',
    rotation: 0,
    width: 1904,
    height: 1064,
    frameRate: 40,
  };
  let hook!: ReturnType<typeof useReviewExportSettings>;
  function Harness() {
    hook = useReviewExportSettings(index, advanced);
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () =>
      hook.setRenderSettings({
        format: 'mp4',
        codec: 'hevc',
        quality: 'HIGH',
        resolution: '1080P',
        frameRate: 30,
      })
    );
    expect(probe).toHaveBeenLastCalledWith(
      'webm',
      expect.objectContaining({ width: 1904, height: 1064, fps: 30 })
    );
    expect(hook.index?.outputCodecs?.mp4).toEqual(['hevc']);
    expect(hook.renderSettings).toMatchObject({
      codec: 'hevc',
      frameRate: 30,
      resolution: '1080P',
    });
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
