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
