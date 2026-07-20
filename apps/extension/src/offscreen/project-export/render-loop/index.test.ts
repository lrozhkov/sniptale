import { beforeEach, expect, it, vi } from 'vitest';

const {
  drawProjectFrameMock,
  sendProgressMock,
  syncClipPlaybackMock,
  syncVideoClipFrameMock,
  waitForDelayMock,
  waitForEncoderQueueCapacityMock,
} = vi.hoisted(() => ({
  drawProjectFrameMock: vi.fn(),
  sendProgressMock: vi.fn(),
  syncClipPlaybackMock: vi.fn(),
  syncVideoClipFrameMock: vi.fn(),
  waitForDelayMock: vi.fn(),
  waitForEncoderQueueCapacityMock: vi.fn(),
}));

vi.mock('../codecs', () => ({
  waitForEncoderQueueCapacity: waitForEncoderQueueCapacityMock,
}));

vi.mock('../media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media')>()),
  syncClipPlayback: syncClipPlaybackMock,
  syncVideoClipFrame: syncVideoClipFrameMock,
}));

vi.mock('../renderer', () => ({
  drawProjectFrame: drawProjectFrameMock,
}));

vi.mock('../runtime', () => ({
  sendProgress: sendProgressMock,
  waitForDelay: waitForDelayMock,
}));

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { runCompositeRenderLoop, runFrameDrivenCompositeRenderLoop } from '.';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoProjectExportPhase,
  VideoTimelinePlacementMode,
} from '../../../features/video/project/types';

function createProject(duration = 1) {
  return {
    version: 1,
    id: 'project-1',
    name: 'Project',
    baseRecordingId: null,
    width: 1280,
    height: 720,
    fps: 30,
    backgroundColor: '#000000',
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    duration,
    createdAt: 1,
    updatedAt: 1,
    assets: [],
    tracks: [],
    clips: [],
  };
}

function createSettings(format: VideoExportFormat = VideoExportFormat.WEBM, fps = 4) {
  return {
    width: 1280,
    height: 720,
    fps,
    quality: VideoExportQualityPreset.BALANCED,
    format,
    downloadAfterExport: true,
  };
}

function createJob(jobId = 'job-1') {
  return {
    cancelled: false,
    jobId,
    clipMediaElements: new Map([
      [
        'clip-1',
        {
          pause: vi.fn(),
        },
      ],
    ]),
    clipAudioNodes: new Map(),
  };
}

function installVideoFrameMock(closeMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal(
    'VideoFrame',
    class VideoFrameMock {
      close = closeMock;

      constructor(_canvas: HTMLCanvasElement, _options: { timestamp: number; duration: number }) {}
    }
  );
}

async function runMp4RenderLoop() {
  await runFrameDrivenCompositeRenderLoop(
    createJob('job-2') as never,
    createProject(1) as never,
    createSettings(VideoExportFormat.MP4, 6),
    {} as HTMLCanvasElement,
    {} as CanvasRenderingContext2D,
    {},
    {
      encode: vi.fn(),
    } as never,
    vi.fn()
  );
}

function expectMp4FrameSyncTimes() {
  expect(syncVideoClipFrameMock.mock.calls.map(([, , currentTime]) => currentTime)).toEqual([
    0,
    1 / 6,
    2 / 6,
    3 / 6,
    4 / 6,
    5 / 6,
  ]);
}

function expectMp4RenderProgressCalls() {
  expect(sendProgressMock.mock.calls).toEqual([
    [
      'job-2',
      VideoProjectExportPhase.RENDERING,
      (2 / 6) * 100,
      'offscreenExport.frameDrivenRenderPrefix 2 offscreenExport.progressFrameOf 6',
    ],
    [
      'job-2',
      VideoProjectExportPhase.RENDERING,
      (4 / 6) * 100,
      'offscreenExport.frameDrivenRenderPrefix 4 offscreenExport.progressFrameOf 6',
    ],
    [
      'job-2',
      VideoProjectExportPhase.RENDERING,
      100,
      'offscreenExport.frameDrivenRenderPrefix 6 offscreenExport.progressFrameOf 6',
    ],
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  sendProgressMock.mockResolvedValue(undefined);
  waitForDelayMock.mockResolvedValue(undefined);
  waitForEncoderQueueCapacityMock.mockResolvedValue(undefined);
  syncVideoClipFrameMock.mockResolvedValue(undefined);
});

it('renders WebM frames from deterministic frame indexes instead of wall-clock drift', async () => {
  let nowMs = 1_000;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    const current = nowMs;
    nowMs += 500;
    return current;
  });

  await runCompositeRenderLoop(
    createJob() as never,
    createProject(1) as never,
    createSettings(VideoExportFormat.WEBM, 4),
    {} as CanvasRenderingContext2D,
    {}
  );

  expect(syncClipPlaybackMock.mock.calls.map(([, , currentTime]) => currentTime)).toEqual([
    0, 0.25, 0.5, 0.75,
  ]);
  expect(drawProjectFrameMock).toHaveBeenCalledTimes(4);
  expect(waitForDelayMock).toHaveBeenCalledTimes(3);
  expect(sendProgressMock).toHaveBeenLastCalledWith(
    'job-1',
    VideoProjectExportPhase.RENDERING,
    100,
    'offscreenExport.renderFrameAction 4 offscreenExport.progressFrameOf 4'
  );
});

it('keeps MP4 frame-driven progress based on frame indexes and sends the final frame update', async () => {
  const videoFrameCloseMock = vi.fn();
  installVideoFrameMock(videoFrameCloseMock);

  await runMp4RenderLoop();

  expectMp4FrameSyncTimes();
  expectMp4RenderProgressCalls();
  expect(videoFrameCloseMock).toHaveBeenCalledTimes(6);
});
