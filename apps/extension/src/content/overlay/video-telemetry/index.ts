import { getContentRuntimeServices } from '../../platform/runtime-services/services';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { RecordingTelemetrySnapshot } from '../../../contracts/messaging/contracts/response-types';
import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { createVideoTelemetryController } from './controller';
import type { RecordingFrameClockAnchor } from '../../../contracts/video/recording-frame-clock';

const telemetryControllerOwner = createLazyContentDefaultOwner(() =>
  createVideoTelemetryController({
    publishEvents: async (eventPacket) => {
      const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
        type: VideoMessageType.RECORDING_OBSERVATIONS,
        recordingId: eventPacket.recordingId,
        eventPacket,
      });
      if (response?.success !== true) throw new Error('Event observation packet was refused');
    },
    publishCursor: async (cursorPacket) => {
      const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
        type: VideoMessageType.RECORDING_OBSERVATIONS,
        recordingId: cursorPacket.recordingId,
        cursorPacket,
      });
      if (response?.success !== true) throw new Error('Cursor observation packet was refused');
    },
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
  frameClock?: RecordingFrameClockAnchor | null,
  cursorTrajectoryMode?: 'blocks',
  recordingEventsMode?: 'blocks'
): void {
  telemetryControllerOwner
    .getOwner()
    .enable(recordingId, offsetSeconds, frameClock, cursorTrajectoryMode, recordingEventsMode);
}

export function disableVideoTelemetry(
  reason?: 'stop' | 'observation'
): RecordingTelemetrySnapshot | null {
  return telemetryControllerOwner.getOwnerIfCreated()?.disable(reason) ?? null;
}

export function flushVideoTelemetryCursor(): Promise<boolean> {
  return telemetryControllerOwner.getOwnerIfCreated()?.flushCursor() ?? Promise.resolve(true);
}

export function flushVideoTelemetryEvents(): Promise<boolean> {
  return telemetryControllerOwner.getOwnerIfCreated()?.flushEvents() ?? Promise.resolve(true);
}

export function waitForVideoEventsCalibration(work: Promise<unknown>): void {
  telemetryControllerOwner.getOwnerIfCreated()?.waitForEventsCalibration(work);
}

export function waitForVideoCursorCalibration(work: Promise<unknown>): void {
  telemetryControllerOwner.getOwnerIfCreated()?.waitForCursorCalibration(work);
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
