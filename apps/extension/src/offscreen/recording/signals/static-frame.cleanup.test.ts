// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { getRecordingTelemetryMock, saveRecordingTelemetrySafelyMock } = vi.hoisted(() => ({
  getRecordingTelemetryMock: vi.fn(),
  saveRecordingTelemetrySafelyMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/recordings/telemetry', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/recordings/telemetry')
  >()),
  getRecordingTelemetry: getRecordingTelemetryMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ warn: vi.fn() }),
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  saveRecordingTelemetrySafely: saveRecordingTelemetrySafelyMock,
}));

import { persistStaticFrameSignals } from './static-frame';

type FailingVideo = HTMLVideoElement & {
  _onerror: (() => void) | null;
};

type FailingVideoShape = HTMLVideoElement & {
  _onerror: (() => void) | null;
  load: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
};

function createFailingMetadataVideo(createElement: Document['createElement']): FailingVideo {
  const video: FailingVideoShape = Object.assign(createElement('video'), {
    _onerror: null,
    load: vi.fn(),
    remove: vi.fn(),
    removeAttribute: vi.fn(),
  });
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  Object.defineProperty(video, 'src', {
    configurable: true,
    get: () => 'blob:recording',
    set: () => queueMicrotask(() => video._onerror?.()),
  });
  return video;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('revokes object URLs and removes the video element when metadata loading fails', async () => {
  const revokeObjectUrl = vi.fn();
  const originalCreateElement = document.createElement.bind(document);
  const video = createFailingMetadataVideo(originalCreateElement);

  Object.defineProperty(video, 'onerror', {
    configurable: true,
    get: () => video._onerror,
    set: (handler: (() => void) | null) => {
      video._onerror = handler;
    },
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recording');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectUrl);
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    return tagName === 'video' ? video : originalCreateElement(tagName);
  }) as typeof document.createElement);
  getRecordingTelemetryMock.mockResolvedValue({
    actionEvents: [],
    captureMode: 'TAB',
    createdAt: 1,
    cursorTrack: null,
    displaySurface: null,
    recordingId: 'recording-metadata-failure',
    signals: [],
    updatedAt: 2,
    viewport: null,
  });

  await persistStaticFrameSignals(
    'recording-metadata-failure',
    new Blob(['video'], { type: 'video/webm' })
  );

  expect(revokeObjectUrl).toHaveBeenCalledWith('blob:recording');
  expect(video.remove).toHaveBeenCalledOnce();
  expect(saveRecordingTelemetrySafelyMock).not.toHaveBeenCalled();
});
