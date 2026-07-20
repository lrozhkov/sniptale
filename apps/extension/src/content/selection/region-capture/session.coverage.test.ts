import { beforeEach, expect, it, vi } from 'vitest';

const loggerMocks = vi.hoisted(() => ({
  errorMock: vi.fn(),
  logMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loggerMocks.errorMock,
    log: loggerMocks.logMock,
    warn: loggerMocks.warnMock,
  }),
}));

import { createRegionCaptureSession } from './session';

function createTrack() {
  return { stop: vi.fn() };
}

function createDeps(overrides: Partial<Record<string, unknown>> = {}) {
  const displayTrack = createTrack();
  const finalTrack = createTrack();
  const micTrack = createTrack();
  const recorder = { start: vi.fn(), stop: vi.fn() };
  const scheduleTimeout = vi.fn((callback: () => void) => callback);
  const deps = {
    applyTrackHints: vi.fn(),
    applyViewportCrop: vi.fn(async () => undefined),
    configureRecorder: vi.fn(() => recorder),
    createCropTarget: vi.fn(async () => ({ id: 'crop-target' })),
    getDisplayStream: vi.fn(async () => ({
      getTracks: () => [displayTrack],
      getVideoTracks: () => [displayTrack],
    })),
    removeMarker: vi.fn(),
    resolveCaptureStream: vi.fn(async () => ({
      audioContext: { close: vi.fn(async () => undefined) },
      finalStream: { getTracks: () => [finalTrack] },
      micStream: { getTracks: () => [micTrack] },
    })),
    saveRecording: vi.fn(),
    scheduleTimeout,
    ...overrides,
  } as any;

  return { deps, displayTrack, finalTrack, micTrack, recorder, scheduleTimeout };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('starts recording, forwards progress, and saves captured chunks', async () => {
  const { deps, recorder } = createDeps();
  const onProgress = vi.fn();
  const session = createRegionCaptureSession(deps);

  await session.start({ quality: 'high', systemAudioEnabled: true } as never, onProgress);

  expect(deps.createCropTarget).toHaveBeenCalledOnce();
  expect(deps.applyTrackHints).toHaveBeenCalledOnce();
  expect(deps.applyViewportCrop).toHaveBeenCalledOnce();
  expect(recorder.start).toHaveBeenCalledWith(1000);
  expect(onProgress).toHaveBeenCalledWith({ type: 'STARTED' });

  const recorderConfig = deps.configureRecorder.mock.calls[0][0];
  recorderConfig.recordedChunks.push(new Blob(['chunk']));
  recorderConfig.onSaveRecording();
  expect(deps.saveRecording).toHaveBeenCalledOnce();
});

it('reports startup failures when the display stream has no video track', async () => {
  const { deps } = createDeps({
    getDisplayStream: vi.fn(async () => ({
      getTracks: () => [],
      getVideoTracks: () => [],
    })),
  });
  const onProgress = vi.fn();
  const session = createRegionCaptureSession(deps);

  await expect(
    session.start({ quality: 'high', systemAudioEnabled: false } as never, onProgress)
  ).rejects.toThrow('No video track in display stream');

  expect(loggerMocks.errorMock).toHaveBeenCalled();
  expect(onProgress).toHaveBeenCalledWith({
    error: 'No video track in display stream',
    type: 'ERROR',
  });
  expect(deps.removeMarker).toHaveBeenCalledOnce();
});

it('warns when stop is requested without an active recorder', () => {
  const { deps } = createDeps();
  const session = createRegionCaptureSession(deps);

  session.stop();

  expect(loggerMocks.warnMock).toHaveBeenCalledWith('Stop requested without active recording');
});

it('stops active recordings and runs deferred cleanup', async () => {
  const { deps, finalTrack, micTrack, recorder, scheduleTimeout } = createDeps();
  const session = createRegionCaptureSession(deps);

  await session.start({ quality: 'high', systemAudioEnabled: true } as never, vi.fn());
  session.stop();
  const cleanup = scheduleTimeout.mock.results[0]?.value as () => void;
  cleanup();

  expect(recorder.stop).toHaveBeenCalledOnce();
  expect(finalTrack.stop).toHaveBeenCalledOnce();
  expect(micTrack.stop).toHaveBeenCalledOnce();
  expect(deps.removeMarker).toHaveBeenCalledOnce();
});

it('disposes the session and reports audio-context close failures', async () => {
  const { deps } = createDeps({
    resolveCaptureStream: vi.fn(async () => ({
      audioContext: { close: vi.fn(() => Promise.reject(new Error('close failed'))) },
      finalStream: { getTracks: () => [createTrack()] },
      micStream: { getTracks: () => [createTrack()] },
    })),
  });
  const session = createRegionCaptureSession(deps);

  await session.start({ quality: 'high', systemAudioEnabled: true } as never, vi.fn());
  session.dispose();
  await Promise.resolve();
  await Promise.resolve();

  expect(loggerMocks.warnMock).toHaveBeenCalledWith(
    'Failed to close region-capture audio context',
    expect.any(Error)
  );
});
