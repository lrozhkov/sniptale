import type { RecordingTelemetrySnapshot } from '../../../contracts/messaging/contracts/response-types';
import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { createVideoTelemetryController } from './controller';
import type { RecordingFrameClockAnchor } from '../../../contracts/video/recording-frame-clock';

const telemetryControllerOwner = createLazyContentDefaultOwner(createVideoTelemetryController);

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

export function resumeVideoTelemetry(frameClock?: RecordingFrameClockAnchor | null): void {
  telemetryControllerOwner.getOwnerIfCreated()?.resume(frameClock);
}
