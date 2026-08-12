import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoCursorCaptureMode } from '../../../../../../features/video/project/types';
import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { awaitBestEffort, runBestEffort } from '@sniptale/foundation/best-effort';
import { createLogger } from '@sniptale/platform/observability/logger';
import { saveRecordingTelemetrySafely } from '../../../../../../workflows/media-hub/store';
import { getBackgroundRuntimeMessaging } from '../../../../../routing-contracts/runtime-messaging/services';
import {
  appendControlledCursorTelemetry,
  getControlledCursorDisplaySurface,
  getControlledCursorVerifiedMode,
  getControlledCursorTelemetry,
  getVideoRecordingId,
  isControlledCursorCaptureEnabled,
  isControlledCursorNavigationPending,
} from '../../../session-state';
import { disableControlledCursorCapture } from '../controlled-cursor/messages';
import {
  resolveStopFailureLogger,
  type StopFailureLogger,
  type StopFailureLogging,
} from './failure-logging';
import {
  getVideoRecordingSurfaceLeaseSnapshot,
  updateVideoRecordingSurface,
} from '../../../content-surface/surface-lease';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeControls' });

type StopContext = {
  mode: CaptureMode | null;
  tabId: number | null;
};

let pendingStopSideEffects: Promise<void> = Promise.resolve();

function resolvePersistedCursorCaptureMode(): VideoCursorCaptureMode {
  return getControlledCursorVerifiedMode() ?? VideoCursorCaptureMode.EMBEDDED_FALLBACK;
}

function normalizeTelemetrySnapshot(
  telemetry: NonNullable<ReturnType<typeof getControlledCursorTelemetry>>
) {
  if (!isControlledCursorCaptureEnabled()) {
    return telemetry;
  }

  const captureMode = resolvePersistedCursorCaptureMode();
  return {
    ...telemetry,
    cursorTrack:
      telemetry.cursorTrack === null
        ? null
        : {
            ...telemetry.cursorTrack,
            captureMode,
            skin: {
              ...telemetry.cursorTrack.skin,
              hidden: captureMode === VideoCursorCaptureMode.EMBEDDED_FALLBACK,
            },
          },
  };
}

async function disableAnnotationsAndPersistTelemetry(
  context: StopContext,
  failureLogger: StopFailureLogger
): Promise<void> {
  const { mode, tabId } = context;
  if (!tabId) {
    return;
  }

  const surface = getVideoRecordingSurfaceLeaseSnapshot();
  if (surface?.tabId === tabId) {
    await updateVideoRecordingSurface(surface.surfaceSessionId, { recordingId: null });
  }

  const recordingId = getVideoRecordingId();
  const telemetry = await collectTelemetrySnapshot(tabId, failureLogger);

  if (!recordingId || telemetry === null) {
    return;
  }

  const normalizedTelemetry = normalizeTelemetrySnapshot(telemetry);
  const timestamp = Date.now();
  await saveRecordingTelemetrySafely({
    recordingId,
    createdAt: timestamp,
    updatedAt: timestamp,
    captureMode: mode,
    displaySurface: getControlledCursorDisplaySurface(),
    viewport: normalizedTelemetry.viewport,
    cursorTrack: normalizedTelemetry.cursorTrack,
    actionEvents: normalizedTelemetry.actionEvents,
    signals: normalizedTelemetry.signals,
  });
}

async function collectTelemetrySnapshot(
  tabId: number,
  failureLogger: StopFailureLogger
): Promise<ReturnType<typeof getControlledCursorTelemetry> | null> {
  if (!isControlledCursorCaptureEnabled()) {
    return null;
  }

  if (!isControlledCursorNavigationPending()) {
    try {
      appendControlledCursorTelemetry(await disableControlledCursorCapture(tabId));
    } catch (error) {
      failureLogger.warn('Failed to disable controlled cursor capture during stop', error);
    }
  }

  return getControlledCursorTelemetry();
}

export function runStopSideEffects(
  context: StopContext,
  failureLogging: StopFailureLogging = 'detailed'
): void {
  const failureLogger = resolveStopFailureLogger(failureLogging, logger);
  let backgroundSideEffects: Promise<void>;
  if (context.tabId) {
    runBestEffort(
      getBackgroundRuntimeMessaging().sendTabMessage(context.tabId, {
        type: VideoMessageType.HIDE_COUNTDOWN,
      }),
      failureLogger,
      'Failed to hide recording countdown overlay',
      { tabId: context.tabId }
    );
    backgroundSideEffects = awaitBestEffort(
      disableAnnotationsAndPersistTelemetry(context, failureLogger),
      failureLogger,
      'Failed to disable recording annotations overlay',
      { tabId: context.tabId }
    );
  } else {
    backgroundSideEffects = Promise.resolve();
  }

  pendingStopSideEffects = backgroundSideEffects;
}

export function waitForStopSideEffects(): Promise<void> {
  return pendingStopSideEffects;
}
