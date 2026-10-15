import { getContentRuntimeServices } from '../../platform/runtime-services/services';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { RecordingTelemetrySnapshot } from '../../../contracts/messaging/contracts/response-types';
import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { createVideoTelemetryController } from './controller';
import type { RecordingFrameClockAnchor } from '../../../contracts/video/recording-frame-clock';

const telemetryControllerOwner = createLazyContentDefaultOwner(() =>
  createVideoTelemetryController({
    publish: (recordingId, telemetry) => {
      void getContentRuntimeServices()
        .messaging.sendRuntimeMessage({
          type: VideoMessageType.RECORDING_OBSERVATIONS,
          recordingId,
          telemetry,
        })
        .catch(() => undefined);
    },
  })
);

export function enableVideoTelemetry(
  recordingId: string | null,
  offsetSeconds = 0,
  frameClock?: RecordingFrameClockAnchor | null
): void {
  telemetryControllerOwner.getOwner().enable(recordingId, offsetSeconds, frameClock);
}

export function disableVideoTelemetry(): RecordingTelemetrySnapshot | null {
  return telemetryControllerOwner.getOwnerIfCreated()?.disable() ?? null;
}

export function pauseVideoTelemetry(frameClock?: RecordingFrameClockAnchor | null): void {
  telemetryControllerOwner.getOwnerIfCreated()?.pause(frameClock);
}

export function resumeVideoTelemetry(
  frameClock?: RecordingFrameClockAnchor | null,
  sourcePhase?: RecordingFrameClockAnchor
): void {
  telemetryControllerOwner.getOwnerIfCreated()?.resume(frameClock, sourcePhase);
}

/** Applies a late source binding without restarting observation. */
export function updateVideoTelemetryClock(
  recordingId: string,
  frameClock: RecordingFrameClockAnchor
): void {
  telemetryControllerOwner.getOwnerIfCreated()?.updateClock(recordingId, frameClock);
}
