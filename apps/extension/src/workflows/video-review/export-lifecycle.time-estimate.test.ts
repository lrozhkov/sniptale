import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoProjectExportTimeEstimate } from '../../features/video/project/types/export';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { exportReviewedVideo } from './export-lifecycle';
import { createReviewExportFixture } from './export-lifecycle.test-support';

const { historyRead, historyRecord } = vi.hoisted(() => ({
  historyRead: vi.fn(async (): Promise<readonly number[]> => []),
  historyRecord: vi.fn(async () => undefined),
}));

vi.mock('../../composition/persistence/export-time-history', () => ({
  createExportTimeHistory: () => ({ read: historyRead, record: historyRecord }),
}));

beforeEach(() => {
  historyRead.mockReset().mockResolvedValue([]);
  historyRecord.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

it.each(['copy', 'render'] as const)(
  'calibrates %s without waiting for history and records raw error on success',
  async (route) => {
    const { args, deps } = createReviewExportFixture();
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    historyRead.mockReturnValue(new Promise(() => undefined));
    const report = vi.fn();
    if (route === 'render') {
      const advanced = args.snapshot.workspace.advanced;
      advanced.ui.mode = 'advanced';
      advanced.ui.tracks.zoom = true;
      advanced.zoom.enabled = true;
      advanced.zoom.regions = [createQuickEditZoomRegion({ id: 'zoom', at: 0, endMax: 4 })];
      args.index = { ...args.index, processedVideoCodec: 'vp9', frameRate: 30 };
    }
    const write = vi.fn(
      async (input: { onTimeEstimate?(estimate: VideoProjectExportTimeEstimate | null): void }) => {
        input.onTimeEstimate?.({ remainingMs: 10000 });
        expect(report).toHaveBeenLastCalledWith({ remainingMs: 12000 });
        clock = 10000;
        return { videoPackets: 120, audioPackets: 0, resultDuration: 4, audioRanges: [] };
      }
    );
    await exportReviewedVideo(
      { ...args, onTimeEstimate: report },
      {
        ...deps,
        writeReviewPackets: write,
        writeReviewFrames: write,
      }
    );
    expect(write).toHaveBeenCalledOnce();
    expect(historyRecord).toHaveBeenCalledWith(
      expect.stringContaining(`review-${route}-`),
      [1],
      args.signal
    );
    expect(report).toHaveBeenLastCalledWith(null);
  }
);

it.each(['failed', 'aborted'] as const)(
  'does not train on %s work and ignores history arriving after abort',
  async (outcome) => {
    const { args, deps, controller, writer } = createReviewExportFixture();
    let clock = 0;
    let resolveHistory!: (ratios: readonly number[]) => void;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    historyRead.mockReturnValue(
      new Promise((resolve) => {
        resolveHistory = resolve;
      })
    );
    const report = vi.fn();
    const write = vi.fn(
      async (input: { onTimeEstimate?(estimate: VideoProjectExportTimeEstimate | null): void }) => {
        input.onTimeEstimate?.({ remainingMs: 10000 });
        if (outcome === 'failed') throw new Error('encode failed');
        controller.abort();
        resolveHistory(Array(10).fill(4));
        await Promise.resolve();
        input.onTimeEstimate?.({ remainingMs: 10000 });
        expect(report).toHaveBeenLastCalledWith({ remainingMs: 12000 });
        clock = 10000;
        return { videoPackets: 120, audioPackets: 0, resultDuration: 4, audioRanges: [] };
      }
    );
    await expect(
      exportReviewedVideo(
        { ...args, onTimeEstimate: report },
        {
          ...deps,
          writeReviewPackets: write,
        }
      )
    ).rejects.toThrow();
    expect(historyRecord).not.toHaveBeenCalled();
    expect(writer.abort).toHaveBeenCalledOnce();
    expect(report).toHaveBeenLastCalledWith(null);
  }
);

it('keeps advisory history failures out of the export result', async () => {
  const { args, deps, result } = createReviewExportFixture();
  historyRead.mockRejectedValue(new Error('read unavailable'));
  historyRecord.mockRejectedValue(new Error('write unavailable'));
  const exported = await exportReviewedVideo({ ...args, onTimeEstimate: vi.fn() }, deps);
  expect(exported.file).toBe(result);
  expect(historyRecord).toHaveBeenCalledWith(expect.any(String), [], args.signal);
});
