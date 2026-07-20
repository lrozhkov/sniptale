import type { Logger } from '@sniptale/platform/observability/logger/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { translate } from '../../../../platform/i18n';
import type { RuntimeMessagingTransport } from '../../../../platform/runtime-messaging/transport';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type {
  VideoRecordingSettings,
  ViewportInfo,
} from '@sniptale/runtime-contracts/video/types/types';
import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { supportsAnnotations } from '../capture-source';
import type { TabResponseByType } from '../../../../contracts/messaging/tab';
import {
  setControlledCursorAutoPaused,
  setControlledCursorCaptureEnabled,
  setControlledCursorNavigationPending,
  setControlledCursorOffsetSeconds,
  setControlledCursorVerifiedMode,
} from '../session-state';
import { VideoCursorCaptureMode } from '../../../../features/video/project/types';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';

type PreflightLogger = Pick<Logger, 'debug' | 'error' | 'log' | 'warn'>;

type AnnotationDeps = {
  logger: PreflightLogger;
  sendTabMessage: RuntimeMessagingTransport['sendTabMessage'];
  supportsAnnotations: typeof supportsAnnotations;
};

const defaultAnnotationDeps: AnnotationDeps = {
  logger: createLogger({ namespace: 'BackgroundVideoPreflight:Annotations' }),
  sendTabMessage: (tabId, message) =>
    getBackgroundRuntimeMessaging().sendTabMessage(tabId, message),
  supportsAnnotations,
};

function isControlledCursorCaptureEnabled(settings: VideoRecordingSettings): boolean {
  return settings.controlledCursorCaptureEnabled === true;
}

function createControlledCursorCaptureSetupError(): Error {
  return new Error(translate('background.runtime.controlledCursorCaptureSetupFailed'));
}

function markControlledCursorCaptureReady(): void {
  setControlledCursorCaptureEnabled(true);
  setControlledCursorAutoPaused(false);
  setControlledCursorNavigationPending(false);
  setControlledCursorOffsetSeconds(0);
  setControlledCursorVerifiedMode(VideoCursorCaptureMode.EMBEDDED_FALLBACK);
}

function getViewportFromResponse(
  response: TabResponseByType[typeof VideoMessageType.ENABLE_ANNOTATIONS]
): ViewportInfo | undefined {
  return response.success ? response.viewport : undefined;
}

async function requestAnnotationViewport(
  tabId: number,
  settings: VideoRecordingSettings,
  deps: Pick<AnnotationDeps, 'sendTabMessage'>,
  recordingId?: string
): Promise<ViewportInfo | undefined> {
  const response: TabResponseByType[typeof VideoMessageType.ENABLE_ANNOTATIONS] =
    await deps.sendTabMessage(tabId, {
      type: VideoMessageType.ENABLE_ANNOTATIONS,
      settings,
      ...(recordingId === undefined ? {} : { recordingId }),
    });
  return getViewportFromResponse(response);
}

async function requestControlledCursorViewport(
  tabId: number,
  recordingId: string,
  deps: Pick<AnnotationDeps, 'sendTabMessage'>
): Promise<ViewportInfo | undefined> {
  const response: TabResponseByType[typeof VideoMessageType.ENABLE_ANNOTATIONS] =
    await deps.sendTabMessage(tabId, {
      type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
      recordingId,
    });
  return getViewportFromResponse(response);
}

export async function enableAnnotationsIfNeeded(
  tabId: number,
  captureMode: CaptureMode,
  settings: VideoRecordingSettings,
  recordingId?: string,
  deps: AnnotationDeps = defaultAnnotationDeps
): Promise<ViewportInfo | undefined> {
  const controlledCursorCaptureEnabled = isControlledCursorCaptureEnabled(settings);

  if (!deps.supportsAnnotations(captureMode) && !controlledCursorCaptureEnabled) {
    deps.logger.debug('Skipping annotations for unsupported capture mode', captureMode);
    return undefined;
  }

  if (controlledCursorCaptureEnabled && typeof recordingId !== 'string') {
    throw createControlledCursorCaptureSetupError();
  }

  try {
    const viewport = controlledCursorCaptureEnabled
      ? await requestControlledCursorViewport(tabId, recordingId as string, deps)
      : await requestAnnotationViewport(tabId, settings, deps, recordingId);

    if (viewport) {
      if (controlledCursorCaptureEnabled) {
        markControlledCursorCaptureReady();
      }
      deps.logger.debug('Received annotation viewport from content script', viewport);
      return viewport;
    }

    if (controlledCursorCaptureEnabled) {
      throw createControlledCursorCaptureSetupError();
    }
  } catch (error) {
    deps.logger.error('[VideoManager] Failed to enable annotations:', error);
    if (controlledCursorCaptureEnabled) {
      throw error instanceof Error ? error : createControlledCursorCaptureSetupError();
    }
  }

  return undefined;
}
