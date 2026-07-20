import type { RecordingTelemetrySnapshot } from '../../../../contracts/messaging/contracts/response-types';
import type {
  RecordingTelemetrySignal,
  VideoCursorCaptureMode,
  VideoProjectActionEvent,
  VideoProjectCursorSample,
  VideoProjectCursorTrack,
} from '../../../../features/video/project/types';
import type { VideoDisplaySurface } from '@sniptale/runtime-contracts/video/types/types';
import { videoManagerSession } from '../manager/session';

function cloneCursorSamples(
  samples: readonly VideoProjectCursorSample[]
): VideoProjectCursorSample[] {
  return samples.map((sample) => ({ ...sample }));
}

function cloneCursorTrack(track: VideoProjectCursorTrack | null): VideoProjectCursorTrack | null {
  if (track === null) {
    return null;
  }

  return {
    ...track,
    samples: cloneCursorSamples(track.samples),
    skin: { ...track.skin },
  };
}

function cloneActionEvents(events: readonly VideoProjectActionEvent[]): VideoProjectActionEvent[] {
  return events.map((event) => ({
    ...event,
    ...(event.point === null ? {} : { point: { ...event.point } }),
    data: { ...event.data },
  }));
}

function cloneTelemetrySignals(
  signals: readonly RecordingTelemetrySignal[]
): RecordingTelemetrySignal[] {
  return signals.map((signal) => ({
    ...signal,
    point: signal.point === null ? null : { ...signal.point },
    data: { ...signal.data },
  }));
}

function cloneTelemetrySnapshot(snapshot: RecordingTelemetrySnapshot): RecordingTelemetrySnapshot {
  return {
    actionEvents: cloneActionEvents(snapshot.actionEvents),
    cursorTrack: cloneCursorTrack(snapshot.cursorTrack),
    signals: cloneTelemetrySignals(snapshot.signals),
    viewport: snapshot.viewport === null ? null : { ...snapshot.viewport },
  };
}

function mergeCursorTrack(
  current: VideoProjectCursorTrack | null,
  next: VideoProjectCursorTrack | null
): VideoProjectCursorTrack | null {
  if (current === null) {
    return cloneCursorTrack(next);
  }
  if (next === null) {
    return cloneCursorTrack(current);
  }

  return {
    ...current,
    captureMode: next.captureMode,
    samples: [...cloneCursorSamples(current.samples), ...cloneCursorSamples(next.samples)],
    skin: { ...current.skin, ...next.skin },
  };
}

function mergeTelemetrySnapshots(
  current: RecordingTelemetrySnapshot | null,
  next: RecordingTelemetrySnapshot
): RecordingTelemetrySnapshot {
  if (current === null) {
    return cloneTelemetrySnapshot(next);
  }

  return {
    actionEvents: [
      ...cloneActionEvents(current.actionEvents),
      ...cloneActionEvents(next.actionEvents),
    ],
    cursorTrack: mergeCursorTrack(current.cursorTrack, next.cursorTrack),
    signals: [...cloneTelemetrySignals(current.signals), ...cloneTelemetrySignals(next.signals)],
    viewport: next.viewport === null ? current.viewport : { ...next.viewport },
  };
}

export function resetControlledCursorCaptureState(): void {
  videoManagerSession.controlledCursorCaptureEnabled = false;
  videoManagerSession.controlledCursorAutoPaused = false;
  videoManagerSession.controlledCursorNavigationPending = false;
  videoManagerSession.controlledCursorOffsetSeconds = 0;
  videoManagerSession.controlledCursorVerifiedMode = null;
  videoManagerSession.controlledCursorDisplaySurface = null;
  videoManagerSession.controlledCursorTelemetry = null;
}

export function setControlledCursorCaptureEnabled(enabled: boolean): void {
  videoManagerSession.controlledCursorCaptureEnabled = enabled;
}

export function isControlledCursorCaptureEnabled(): boolean {
  return videoManagerSession.controlledCursorCaptureEnabled;
}

export function setControlledCursorAutoPaused(autoPaused: boolean): void {
  videoManagerSession.controlledCursorAutoPaused = autoPaused;
}

export function isControlledCursorAutoPaused(): boolean {
  return videoManagerSession.controlledCursorAutoPaused;
}

export function beginControlledCursorNavigation(): number {
  videoManagerSession.controlledCursorNavigationEpoch += 1;
  videoManagerSession.controlledCursorNavigationPending = true;
  return videoManagerSession.controlledCursorNavigationEpoch;
}

export function getControlledCursorNavigationEpoch(): number {
  return videoManagerSession.controlledCursorNavigationEpoch;
}

export function clearControlledCursorNavigationPending(navigationEpoch: number): boolean {
  if (videoManagerSession.controlledCursorNavigationEpoch !== navigationEpoch) {
    return false;
  }

  videoManagerSession.controlledCursorNavigationPending = false;
  return true;
}

export function setControlledCursorNavigationPending(pending: boolean): void {
  videoManagerSession.controlledCursorNavigationPending = pending;
}

export function isControlledCursorNavigationPending(): boolean {
  return videoManagerSession.controlledCursorNavigationPending;
}

export function setControlledCursorOffsetSeconds(offsetSeconds: number): void {
  videoManagerSession.controlledCursorOffsetSeconds = Math.max(0, offsetSeconds);
}

export function getControlledCursorOffsetSeconds(): number {
  return videoManagerSession.controlledCursorOffsetSeconds;
}

export function setControlledCursorVerifiedMode(mode: VideoCursorCaptureMode | null): void {
  videoManagerSession.controlledCursorVerifiedMode = mode;
}

export function getControlledCursorVerifiedMode(): VideoCursorCaptureMode | null {
  return videoManagerSession.controlledCursorVerifiedMode;
}

export function setControlledCursorDisplaySurface(mode: VideoDisplaySurface | null): void {
  videoManagerSession.controlledCursorDisplaySurface = mode;
}

export function getControlledCursorDisplaySurface(): VideoDisplaySurface | null {
  return videoManagerSession.controlledCursorDisplaySurface;
}

export function appendControlledCursorTelemetry(snapshot: RecordingTelemetrySnapshot | null): void {
  if (snapshot === null) {
    return;
  }

  videoManagerSession.controlledCursorTelemetry = mergeTelemetrySnapshots(
    videoManagerSession.controlledCursorTelemetry,
    snapshot
  );
}

export function getControlledCursorTelemetry(): RecordingTelemetrySnapshot | null {
  const telemetry = videoManagerSession.controlledCursorTelemetry;
  return telemetry === null ? null : cloneTelemetrySnapshot(telemetry);
}
