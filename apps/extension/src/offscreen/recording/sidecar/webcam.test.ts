// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import {
  WebcamPresentationMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createTrackedStream } from '../multi-source/media-stream.test-support';
import { createRecordingStagingCoordinatorTestDouble } from '../encoding/artifact-session.test-support';

const {
  acquireCameraSourceMock,
  buildVideoMediaRecorderOptionsMock,
  closeAllCameraSourcePeersMock,
  releaseCameraSourceMock,
} = vi.hoisted(() => ({
  acquireCameraSourceMock: vi.fn(),
  buildVideoMediaRecorderOptionsMock: vi.fn(),
  closeAllCameraSourcePeersMock: vi.fn(),
  releaseCameraSourceMock: vi.fn(),
}));

vi.mock('../camera-source/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../camera-source/session')>()),
  acquireCameraSource: acquireCameraSourceMock,
}));
vi.mock('../camera-source/peer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../camera-source/peer')>()),
  closeAllCameraSourcePeers: closeAllCameraSourcePeersMock,
}));
vi.mock('../../../platform/media-utils/video-recording', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../platform/media-utils/video-recording')>();
  buildVideoMediaRecorderOptionsMock.mockImplementation(original.buildVideoMediaRecorderOptions);
  return {
    ...original,
    buildVideoMediaRecorderOptions: buildVideoMediaRecorderOptionsMock,
  };
});

import { createWebcamSidecarRecorder } from './webcam';

class FakeMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onstart = null;
  onstop = null;
  state: RecordingState = 'inactive';
  mimeType: string;

  constructor(
    readonly stream: MediaStream,
    readonly options: MediaRecorderOptions
  ) {
    this.mimeType = options.mimeType ?? '';
  }
}

function createSettings(): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    webcamDeviceId: null,
    webcamEnabled: true,
    webcamPresentation: {
      ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
      mode: WebcamPresentationMode.SEPARATE_TRACK,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  const normalizedStream = createTrackedStream({ frameRate: 30, height: 1080, width: 1920 });
  acquireCameraSourceMock.mockResolvedValue({
    release: releaseCameraSourceMock,
    stream: normalizedStream,
    trackSettings: { frameRate: 30, height: 1080, width: 1920 },
  });
});

it('does not create a sidecar for an embedded webcam presentation', async () => {
  await expect(
    createWebcamSidecarRecorder({
      baseRecordingId: 'recording-1',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: {
        ...createSettings(),
        webcamPresentation: {
          ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
          mode: WebcamPresentationMode.EMBEDDED,
        },
      },
    })
  ).resolves.toBeNull();
  expect(acquireCameraSourceMock).not.toHaveBeenCalled();
});

it('records the webcam through the sole normalized camera source', async () => {
  const settings = createSettings();
  const recorder = await createWebcamSidecarRecorder({
    baseRecordingId: 'recording-1',
    coordinator: createRecordingStagingCoordinatorTestDouble(),
    settings,
  });

  expect(acquireCameraSourceMock).toHaveBeenCalledWith(settings);
  expect(closeAllCameraSourcePeersMock).toHaveBeenCalledOnce();
  expect(closeAllCameraSourcePeersMock.mock.invocationCallOrder[0]).toBeLessThan(
    acquireCameraSourceMock.mock.invocationCallOrder[0]!
  );
  expect(recorder?.recorder).toMatchObject({
    options: { videoBitsPerSecond: 8_000_000 },
    stream: recorder?.stream,
  });
  expect(recorder?.trackSettings).toEqual({ frameRate: 30, height: 1080, width: 1920 });
  expect(recorder?.artifactSession).toBeDefined();
  expect(releaseCameraSourceMock).not.toHaveBeenCalled();
});

it('aborts the normalized webcam artifact through its shared session', async () => {
  const coordinator = createRecordingStagingCoordinatorTestDouble();
  const recorder = await createWebcamSidecarRecorder({
    baseRecordingId: 'recording-1',
    coordinator,
    settings: createSettings(),
  });

  await recorder?.artifactSession.abort();

  expect(coordinator.abort).toHaveBeenCalledOnce();
});

it('rejects and releases normalized media when recorder options omit a MIME type', async () => {
  buildVideoMediaRecorderOptionsMock.mockReturnValueOnce({ videoBitsPerSecond: 8_000_000 });

  await expect(
    createWebcamSidecarRecorder({
      baseRecordingId: 'recording-1',
      coordinator: createRecordingStagingCoordinatorTestDouble(),
      settings: createSettings(),
    })
  ).rejects.toThrow('Unsupported recorded video MIME type: (empty)');

  expect(releaseCameraSourceMock).toHaveBeenCalledOnce();
});
