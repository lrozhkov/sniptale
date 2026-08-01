import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
    },
    tabOutputGeometry: null as null | {
      coordinateSpace: { devicePixelRatio: number; height: number; width: number };
      fit: 'contain' | 'cover' | 'source';
      logicalContentRect: { height: number; width: number; x: number; y: number };
      outputSize: { height: number; width: number };
      requestedCrop: { height: number; width: number; x: number; y: number };
      sourceRect: { height: number; width: number; x: number; y: number };
      sourceSize: { height: number; width: number };
      tracksFullViewport: boolean;
    },
  },
}));

vi.mock('../recording/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/context')>()),
  recordingContext: mocks.context,
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
});

it('remaps a resized full TAB viewport inside an unchanged raw proxy', async () => {
  const applyFrozenSourceGeometry = vi.fn(() => 'applied');
  mocks.context.sourceStream = { id: 'source-stream' };
  mocks.context.tabOutputControls = {
    activate: vi.fn(),
    applyFrozenSourceGeometry,
    readFrozenSourceSize: vi.fn(() => ({ height: 1440, width: 2560 })),
    setFrozen: vi.fn(),
  };
  mocks.context.tabOutputGeometry = {
    coordinateSpace: { devicePixelRatio: 1, width: 1904, height: 985 },
    fit: 'source',
    logicalContentRect: {
      x: 0,
      y: (1440 - (2560 * 985) / 1904) / 2,
      width: 2560,
      height: (2560 * 985) / 1904,
    },
    requestedCrop: { x: 0, y: 0, width: 1904, height: 985 },
    sourceSize: { width: 2560, height: 1440 },
    sourceRect: { x: 0, y: 58, width: 2560, height: 1324 },
    outputSize: { width: 1904, height: 984 },
    tracksFullViewport: true,
  };
  const sendResponse = vi.fn();

  await handleOffscreenRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      capabilityToken: 'test-capability',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
      transitionId: 'resize-1',
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
      outputSize: { width: 1904, height: 984 },
      requestedCrop: { x: 0, y: 0, width: 1600, height: 900 },
      sourceRect: { x: 0, y: 0, width: 2560, height: 1440 },
      tracksFullViewport: true,
    })
  );
  expect(sendResponse).toHaveBeenCalledWith({
    result: 'ALLOW',
    success: true,
    videoHeight: 1440,
    videoWidth: 2560,
  });
});
