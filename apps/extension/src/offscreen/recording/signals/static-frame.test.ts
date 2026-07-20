// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getRecordingTelemetryMock, loggerWarnMock, saveRecordingTelemetrySafelyMock } = vi.hoisted(
  () => ({
    getRecordingTelemetryMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    saveRecordingTelemetrySafelyMock: vi.fn(),
  })
);

vi.mock('../../../composition/persistence/recordings/telemetry', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/recordings/telemetry')
  >()),
  getRecordingTelemetry: getRecordingTelemetryMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  saveRecordingTelemetrySafely: saveRecordingTelemetrySafelyMock,
}));

import { persistStaticFrameSignals } from './static-frame';

type FakeVideo = HTMLVideoElement & {
  _listeners: Map<string, EventListener[]>;
  _onloadedmetadata: (() => void) | null;
};

function createVideoElement(duration: number, createElement: Document['createElement']): FakeVideo {
  let currentTime = 0;
  const listeners = new Map<string, EventListener[]>();
  const video = createVideoShape(duration, listeners, createElement);

  defineVideoElementProperties(video, listeners, {
    getCurrentTime: () => currentTime,
    setCurrentTime: (value: number) => {
      currentTime = value;
    },
  });

  return video;
}

function createVideoShape(
  duration: number,
  listeners: Map<string, EventListener[]>,
  createElement: Document['createElement']
): FakeVideo {
  const video = Object.assign(createElement('video'), {
    _listeners: listeners,
    _onloadedmetadata: null,
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    }),
    removeEventListener: vi.fn((event: string, listener: EventListener) => {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((item) => item !== listener)
      );
    }),
    removeAttribute: vi.fn(),
    load: vi.fn(),
    remove: vi.fn(),
    muted: true,
    playsInline: true,
    preload: 'auto',
  });
  Object.defineProperty(video, 'duration', {
    configurable: true,
    value: duration,
  });
  return video;
}

function defineVideoElementProperties(
  video: FakeVideo,
  listeners: Map<string, EventListener[]>,
  currentTimeState: { getCurrentTime: () => number; setCurrentTime: (value: number) => void }
): void {
  Object.defineProperty(video, 'onloadedmetadata', {
    get: () => video._onloadedmetadata,
    set: (handler: (() => void) | null) => {
      video._onloadedmetadata = handler;
    },
  });
  Object.defineProperty(video, 'src', {
    configurable: true,
    get: () => 'blob:recording',
    set: () => queueMicrotask(() => video._onloadedmetadata?.()),
  });
  Object.defineProperty(video, 'currentTime', {
    get: currentTimeState.getCurrentTime,
    set: (value: number) => {
      currentTimeState.setCurrentTime(value);
      queueMicrotask(() => {
        for (const listener of listeners.get('seeked') ?? []) {
          listener(new Event('seeked'));
        }
      });
    },
  });
}

function createCanvasElement(createElement: Document['createElement']): HTMLCanvasElement {
  const ctx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(32 * 18 * 4).fill(20),
    })),
  };

  const canvas = createElement('canvas');
  Object.defineProperty(canvas, 'getContext', {
    configurable: true,
    value: vi.fn(() => ctx),
  });
  canvas.height = 0;
  canvas.width = 0;
  return canvas;
}

function createStaticFrameEnvironment(duration = 2): void {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recording');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const originalCreateElement = document.createElement.bind(document);

  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    if (tagName === 'video') {
      return createVideoElement(duration, originalCreateElement);
    }
    if (tagName === 'canvas') {
      return createCanvasElement(originalCreateElement);
    }
    return originalCreateElement(tagName);
  }) as typeof document.createElement);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function registerStaticFramePersistenceTest(): void {
  it('persists detected static-frame telemetry signals alongside existing non-static signals', async () => {
    createStaticFrameEnvironment();
    getRecordingTelemetryMock.mockResolvedValue({
      actionEvents: [],
      captureMode: 'TAB',
      createdAt: 1,
      cursorTrack: null,
      displaySurface: null,
      recordingId: 'recording-1',
      signals: [
        {
          data: { eventCount: 2, eventType: 'input' },
          endTime: 0.9,
          id: 'typing-1',
          kind: 'typing',
          point: null,
          startTime: 0.2,
        },
      ],
      updatedAt: 2,
      viewport: null,
    });

    await persistStaticFrameSignals('recording-1', new Blob(['video'], { type: 'video/webm' }));

    expect(saveRecordingTelemetrySafelyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingId: 'recording-1',
        signals: expect.arrayContaining([
          expect.objectContaining({ id: 'typing-1', kind: 'typing' }),
          expect.objectContaining({
            kind: 'static-frame',
            endTime: 2,
            point: null,
            startTime: 0,
          }),
        ]),
      })
    );
  });
}

function registerStaticFrameMissingTelemetryTest(): void {
  it('logs a warning and skips persistence when telemetry sidecar never becomes available', async () => {
    vi.useFakeTimers();
    getRecordingTelemetryMock.mockResolvedValue(null);

    const pending = persistStaticFrameSignals(
      'recording-missing',
      new Blob(['video'], { type: 'video/webm' })
    );
    await vi.runAllTimersAsync();
    await pending;

    expect(saveRecordingTelemetrySafelyMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Skipping static-frame pass because telemetry sidecar is unavailable',
      { recordingId: 'recording-missing' }
    );
  });
}

function registerStaticFrameReplacementTest(): void {
  it('drops stale static-frame signals when video metadata is unusable', async () => {
    createStaticFrameEnvironment(0);
    getRecordingTelemetryMock.mockResolvedValue({
      actionEvents: [],
      captureMode: 'TAB',
      createdAt: 1,
      cursorTrack: null,
      displaySurface: null,
      recordingId: 'recording-2',
      signals: [
        {
          data: { maxDiff: 0.2 },
          endTime: 0.6,
          id: 'static-1',
          kind: 'static-frame',
          point: null,
          startTime: 0,
        },
      ],
      updatedAt: 2,
      viewport: null,
    });

    await persistStaticFrameSignals('recording-2', new Blob(['video'], { type: 'video/webm' }));

    expect(saveRecordingTelemetrySafelyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingId: 'recording-2',
        signals: [],
      })
    );
  });
}

describe('offscreen recording static-frame signals', () => {
  registerStaticFramePersistenceTest();
  registerStaticFrameMissingTelemetryTest();
  registerStaticFrameReplacementTest();
});
