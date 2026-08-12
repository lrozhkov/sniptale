import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { prepareContentSurfaceIfNeeded } from './preflight.content-surface';
import {
  getVideoRecordingSurfaceLeaseSnapshot,
  requestVideoRecordingSurface,
  resetVideoRecordingSurfaceLeaseForTests,
} from '../content-surface/surface-lease';

type SurfaceDeps = NonNullable<Parameters<typeof prepareContentSurfaceIfNeeded>[4]>;

function deps(sendTabMessage: SurfaceDeps['sendTabMessage'], supported = true): SurfaceDeps {
  return {
    logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    sendTabMessage,
    supportsAnnotations: () => supported,
  };
}

beforeEach(() => {
  resetVideoRecordingSurfaceLeaseForTests();
});

it('reads viewport without enabling the retired annotations overlay', async () => {
  const viewport = {
    devicePixelRatio: 1,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    width: 1280,
  };
  const sendTabMessage = vi.fn().mockResolvedValue({ success: true, viewport });
  await expect(
    prepareContentSurfaceIfNeeded(
      5,
      CaptureMode.TAB,
      {
        ...DEFAULT_VIDEO_SETTINGS,
        recordingSurface: { toolbarEnabled: false, cursorSpotlightEnabled: false },
      },
      'recording-1',
      deps(sendTabMessage)
    )
  ).resolves.toEqual(viewport);
  expect(sendTabMessage).toHaveBeenCalledWith(5, { type: VideoMessageType.GET_VIEWPORT_COORDS });
});

it('does not touch content for unsupported capture modes', async () => {
  const sendTabMessage = vi.fn();
  await expect(
    prepareContentSurfaceIfNeeded(
      5,
      CaptureMode.SCREEN,
      DEFAULT_VIDEO_SETTINGS,
      undefined,
      deps(sendTabMessage, false)
    )
  ).resolves.toBeUndefined();
  expect(sendTabMessage).not.toHaveBeenCalled();
});

it('opens and binds the video surface when popup auto-open is enabled', async () => {
  const viewport = {
    devicePixelRatio: 1,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    width: 1280,
  };
  const sendTabMessage = vi.fn().mockResolvedValue({ success: true, viewport });

  await prepareContentSurfaceIfNeeded(
    5,
    CaptureMode.TAB,
    {
      ...DEFAULT_VIDEO_SETTINGS,
      recordingSurface: { cursorSpotlightEnabled: false, toolbarEnabled: true },
    },
    'recording-1',
    deps(sendTabMessage)
  );

  expect(getVideoRecordingSurfaceLeaseSnapshot()).toMatchObject({
    entry: 'popup',
    lifecycle: 'ready',
    recordingId: 'recording-1',
    tabId: 5,
  });
  expect(sendTabMessage).toHaveBeenCalledWith(
    5,
    expect.objectContaining({ type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT })
  );
});

it('binds an embedded camera without switching the toolbar mode when auto-open is disabled', async () => {
  const sendTabMessage = vi.fn().mockResolvedValue({
    success: true,
    viewport: { devicePixelRatio: 1, height: 720, scrollX: 0, scrollY: 0, width: 1280 },
  });
  await prepareContentSurfaceIfNeeded(
    5,
    CaptureMode.TAB,
    {
      ...DEFAULT_VIDEO_SETTINGS,
      webcamEnabled: true,
      recordingSurface: { cursorSpotlightEnabled: false, toolbarEnabled: false },
    },
    'recording-embedded',
    deps(sendTabMessage)
  );
  expect(getVideoRecordingSurfaceLeaseSnapshot()).toMatchObject({
    recordingId: 'recording-embedded',
    toolbarRequested: false,
  });
  expect(sendTabMessage).toHaveBeenCalledWith(
    5,
    expect.objectContaining({
      type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
      snapshot: expect.objectContaining({ toolbarRequested: false, webcamEnabled: true }),
    })
  );
});

it('binds an already-open manual video surface even when popup auto-open is disabled', async () => {
  const existing = await requestVideoRecordingSurface({ entry: 'manual', tabId: 5 });
  const viewport = {
    devicePixelRatio: 1,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    width: 1280,
  };
  const sendTabMessage = vi.fn().mockResolvedValue({ success: true, viewport });

  await prepareContentSurfaceIfNeeded(
    5,
    CaptureMode.TAB,
    {
      ...DEFAULT_VIDEO_SETTINGS,
      recordingSurface: { cursorSpotlightEnabled: false, toolbarEnabled: false },
    },
    'recording-2',
    deps(sendTabMessage)
  );

  expect(getVideoRecordingSurfaceLeaseSnapshot()).toMatchObject({
    entry: 'manual',
    recordingId: 'recording-2',
    surfaceSessionId: existing.surfaceSessionId,
  });
  expect(sendTabMessage).toHaveBeenCalledWith(
    5,
    expect.objectContaining({ type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT })
  );
});

it('promotes an existing camera-only surface when popup auto-open is enabled', async () => {
  const existing = await requestVideoRecordingSurface({
    entry: 'popup',
    tabId: 5,
    toolbarRequested: false,
  });
  const sendTabMessage = vi.fn().mockResolvedValue({
    success: true,
    viewport: { devicePixelRatio: 1, height: 720, scrollX: 0, scrollY: 0, width: 1280 },
  });

  await prepareContentSurfaceIfNeeded(
    5,
    CaptureMode.TAB,
    {
      ...DEFAULT_VIDEO_SETTINGS,
      recordingSurface: { cursorSpotlightEnabled: false, toolbarEnabled: true },
    },
    'recording-promoted',
    deps(sendTabMessage)
  );

  expect(getVideoRecordingSurfaceLeaseSnapshot()).toMatchObject({
    recordingId: 'recording-promoted',
    surfaceSessionId: existing.surfaceSessionId,
    toolbarRequested: true,
  });
  expect(sendTabMessage).toHaveBeenCalledWith(
    5,
    expect.objectContaining({
      snapshot: expect.objectContaining({ toolbarRequested: true }),
      type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
    })
  );
});
