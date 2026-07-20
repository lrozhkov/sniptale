import { beforeEach, expect, it, vi } from 'vitest';

const {
  drawProjectFrameMock,
  sendCompositeRenderProgressMock,
  syncClipPlaybackMock,
  waitForDelayMock,
} = vi.hoisted(() => ({
  drawProjectFrameMock: vi.fn(),
  sendCompositeRenderProgressMock: vi.fn(),
  syncClipPlaybackMock: vi.fn(),
  waitForDelayMock: vi.fn(),
}));

vi.mock('../../renderer', () => ({
  drawProjectFrame: drawProjectFrameMock,
}));

vi.mock('../../media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media')>()),
  syncClipPlayback: syncClipPlaybackMock,
}));

vi.mock('../../runtime', () => ({
  waitForDelay: waitForDelayMock,
}));

vi.mock('../progress/index', () => ({
  sendCompositeRenderProgress: sendCompositeRenderProgressMock,
}));
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoTimelinePlacementMode,
} from '../../../../features/video/project/types';
import { runCompositeRenderLoop } from './run/loop';

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

function createSettings(format = VideoExportFormat.WEBM, fps = 4) {
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

beforeEach(() => {
  vi.clearAllMocks();
  sendCompositeRenderProgressMock.mockResolvedValue(1_000);
  waitForDelayMock.mockResolvedValue(undefined);
});

it('renders composite frames from deterministic frame indexes and pauses media first', async () => {
  let nowMs = 1_000;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    const current = nowMs;
    nowMs += 500;
    return current;
  });

  const job = createJob();

  await runCompositeRenderLoop(
    job as never,
    createProject(1) as never,
    createSettings(),
    {} as CanvasRenderingContext2D,
    {}
  );

  expect(job.clipMediaElements.get('clip-1')?.pause).toHaveBeenCalledTimes(1);
  expect(syncClipPlaybackMock.mock.calls.map(([, , currentTime]) => currentTime)).toEqual([
    0, 0.25, 0.5, 0.75,
  ]);
  expect(drawProjectFrameMock).toHaveBeenCalledTimes(4);
  expect(waitForDelayMock).toHaveBeenCalledTimes(3);
  expect(sendCompositeRenderProgressMock).toHaveBeenCalledTimes(4);
});

it('throws before rendering when the composite job is cancelled', async () => {
  await expect(
    runCompositeRenderLoop(
      { ...createJob(), cancelled: true } as never,
      createProject(1) as never,
      createSettings(),
      {} as CanvasRenderingContext2D,
      {}
    )
  ).rejects.toThrow('PROJECT_EXPORT_CANCELLED');

  expect(drawProjectFrameMock).not.toHaveBeenCalled();
  expect(syncClipPlaybackMock).not.toHaveBeenCalled();
  expect(waitForDelayMock).not.toHaveBeenCalled();
});
