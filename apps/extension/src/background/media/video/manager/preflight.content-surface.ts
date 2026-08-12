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
import { WebcamPresentationMode } from '@sniptale/runtime-contracts/video/types/types';
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
import {
  ensureVideoRecordingSurfaceLeaseHydrated,
  getVideoRecordingSurfaceLeaseSnapshot,
  requestVideoRecordingSurface,
  updateVideoRecordingSurface,
} from '../content-surface/surface-lease';
import { createVideoRecordingSurfaceSnapshot } from '../content-surface/snapshot';

type PreflightLogger = Pick<Logger, 'debug' | 'error' | 'log' | 'warn'>;

type ContentSurfaceDeps = {
  logger: PreflightLogger;
  sendTabMessage: RuntimeMessagingTransport['sendTabMessage'];
  supportsAnnotations: typeof supportsAnnotations;
};

const defaultContentSurfaceDeps: ContentSurfaceDeps = {
  logger: createLogger({ namespace: 'BackgroundVideoPreflight:ContentSurface' }),
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

async function bindContentSurfaceIfRequested(
  tabId: number,
  settings: VideoRecordingSettings,
  deps: Pick<ContentSurfaceDeps, 'sendTabMessage'>,
  recordingId?: string
): Promise<void> {
  await ensureVideoRecordingSurfaceLeaseHydrated();
  const currentLease = getVideoRecordingSurfaceLeaseSnapshot();
  const existingLease = currentLease?.tabId === tabId ? currentLease : null;
  const toolbarRequested = settings.recordingSurface?.toolbarEnabled === true;
  const embeddedCameraRequested =
    settings.webcamEnabled === true &&
    settings.webcamPresentation?.mode === WebcamPresentationMode.EMBEDDED;
  if (!toolbarRequested && !embeddedCameraRequested && !existingLease) return;

  const lease = existingLease
    ? ((await updateVideoRecordingSurface(existingLease.surfaceSessionId, {
        lifecycle: 'ready',
        recordingId: recordingId ?? existingLease.recordingId,
        toolbarRequested: existingLease.toolbarRequested || toolbarRequested,
      })) ?? existingLease)
    : await requestVideoRecordingSurface({
        entry: 'popup',
        recordingId: recordingId ?? null,
        tabId,
        toolbarRequested,
      });
  const readyLease =
    lease.lifecycle === 'ready'
      ? lease
      : ((await updateVideoRecordingSurface(lease.surfaceSessionId, { lifecycle: 'ready' })) ??
        lease);
  await deps.sendTabMessage(tabId, {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
    snapshot: createVideoRecordingSurfaceSnapshot(readyLease, settings),
    surfaceToken: readyLease.surfaceToken,
  });
}

async function requestViewport(
  tabId: number,
  deps: Pick<ContentSurfaceDeps, 'sendTabMessage'>
): Promise<ViewportInfo | undefined> {
  const viewportResponse = await deps.sendTabMessage(tabId, {
    type: VideoMessageType.GET_VIEWPORT_COORDS,
  });
  return viewportResponse.success ? viewportResponse.viewport : undefined;
}

async function requestControlledCursorViewport(
  tabId: number,
  recordingId: string,
  deps: Pick<ContentSurfaceDeps, 'sendTabMessage'>
): Promise<ViewportInfo | undefined> {
  const response: TabResponseByType[typeof VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE] =
    await deps.sendTabMessage(tabId, {
      type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
      recordingId,
    });
  return response.success ? response.viewport : undefined;
}

export async function prepareContentSurfaceIfNeeded(
  tabId: number,
  captureMode: CaptureMode,
  settings: VideoRecordingSettings,
  recordingId?: string,
  deps: ContentSurfaceDeps = defaultContentSurfaceDeps
): Promise<ViewportInfo | undefined> {
  const controlledCursorCaptureEnabled = isControlledCursorCaptureEnabled(settings);

  if (!deps.supportsAnnotations(captureMode) && !controlledCursorCaptureEnabled) {
    deps.logger.debug('Skipping content surface for unsupported capture mode', captureMode);
    return undefined;
  }

  if (controlledCursorCaptureEnabled && typeof recordingId !== 'string') {
    throw createControlledCursorCaptureSetupError();
  }

  try {
    const viewport = controlledCursorCaptureEnabled
      ? await requestControlledCursorViewport(tabId, recordingId as string, deps)
      : await requestViewport(tabId, deps);

    if (deps.supportsAnnotations(captureMode)) {
      await bindContentSurfaceIfRequested(tabId, settings, deps, recordingId);
    }

    if (viewport) {
      if (controlledCursorCaptureEnabled) {
        markControlledCursorCaptureReady();
      }
      deps.logger.debug('Received content surface viewport from content script', viewport);
      return viewport;
    }

    if (controlledCursorCaptureEnabled) {
      throw createControlledCursorCaptureSetupError();
    }
  } catch (error) {
    deps.logger.error('[VideoManager] Failed to prepare content surface:', error);
    if (controlledCursorCaptureEnabled) {
      throw error instanceof Error ? error : createControlledCursorCaptureSetupError();
    }
  }

  return undefined;
}
