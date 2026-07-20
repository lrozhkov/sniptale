import { beforeEach, expect, it, vi } from 'vitest';

import type {
  TabMessageType,
  TabRequestByType,
  TabResponseByType,
} from '../../../../contracts/messaging/tab';
import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { enableAnnotationsIfNeeded } from './preflight.annotations';

type AnnotationDeps = NonNullable<Parameters<typeof enableAnnotationsIfNeeded>[4]>;

function createVideoSettings(): VideoRecordingSettings {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: true,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
    controlledCursorCaptureEnabled: true,
  };
}

function createAnnotationDeps(overrides: Partial<AnnotationDeps> = {}): AnnotationDeps {
  return {
    logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    sendTabMessage: vi.fn().mockResolvedValue(undefined),
    supportsAnnotations: () => true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('allows cursor-track bootstrap outside TAB mode when the content bridge responds', async () => {
  const viewport = {
    devicePixelRatio: 1,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    width: 1280,
  };

  await expect(
    enableAnnotationsIfNeeded(
      5,
      CaptureMode.SCREEN,
      createVideoSettings(),
      'recording-1',
      createAnnotationDeps({
        sendTabMessage: vi.fn().mockResolvedValue({ success: true, viewport }),
        supportsAnnotations: () => false,
      })
    )
  ).resolves.toEqual(viewport);

  await expect(
    enableAnnotationsIfNeeded(
      5,
      CaptureMode.TAB_CROP,
      createVideoSettings(),
      'recording-1',
      createAnnotationDeps({
        sendTabMessage: vi.fn().mockResolvedValue({ success: true, viewport }),
      })
    )
  ).resolves.toEqual(viewport);
});

async function expectDedicatedControlledCursorBootstrap(captureMode: CaptureMode) {
  const viewport = {
    devicePixelRatio: 1,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    width: 1280,
  };
  const sendTabMessageMock = vi.fn();
  const sendTabMessage: AnnotationDeps['sendTabMessage'] = async <
    TMessage extends TabRequestByType[TabMessageType],
  >(
    tabId: number,
    message: TMessage
  ) => {
    sendTabMessageMock(tabId, message);
    return {
      success: true,
      viewport,
    } as TabResponseByType[TMessage['type']];
  };

  await expect(
    enableAnnotationsIfNeeded(
      5,
      captureMode,
      createVideoSettings(),
      'recording-1',
      createAnnotationDeps({ sendTabMessage })
    )
  ).resolves.toEqual(viewport);

  expect(sendTabMessageMock).toHaveBeenCalledWith(5, {
    type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
    recordingId: 'recording-1',
  });
}

it('requires a recording id and viewport metadata for controlled cursor bootstrap', async () => {
  await expect(
    enableAnnotationsIfNeeded(
      5,
      CaptureMode.TAB,
      createVideoSettings(),
      undefined,
      createAnnotationDeps()
    )
  ).rejects.toThrow('Не удалось подготовить управляемый захват курсора');

  await expect(
    enableAnnotationsIfNeeded(
      5,
      CaptureMode.TAB,
      createVideoSettings(),
      'recording-1',
      createAnnotationDeps({
        sendTabMessage: vi.fn().mockResolvedValue({ success: true }),
      })
    )
  ).rejects.toThrow('Не удалось подготовить управляемый захват курсора');
});

it('uses the dedicated controlled cursor bootstrap message for recording telemetry modes', async () => {
  await expectDedicatedControlledCursorBootstrap(CaptureMode.TAB);
  await expectDedicatedControlledCursorBootstrap(CaptureMode.TAB_CROP);
  await expectDedicatedControlledCursorBootstrap(CaptureMode.VIEWPORT_EMULATION);
});

it('skips unsupported capture modes when cursor telemetry is disabled', async () => {
  await expect(
    enableAnnotationsIfNeeded(
      5,
      CaptureMode.SCREEN,
      {
        ...createVideoSettings(),
        controlledCursorCaptureEnabled: false,
      },
      undefined,
      createAnnotationDeps({
        supportsAnnotations: () => false,
      })
    )
  ).resolves.toBeUndefined();
});

it('returns undefined when plain annotation bootstrap does not provide a viewport', async () => {
  const sendTabMessageMock = vi.fn().mockResolvedValue({ success: true });

  await expect(
    enableAnnotationsIfNeeded(
      5,
      CaptureMode.TAB,
      {
        ...createVideoSettings(),
        controlledCursorCaptureEnabled: false,
      },
      undefined,
      createAnnotationDeps({
        sendTabMessage: sendTabMessageMock,
      })
    )
  ).resolves.toBeUndefined();

  expect(sendTabMessageMock).toHaveBeenCalledWith(5, {
    type: VideoMessageType.ENABLE_ANNOTATIONS,
    settings: {
      ...createVideoSettings(),
      controlledCursorCaptureEnabled: false,
    },
  });
});
