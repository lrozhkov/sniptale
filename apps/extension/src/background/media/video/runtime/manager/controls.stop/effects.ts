import { mergeTelemetrySnapshots } from '../../../session-state/controlled-cursor';
import type {
  RecordingPointTransform,
  RecordingActionEvent,
} from '../../../../../../features/video/project/types';
import {
  isRecordingPoint,
  isRecordingPointTransform,
} from '../../../../../../features/video/project/validation/recording-telemetry';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoCursorCaptureMode } from '../../../../../../features/video/project/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { awaitBestEffort, runBestEffort } from '@sniptale/foundation/best-effort';
import { createLogger } from '@sniptale/platform/observability/logger';
import { saveRecordingTelemetrySafely } from '../../../../../../workflows/media-hub/store';
import { getBackgroundRuntimeMessaging } from '../../../../../routing-contracts/runtime-messaging/services';
import {
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

type StopTelemetryOptions = {
  discard?: boolean;
  recordingPointTransform?: Promise<RecordingPointTransform | null>;
};

let pendingStopSideEffects: Promise<void> = Promise.resolve();

function resolvePersistedCursorCaptureMode(): VideoCursorCaptureMode {
  return getControlledCursorVerifiedMode() ?? VideoCursorCaptureMode.EMBEDDED_FALLBACK;
}

function normalizeTelemetrySnapshot(
  telemetry: NonNullable<ReturnType<typeof getControlledCursorTelemetry>>,
  captureEnabled: boolean,
  captureMode: VideoCursorCaptureMode
) {
  if (!captureEnabled) {
    return telemetry;
  }

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

function collectAndPersistTelemetry(
  context: StopContext,
  failureLogger: StopFailureLogger,
  options: StopTelemetryOptions
): { collected: Promise<void>; persisted: Promise<void> } {
  const { mode, tabId } = context;
  const recordingId = getVideoRecordingId();
  const displaySurface = getControlledCursorDisplaySurface();
  const captureEnabled = isControlledCursorCaptureEnabled();
  const cursorMode = resolvePersistedCursorCaptureMode();
  const priorTelemetry = getControlledCursorTelemetry();
  const navigationPending = isControlledCursorNavigationPending();
  const collection = (async () => {
    if (!tabId) return null;
    const telemetryPromise = collectTelemetrySnapshot(tabId, mode, failureLogger, {
      priorTelemetry,
      navigationPending,
      captureEnabled,
    });
    const surface = getVideoRecordingSurfaceLeaseSnapshot();
    if (surface?.tabId === tabId) {
      await updateVideoRecordingSurface(surface.surfaceSessionId, { recordingId: null });
    }
    const telemetry = await telemetryPromise;
    return telemetry === null
      ? null
      : normalizeTelemetrySnapshot(telemetry, captureEnabled, cursorMode);
  })();
  return {
    collected: collection.then(
      () => undefined,
      () => undefined
    ),
    persisted: (async () => {
      const telemetry = await collection;
      const transform = await (options.recordingPointTransform ?? Promise.resolve(null));
      if (!recordingId || telemetry === null || options.discard) return;
      const timestamp = Date.now();
      await saveRecordingTelemetrySafely({
        recordingId,
        createdAt: timestamp,
        updatedAt: timestamp,
        captureMode: mode,
        displaySurface,
        viewport: telemetry.viewport,
        cursorTrack: telemetry.cursorTrack,
        actionEvents: resolveRecordingActionPoints(telemetry, transform),
        signals: telemetry.signals,
      });
    })(),
  };
}

function resolveRecordingActionPoints(
  telemetry: NonNullable<ReturnType<typeof getControlledCursorTelemetry>>,
  transform: RecordingPointTransform | null
): RecordingActionEvent[] {
  const observation = telemetry.viewportObservation;
  const admitted =
    isRecordingPointTransform(transform) &&
    !!observation?.stable &&
    Object.entries(transform.viewport).every(([key, value]) =>
      Object.entries(observation.initial).some(
        ([observedKey, observedValue]) => key === observedKey && value === observedValue
      )
    );
  return telemetry.actionEvents.map((event) => {
    let recordingPoint = null;
    if (admitted && transform && event.point) {
      const { x, y } = event.point;
      const rect = transform.visibleClientRect;
      const point = {
        x: x * transform.scaleX + transform.offsetX,
        y: y * transform.scaleY + transform.offsetY,
      };
      if (
        x >= rect.x &&
        y >= rect.y &&
        x <= rect.x + rect.width &&
        y <= rect.y + rect.height &&
        isRecordingPoint(point)
      ) {
        recordingPoint = point;
      }
    }
    return { ...event, point: event.point ? { ...event.point } : null, recordingPoint };
  });
}

async function collectTelemetrySnapshot(
  tabId: number,
  mode: CaptureMode | null,
  failureLogger: StopFailureLogger,
  frozen: {
    priorTelemetry: ReturnType<typeof getControlledCursorTelemetry>;
    navigationPending: boolean;
    captureEnabled: boolean;
  }
): Promise<ReturnType<typeof getControlledCursorTelemetry> | null> {
  if (!frozen.captureEnabled && mode !== CaptureMode.TAB && mode !== CaptureMode.TAB_CROP) {
    return null;
  }

  if (!frozen.navigationPending) {
    try {
      const segment = await disableControlledCursorCapture(tabId);
      return segment === null
        ? frozen.priorTelemetry
        : mergeTelemetrySnapshots(frozen.priorTelemetry, segment);
    } catch (error) {
      failureLogger.warn('Failed to disable controlled cursor capture during stop', error);
    }
  }

  return frozen.priorTelemetry;
}

export function runStopSideEffects(
  context: StopContext,
  failureLogging: StopFailureLogging = 'detailed',
  options: StopTelemetryOptions = {}
): Promise<void> {
  const failureLogger = resolveStopFailureLogger(failureLogging, logger);
  let backgroundSideEffects: Promise<void>;
  let collected: Promise<void> = Promise.resolve();
  if (context.tabId) {
    runBestEffort(
      getBackgroundRuntimeMessaging().sendTabMessage(context.tabId, {
        type: VideoMessageType.HIDE_COUNTDOWN,
      }),
      failureLogger,
      'Failed to hide recording countdown overlay',
      { tabId: context.tabId }
    );
    runBestEffort(
      getBackgroundRuntimeMessaging().sendTabMessage(context.tabId, {
        type: VideoMessageType.HIDE_RECORDING_OVERLAY,
      }),
      failureLogger,
      'Failed to hide recording region overlay',
      { tabId: context.tabId }
    );
    const telemetry = collectAndPersistTelemetry(context, failureLogger, options);
    collected = telemetry.collected;
    backgroundSideEffects = awaitBestEffort(
      telemetry.persisted,
      failureLogger,
      'Failed to disable recording annotations overlay',
      { tabId: context.tabId }
    );
  } else {
    backgroundSideEffects = Promise.resolve();
  }

  pendingStopSideEffects = backgroundSideEffects;
  return collected;
}

export function waitForStopSideEffects(): Promise<void> {
  return pendingStopSideEffects;
}
