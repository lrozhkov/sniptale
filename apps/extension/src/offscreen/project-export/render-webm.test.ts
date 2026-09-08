import { beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../features/video/project/types';
import type { ExportJobState } from './types';
const mocks = vi.hoisted(() => ({ mix: vi.fn(), loop: vi.fn(), create: vi.fn() }));
vi.mock('./offline-audio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./offline-audio')>()),
  renderOfflineAudioMix: mocks.mix,
}));
vi.mock('./render-loop/frame-driven', () => ({ runFrameDrivenCompositeRenderLoop: mocks.loop }));
vi.mock('./webm-encoding', () => ({ createWebmEncoding: mocks.create }));
import { renderCompositeToWebm } from './render-webm';
function createJob(): ExportJobState {
  return {
    assetUrls: [],
    audioContext: null,
    audioDestination: null,
    cancelled: false,
    cleanupNode: null,
    clipAudioNodes: new Map(),
    clipMediaElements: new Map(),
    exportAbortController: new AbortController(),
    exportAudioSettings: null,
    exportStream: null,
    jobId: 'webm-job',
    mediaRecorder: null,
  };
}

function createSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: false,
    format: VideoExportFormat.WEBM,
    resolution: 'SOURCE' as const,
    webmVideoCodec: 'VP9' as const,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.MEDIUM,
    width: 1280,
  };
}

const pipeline = { videoEncoder: {}, check: vi.fn(), finish: vi.fn(), dispose: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.mix.mockResolvedValue(null);
  mocks.create.mockResolvedValue(pipeline);
  pipeline.finish.mockResolvedValue(new Blob(['webm'], { type: 'video/webm' }));
  mocks.loop.mockResolvedValue(undefined);
});
function run(job = createJob()) {
  const canvas = {} as HTMLCanvasElement;
  return renderCompositeToWebm(
    job,
    createEmptyVideoProject('WebM'),
    createSettings(),
    {},
    {} as CanvasRenderingContext2D,
    canvas
  );
}
it('uses project frame timestamps and offline audio instead of wall-clock capture', async () => {
  const buffer = { duration: 8 };
  mocks.mix.mockResolvedValue({ buffer });
  expect((await run()).type).toBe('video/webm');
  expect(mocks.loop).toHaveBeenCalledOnce();
  expect(mocks.loop.mock.calls[0]?.[6]).toBe(pipeline.videoEncoder);
  expect(pipeline.finish).toHaveBeenCalledWith(buffer);
  expect(pipeline.dispose).toHaveBeenCalledOnce();
});
it('releases the encoder when rendering fails', async () => {
  mocks.loop.mockRejectedValueOnce(new Error('render failed'));
  await expect(run()).rejects.toThrow('render failed');
  expect(pipeline.finish).not.toHaveBeenCalled();
  expect(pipeline.dispose).toHaveBeenCalledOnce();
});
it('does not publish output after cancellation', async () => {
  const job = createJob();
  mocks.loop.mockImplementationOnce(async () => {
    job.cancelled = true;
  });
  await expect(run(job)).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
  expect(pipeline.finish).not.toHaveBeenCalled();
  expect(pipeline.dispose).toHaveBeenCalledOnce();
});
