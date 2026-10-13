import type { RecordingTelemetrySnapshot } from '../../../../contracts/messaging/contracts/response-types';
import type {
  RecordingTelemetrySignal,
  VideoCursorCaptureMode,
  RecordingActionEvent,
  VideoProjectCursorSample,
  VideoProjectCursorTrack,
} from '../../../../features/video/project/types';
import type { VideoDisplaySurface } from '@sniptale/runtime-contracts/video/types/types';
import { videoManagerSession } from '../manager/session';
import {
  matchesRecordingFrameClockBinding,
  type RecordingFrameClockAnchor,
} from '../../../../contracts/video/recording-frame-clock';

export function setRecordingFrameClock(anchor: RecordingFrameClockAnchor): boolean {
  const current = videoManagerSession.recordingFrameClock;
  if (
    current &&
    (!matchesRecordingFrameClockBinding(current, anchor) || anchor.revision <= current.revision)
  )
    return false;
  videoManagerSession.recordingFrameClock = { ...anchor };
  return true;
}

export function getRecordingFrameClock(): RecordingFrameClockAnchor | null {
  const current = videoManagerSession.recordingFrameClock;
  return current ? { ...current } : null;
}

function cloneCursorSamples(
  samples: readonly VideoProjectCursorSample[]
): VideoProjectCursorSample[] {
  return samples.map((sample) => ({
    ...sample,
    ...(sample.recordingPoint ? { recordingPoint: { ...sample.recordingPoint } } : {}),
  }));
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

function cloneActionEvents(events: readonly RecordingActionEvent[]): RecordingActionEvent[] {
  return events.map((event) => ({
    ...event,
    ...(event.point === null ? {} : { point: { ...event.point } }),
    ...(event.recordingPoint ? { recordingPoint: { ...event.recordingPoint } } : {}),
    data: { ...event.data },
    ...(event.keyboardRepeats ? { keyboardRepeats: structuredClone(event.keyboardRepeats) } : {}),
  }));
}

function cloneTelemetrySignals(
  signals: readonly RecordingTelemetrySignal[]
): RecordingTelemetrySignal[] {
  return signals.map((signal) => ({
    ...signal,
    point: signal.point === null ? null : { ...signal.point },
    data: { ...signal.data },
    ...(signal.recordingPoint ? { recordingPoint: { ...signal.recordingPoint } } : {}),
    ...(signal.keyboardRhythm ? { keyboardRhythm: structuredClone(signal.keyboardRhythm) } : {}),
    ...(signal.keyboardRepeats ? { keyboardRepeats: structuredClone(signal.keyboardRepeats) } : {}),
  }));
}

function cloneTelemetrySnapshot(snapshot: RecordingTelemetrySnapshot): RecordingTelemetrySnapshot {
  return {
    ...(snapshot.provenance ? { provenance: { ...snapshot.provenance } } : {}),
    ...(snapshot.capabilities ? { capabilities: { ...snapshot.capabilities } } : {}),
    viewportObservation: snapshot.viewportObservation
      ? { ...snapshot.viewportObservation, initial: { ...snapshot.viewportObservation.initial } }
      : null,
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

export function mergeTelemetrySnapshots(
  current: RecordingTelemetrySnapshot | null,
  next: RecordingTelemetrySnapshot
): RecordingTelemetrySnapshot {
  if (current === null) {
    return cloneTelemetrySnapshot(next);
  }

  const sameProvenance =
    current.provenance &&
    next.provenance &&
    current.provenance.source === next.provenance.source &&
    current.provenance.coordinateSpace === next.provenance.coordinateSpace;
  const capability = (key: 'pointer' | 'keyboard' | 'wheel') =>
    current.capabilities?.[key] === next.capabilities?.[key]
      ? (current.capabilities?.[key] ?? 'unknown')
      : 'unknown';
  return {
    ...(sameProvenance && current.provenance ? { provenance: { ...current.provenance } } : {}),
    ...(current.capabilities || next.capabilities
      ? {
          capabilities: {
            version: 1,
            pointer: capability('pointer'),
            keyboard: capability('keyboard'),
            wheel: capability('wheel'),
            coverage:
              current.capabilities?.coverage === next.capabilities?.coverage
                ? (current.capabilities?.coverage ?? 'unknown')
                : 'unknown',
          },
        }
      : {}),
    viewportObservation: current.viewportObservation
      ? {
          initial: { ...current.viewportObservation.initial },
          stable:
            current.viewportObservation.stable &&
            !!next.viewportObservation?.stable &&
            Object.entries(current.viewportObservation.initial).every(([key, value]) =>
              Object.entries(next.viewportObservation?.initial ?? {}).some(
                ([nextKey, nextValue]) => key === nextKey && value === nextValue
              )
            ),
        }
      : null,
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
  videoManagerSession.recordingFrameClock = null;
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
