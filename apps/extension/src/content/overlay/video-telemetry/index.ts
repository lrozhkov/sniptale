import type { RecordingTelemetrySnapshot } from '../../../contracts/messaging/contracts/response-types';
import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { createVideoTelemetryController } from './controller';

const telemetryControllerOwner = createLazyContentDefaultOwner(createVideoTelemetryController);

export function enableVideoTelemetry(recordingId: string | null, offsetSeconds = 0): void {
  telemetryControllerOwner.getOwner().enable(recordingId, offsetSeconds);
}

export function disableVideoTelemetry(): RecordingTelemetrySnapshot | null {
  return telemetryControllerOwner.getOwnerIfCreated()?.disable() ?? null;
}

export function pauseVideoTelemetry(): void {
  telemetryControllerOwner.getOwnerIfCreated()?.pause();
}

export function resumeVideoTelemetry(): void {
  telemetryControllerOwner.getOwnerIfCreated()?.resume();
}
