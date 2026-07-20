import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    controlledCursorCaptureEnabled: false,
  };
}

function createAnnotationDeps(overrides: Partial<AnnotationDeps> = {}): AnnotationDeps {
  return {
    logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    sendTabMessage: vi.fn().mockResolvedValue(undefined),
    supportsAnnotations: () => false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function registerUnsupportedAnnotationModeTest() {
  it('returns undefined without messaging when the mode does not support annotations', async () => {
    const sendTabMessage = vi.fn().mockResolvedValue(undefined);
    const deps = createAnnotationDeps({
      sendTabMessage,
      supportsAnnotations: () => false,
    });

    await expect(
      enableAnnotationsIfNeeded(5, CaptureMode.SCREEN, createVideoSettings(), undefined, deps)
    ).resolves.toBeUndefined();

    expect(sendTabMessage).not.toHaveBeenCalled();
  });
}

function registerAnnotationSuccessTest() {
  it('returns viewport data when the annotation request succeeds', async () => {
    const viewport = {
      devicePixelRatio: 1,
      height: 720,
      scrollX: 0,
      scrollY: 0,
      width: 1280,
    };
    const sendTabMessageMock = vi.fn();
    const response: TabResponseByType[VideoMessageType.ENABLE_ANNOTATIONS] = {
      success: true,
      viewport,
    };
    const sendTabMessage: AnnotationDeps['sendTabMessage'] = async <
      TMessage extends TabRequestByType[TabMessageType],
    >(
      tabId: number,
      message: TMessage
    ) => {
      sendTabMessageMock(tabId, message);

      if (message.type !== VideoMessageType.ENABLE_ANNOTATIONS) {
        throw new Error(`Unexpected message type: ${message.type}`);
      }

      return response as TabResponseByType[TMessage['type']];
    };
    const deps = createAnnotationDeps({
      sendTabMessage,
      supportsAnnotations: () => true,
    });

    await expect(
      enableAnnotationsIfNeeded(5, CaptureMode.TAB, createVideoSettings(), undefined, deps)
    ).resolves.toEqual(viewport);

    expect(sendTabMessageMock).toHaveBeenCalledWith(5, {
      type: VideoMessageType.ENABLE_ANNOTATIONS,
      settings: createVideoSettings(),
    });
  });
}

function registerAnnotationFailureTest() {
  it('returns undefined when the annotation request fails', async () => {
    const loggerError = vi.fn();
    const sendTabMessage = vi.fn().mockRejectedValue(new Error('annotations failed'));
    const deps = createAnnotationDeps({
      logger: { debug: vi.fn(), error: loggerError, log: vi.fn(), warn: vi.fn() },
      sendTabMessage,
      supportsAnnotations: () => true,
    });

    await expect(
      enableAnnotationsIfNeeded(5, CaptureMode.TAB, createVideoSettings(), undefined, deps)
    ).resolves.toBeUndefined();

    expect(loggerError).toHaveBeenCalledWith(
      '[VideoManager] Failed to enable annotations:',
      expect.any(Error)
    );
  });

  it('rethrows annotation setup failures when controlled cursor capture is enabled', async () => {
    const sendTabMessage = vi.fn().mockRejectedValue(new Error('annotations failed'));

    await expect(
      enableAnnotationsIfNeeded(
        5,
        CaptureMode.TAB,
        {
          ...createVideoSettings(),
          controlledCursorCaptureEnabled: true,
        },
        'recording-1',
        createAnnotationDeps({
          sendTabMessage,
          supportsAnnotations: () => true,
        })
      )
    ).rejects.toThrow('annotations failed');
  });
}

describe('enableAnnotationsIfNeeded', () => {
  registerUnsupportedAnnotationModeTest();
  registerAnnotationSuccessTest();
  registerAnnotationFailureTest();
});
