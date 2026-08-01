import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoWebmCodec,
  type VideoProjectExportSettings,
} from '../../features/video/project/types';
import type { ExportJobState } from './types';
import { resolveExportTargetBitrate as resolveActualExportTargetBitrate } from './codecs/bitrate';

const {
  getSupportedWebmExportMimeTypeMock,
  resolveExportTargetBitrateMock,
  runCompositeRenderLoopMock,
  setupExportAudioMock,
} = vi.hoisted(() => ({
  getSupportedWebmExportMimeTypeMock: vi.fn(),
  resolveExportTargetBitrateMock: vi.fn(),
  runCompositeRenderLoopMock: vi.fn(),
  setupExportAudioMock: vi.fn(),
}));

vi.mock('./codecs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./codecs')>()),
  resolveExportTargetBitrate: resolveExportTargetBitrateMock,
}));

vi.mock('./media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./media')>()),
  setupExportAudio: setupExportAudioMock,
}));

vi.mock('./render-loop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./render-loop')>()),
  runCompositeRenderLoop: runCompositeRenderLoopMock,
}));

vi.mock('./runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime')>()),
  getSupportedWebmExportMimeType: getSupportedWebmExportMimeTypeMock,
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

class FakeMediaRecorder {
  static lastInstance: FakeMediaRecorder | null = null;
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    readonly stream: MediaStream,
    readonly options: { mimeType: string; videoBitsPerSecond: number }
  ) {
    FakeMediaRecorder.lastInstance = this;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

class FakeMediaStream {
  constructor(private readonly tracks: Array<{ stop: () => void }>) {}

  getVideoTracks() {
    return this.tracks.slice(0, 1);
  }

  getTracks() {
    return this.tracks;
  }
}

vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
vi.stubGlobal('MediaStream', FakeMediaStream);

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

function createCanvas(stopVideoTrack: () => void) {
  return {
    captureStream: vi.fn(() => ({
      getVideoTracks: () => [{ stop: stopVideoTrack }],
    })),
  } as unknown as HTMLCanvasElement;
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

function createContext(): CanvasRenderingContext2D {
  return {} as CanvasRenderingContext2D;
}

function createCaptureFailureCanvas(): HTMLCanvasElement {
  const canvas: HTMLCanvasElement = Object.create(null);
  canvas.captureStream = () => {
    throw new Error('capture failed');
  };
  return canvas;
}

function createPreparedAudio(tracks: Array<{ stop: () => void }> = []) {
  return { dispose: vi.fn(), start: vi.fn(), tracks };
}

it('records a composite webm export and cleans up stream state', async () => {
  const { renderCompositeToWebm } = await import('./render-webm');
  const stopVideoTrack = vi.fn();
  const stopAudioTrack = vi.fn();
  const preparedAudio = createPreparedAudio([{ stop: stopAudioTrack }]);

  resolveExportTargetBitrateMock.mockImplementation(resolveActualExportTargetBitrate);
  getSupportedWebmExportMimeTypeMock.mockReturnValue('video/webm');
  setupExportAudioMock.mockResolvedValue(preparedAudio);
  runCompositeRenderLoopMock.mockImplementation(async () => {
    FakeMediaRecorder.lastInstance?.ondataavailable?.({
      data: new Blob(['frame'], { type: 'video/webm' }),
    });
  });

  const blob = await renderCompositeToWebm(
    createJob(),
    createEmptyVideoProject('WebM'),
    createSettings(),
    {},
    createContext(),
    createCanvas(stopVideoTrack)
  );

  expect(blob.type).toBe('video/webm');
  expect(getSupportedWebmExportMimeTypeMock).toHaveBeenCalledWith(VideoWebmCodec.VP9, true);
  expect(resolveExportTargetBitrateMock).toHaveBeenCalledWith(
    expect.objectContaining({ height: 720, width: 1280 }),
    VideoWebmCodec.VP9
  );
  expect(FakeMediaRecorder.lastInstance?.options.videoBitsPerSecond).toBe(2_400_000);
  expect(preparedAudio.start).toHaveBeenCalledOnce();
  expect(preparedAudio.dispose).toHaveBeenCalledOnce();
  expect(stopVideoTrack).toHaveBeenCalledOnce();
  expect(stopAudioTrack).toHaveBeenCalledOnce();
});

it('rejects the blob promise when the job has been cancelled', async () => {
  const { renderCompositeToWebm } = await import('./render-webm');
  const job = createJob();
  job.cancelled = true;

  resolveExportTargetBitrateMock.mockReturnValue(42);
  getSupportedWebmExportMimeTypeMock.mockReturnValue('video/webm');
  setupExportAudioMock.mockResolvedValue(createPreparedAudio());
  runCompositeRenderLoopMock.mockResolvedValue(undefined);

  await expect(
    renderCompositeToWebm(
      job,
      createEmptyVideoProject('WebM'),
      createSettings(),
      {},
      createContext(),
      createCanvas(vi.fn())
    )
  ).rejects.toThrow('PROJECT_EXPORT_CANCELLED');
});

it('stops the recorder and rethrows render loop failures', async () => {
  const { renderCompositeToWebm } = await import('./render-webm');

  resolveExportTargetBitrateMock.mockReturnValue(42);
  getSupportedWebmExportMimeTypeMock.mockReturnValue('video/webm');
  setupExportAudioMock.mockResolvedValue(createPreparedAudio());
  runCompositeRenderLoopMock.mockRejectedValue(new Error('render failed'));

  await expect(
    renderCompositeToWebm(
      createJob(),
      createEmptyVideoProject('WebM'),
      createSettings(),
      {},
      createContext(),
      createCanvas(vi.fn())
    )
  ).rejects.toThrow('render failed');
});

it('releases prepared audio when canvas stream capture fails', async () => {
  const { renderCompositeToWebm } = await import('./render-webm');
  const preparedAudio = createPreparedAudio();
  setupExportAudioMock.mockResolvedValue(preparedAudio);

  await expect(
    renderCompositeToWebm(
      createJob(),
      createEmptyVideoProject('WebM'),
      createSettings(),
      {},
      createContext(),
      createCaptureFailureCanvas()
    )
  ).rejects.toThrow('capture failed');

  expect(preparedAudio.dispose).toHaveBeenCalledOnce();
});
