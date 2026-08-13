import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  stopRecording: vi.fn(),
  context: {
    matchesSourceBinding: vi.fn(() => true),
    sourceStream: null as null | { id: string },
    sourceVideoHeight: 0,
    sourceVideoWidth: 0,
    tabOutputControls: null as null | {
      activate: ReturnType<typeof vi.fn>;
      applyFrozenSourceGeometry: ReturnType<typeof vi.fn>;
      readFrozenSourceSize: ReturnType<typeof vi.fn>;
      setFrozen: ReturnType<typeof vi.fn>;
      verifyFrozenSourceFrame?: ReturnType<typeof vi.fn>;
    },
    tabOutputGeometry: null as null | {
      coordinateSpace: { devicePixelRatio: number; height: number; width: number };
      fit: 'contain';
      frameRateCap: 30;
      logicalContentRect: { height: number; width: number; x: number; y: number };
      outputBasis: { height: number; width: number };
      outputSize: { height: number; width: number };
      requestedCrop: { height: number; width: number; x: number; y: number };
      sourceRect: { height: number; width: number; x: number; y: number };
      sourceSize: { height: number; width: number };
      tracksFullViewport: boolean;
    },
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ warn: mocks.loggerWarn }),
}));

vi.mock('../recording/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/context')>()),
  recordingContext: mocks.context,
}));
vi.mock('../recording/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/controller')>()),
  stopRecording: mocks.stopRecording,
}));

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { handleOffscreenRuntimeMessage } from './routing';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.matchesSourceBinding.mockReturnValue(true);
  mocks.context.sourceStream = null;
  mocks.context.sourceVideoHeight = 0;
  mocks.context.sourceVideoWidth = 0;
  mocks.context.tabOutputControls = null;
  mocks.context.tabOutputGeometry = null;
  mocks.stopRecording.mockResolvedValue({ result: 'accepted' });
});

it('remaps a full TAB from a marked frame and allows only a later clean frame', async () => {
  const applyFrozenSourceGeometry = vi.fn(() => 'applied');
  const verifyFrozenSourceFrame = vi
    .fn()
    .mockResolvedValueOnce({
      result: 'applied',
      frame: {
        presentedFrames: 10,
        sourceSize: { height: 1080, width: 1920 },
        viewportRect: { x: 120, y: 60, width: 1680, height: 945 },
      },
    })
    .mockResolvedValueOnce({
      result: 'applied',
      frame: {
        presentedFrames: 12,
        sourceSize: { height: 1080, width: 1920 },
        viewportRect: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    });
  mocks.context.sourceStream = { id: 'source-stream' };
  mocks.context.tabOutputControls = {
    activate: vi.fn(),
    applyFrozenSourceGeometry,
    readFrozenSourceSize: vi.fn(() => ({ height: 1440, width: 2560 })),
    setFrozen: vi.fn(),
    verifyFrozenSourceFrame,
  };
  mocks.context.tabOutputGeometry = {
    coordinateSpace: { devicePixelRatio: 1, width: 1904, height: 985 },
    fit: 'contain',
    frameRateCap: 30,
    logicalContentRect: {
      x: 0,
      y: (1440 - (2560 * 985) / 1904) / 2,
      width: 2560,
      height: (2560 * 985) / 1904,
    },
    outputBasis: { width: 1904, height: 985 },
    requestedCrop: { x: 0, y: 0, width: 1904, height: 985 },
    sourceSize: { width: 2560, height: 1440 },
    sourceRect: { x: 0, y: 58, width: 2560, height: 1324 },
    outputSize: { width: 1904, height: 984 },
    tracksFullViewport: true,
  };
  const sendResponse = vi.fn();
  const verification = {
    pattern: {
      edgeThicknessCss: 8,
      colors: {
        top: { red: 236, green: 32, blue: 58 },
        right: { red: 38, green: 220, blue: 75 },
        bottom: { red: 42, green: 72, blue: 232 },
        left: { red: 226, green: 42, blue: 214 },
      },
    },
  } as const;

  await handleOffscreenRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      capabilityToken: 'test-capability',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
      transitionId: 'resize-1',
      verification: { ...verification, phase: 'marked' },
      viewport: {
        devicePixelRatio: 1,
        height: 900,
        scrollX: 0,
        scrollY: 0,
        visualViewportScale: 1,
        width: 1600,
      },
    },
    sendResponse
  );

  expect(applyFrozenSourceGeometry).toHaveBeenCalledWith(
    'resize-1',
    expect.objectContaining({
      fit: 'contain',
      frameRateCap: 30,
      outputBasis: { width: 1904, height: 985 },
      outputSize: { width: 1904, height: 984 },
      requestedCrop: { x: 0, y: 0, width: 1600, height: 900 },
      sourceRect: { x: 120, y: 60, width: 1680, height: 945 },
      tracksFullViewport: true,
    })
  );
  expect(sendResponse).toHaveBeenCalledWith({
    result: 'ALLOW',
    success: true,
    videoHeight: 1080,
    videoWidth: 1920,
  });

  await handleOffscreenRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      capabilityToken: 'test-capability',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
      transitionId: 'resize-1',
      verification: { ...verification, phase: 'clean' },
      viewport: {
        devicePixelRatio: 1,
        height: 900,
        scrollX: 0,
        scrollY: 0,
        visualViewportScale: 1,
        width: 1600,
      },
    },
    sendResponse
  );
  expect(verifyFrozenSourceFrame).toHaveBeenCalledTimes(2);
  expect(applyFrozenSourceGeometry).toHaveBeenCalledOnce();
});

it('warns and contains an invalidated TAB_CROP resize without denying STOP', async () => {
  const applyFrozenSourceGeometry = vi.fn(() => 'applied');
  mocks.context.sourceStream = { id: 'source-stream' };
  mocks.context.tabOutputControls = {
    activate: vi.fn(),
    applyFrozenSourceGeometry,
    readFrozenSourceSize: vi.fn(() => ({ height: 1080, width: 1920 })),
    setFrozen: vi.fn(),
  };
  mocks.context.tabOutputGeometry = {
    coordinateSpace: { devicePixelRatio: 2, width: 1280, height: 720 },
    fit: 'contain',
    frameRateCap: 30,
    logicalContentRect: { x: 0, y: 0, width: 2560, height: 1440 },
    outputBasis: { width: 300, height: 300 },
    requestedCrop: { x: 700, y: 300, width: 300, height: 300 },
    sourceSize: { width: 2560, height: 1440 },
    sourceRect: { x: 1400, y: 600, width: 600, height: 600 },
    outputSize: { width: 300, height: 300 },
    tracksFullViewport: false,
  };
  const sendResponse = vi.fn();

  await handleOffscreenRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      capabilityToken: 'test-capability',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
      transitionId: 'resize-crop-1',
      viewport: {
        devicePixelRatio: 2,
        height: 600,
        scrollX: 0,
        scrollY: 0,
        visualViewportScale: 1,
        width: 800,
      },
    },
    sendResponse
  );

  expect(applyFrozenSourceGeometry).toHaveBeenCalledWith(
    'resize-crop-1',
    expect.objectContaining({
      fit: 'contain',
      outputBasis: { width: 300, height: 300 },
      outputSize: { width: 300, height: 300 },
      sourceRect: { x: 240, y: 0, width: 1440, height: 1080 },
    })
  );
  expect(mocks.loggerWarn).toHaveBeenCalledWith(
    'Tab crop no longer fits the resized viewport; containing the available frame'
  );
  expect(sendResponse).toHaveBeenCalledWith({
    result: 'ALLOW',
    success: true,
    videoHeight: 1080,
    videoWidth: 1920,
  });

  await expect(
    handleOffscreenRuntimeMessage({
      type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
      capabilityToken: 'test-capability',
      discard: false,
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
    })
  ).resolves.toEqual({ result: 'accepted' });
  expect(mocks.stopRecording).toHaveBeenCalledOnce();
});
