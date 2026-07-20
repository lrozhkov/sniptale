// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { VideoProjectAssetType, VideoProjectClipType } from '../../../features/video/project/types';
import { loadInitialProjectFromLocation } from './workspace';

const {
  getRecording,
  getRecordingTelemetry,
  getVideoProject,
  importRecordingProjectAssetMock,
  saveVideoProject,
} = vi.hoisted(() => ({
  getRecording: vi.fn(),
  getRecordingTelemetry: vi.fn(),
  getVideoProject: vi.fn(),
  importRecordingProjectAssetMock: vi.fn(),
  saveVideoProject: vi.fn(),
}));

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),
  deleteProjectAsset: vi.fn(),
  getVideoProject,
}));

vi.mock('../../../composition/persistence/projects/index-mutations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/projects/index-mutations')
  >()),
  commitVideoProjectMutation: saveVideoProject,
}));

vi.mock('../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/recordings/index')>()),
  getRecording,
}));

vi.mock('../../../composition/persistence/recordings/telemetry', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/recordings/telemetry')
  >()),
  getRecordingTelemetry,
}));

vi.mock('../media-metadata', () => ({
  loadAudioMetadata: vi.fn(),
  loadImageMetadata: vi.fn(),
  loadVideoMetadata: vi.fn(),
}));

vi.mock('./assets', () => ({
  ensureRecordingAsset: vi.fn(),
  importProjectAsset: vi.fn(),
  importRecordingProjectAsset: importRecordingProjectAssetMock,
}));

function createRecordingEntry(recordingId: string, filename: string, size: number) {
  return {
    blob: new Blob([recordingId], { type: 'video/webm' }),
    createdAt: 1,
    filename,
    id: recordingId,
    size,
  };
}

beforeEach(async () => {
  vi.resetAllMocks();
  window.history.replaceState({}, '', '/video-editor.html');
  getVideoProject.mockResolvedValue({ status: 'notFound' });
  getRecordingTelemetry.mockResolvedValue(undefined);
  getRecording.mockImplementation((recordingId: string) => {
    if (recordingId === 'recording-1') {
      return Promise.resolve(createRecordingEntry(recordingId, 'recording.webm', 5));
    }
    if (recordingId === 'recording-1-webcam') {
      return Promise.resolve(createRecordingEntry(recordingId, 'recording-webcam.webm', 3));
    }
    return Promise.resolve(undefined);
  });
  importRecordingProjectAssetMock.mockImplementation((recordingId: string) =>
    Promise.resolve({
      id: recordingId === 'recording-1-webcam' ? 'asset-webcam' : 'asset-main',
      type: VideoProjectAssetType.RECORDING,
      name: recordingId === 'recording-1-webcam' ? 'webcam.webm' : 'recording.webm',
      source: {
        kind: 'project-asset',
        projectAssetId: recordingId === 'recording-1-webcam' ? 'project-asset-webcam' : 'asset-1',
        originRecordingId: recordingId,
      },
      metadata: {
        width: recordingId === 'recording-1-webcam' ? 640 : 1280,
        height: recordingId === 'recording-1-webcam' ? 360 : 720,
        duration: recordingId === 'recording-1-webcam' ? 7 : 5,
        mimeType: 'video/webm',
        size: recordingId === 'recording-1-webcam' ? 3 : 5,
        hasAudio: false,
        audioPeaks: null,
      },
      createdAt: 1,
    })
  );
  const { loadVideoMetadata } = await import('../media-metadata');
  vi.mocked(loadVideoMetadata).mockResolvedValue({
    audioPeaks: null,
    duration: 5,
    hasAudio: false,
    height: 720,
    mimeType: 'video/webm',
    size: 5,
    width: 1280,
  });
});

it('adds a saved webcam sidecar as a separate muted recording track', async () => {
  window.history.replaceState({}, '', '/video-editor.html?id=recording-1');

  const result = await loadInitialProjectFromLocation();
  const videoClips = result.project.clips.filter(
    (clip) => clip.type === VideoProjectClipType.VIDEO
  );

  expect(importRecordingProjectAssetMock).toHaveBeenCalledWith('recording-1-webcam');
  expect(result.project.assets.map((asset) => asset.source)).toEqual([
    expect.objectContaining({ originRecordingId: 'recording-1' }),
    expect.objectContaining({ originRecordingId: 'recording-1-webcam' }),
  ]);
  expect(videoClips[1]).toEqual(
    expect.objectContaining({
      muted: true,
      startTime: 0,
      transform: expect.objectContaining({ height: 360, width: 640, x: 0, y: 0 }),
    })
  );
  expect(result.project.duration).toBe(7);
  expect(saveVideoProject).toHaveBeenCalledOnce();
});
