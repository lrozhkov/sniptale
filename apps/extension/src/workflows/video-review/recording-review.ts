import { initDB } from '../../composition/persistence/infrastructure/indexed-db/core';
import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import type { RecordingEventsStoreDependencies } from '../../composition/persistence/recordings/recording-events/contracts';
import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
import type {
  VideoProject,
  RecordingActionEvent,
  RecordingTelemetrySignal,
} from '../../features/video/project/types';
import {
  recordingEventProjectActions,
  recordingEventProjectSignals,
} from '../../features/video/project/recording-events/project-facts';
import {
  preparedCursorTrajectorySourceWindow,
  cursorTrajectoryProjectCoversTime,
} from '../../features/video/project/cursor-trajectory/project-window';
import { recordingEventsProjectCoversTime } from '../../features/video/project/recording-events/project-facts';
import {
  attachReviewRecordingWindow,
  projectReviewTelemetry,
} from '../../features/video/review/telemetry';
import { applyRecordingEventMarkerFacts } from '../../features/video/review/project-action-audio';
import type { ReviewSource } from '../../features/video/review/types';
import { createRecordingEventsRenderer } from './recording-events';
import { createRecordingCursorTrajectoryRenderer } from './cursor-trajectory';

/** Builds a disposable source-time project. The recording retains all canonical archive facts. */
export function createReviewRecordingHistoryProject(
  telemetry: RecordingTelemetryEntry,
  source: ReviewSource,
  filename: string
): VideoProject | null {
  if (!telemetry.cursorTrajectory && !telemetry.recordingEvents) return null;
  return createVideoProjectFromRecording({
    ...source,
    filename,
    recordingId: telemetry.recordingId,
    recordingSignals: telemetry.recordingEvents ? [] : telemetry.signals,
    sourceNormalizedActionEvents: telemetry.recordingEvents
      ? []
      : telemetry.actionEvents.map((event) => ({
          id: event.id,
          kind: event.kind,
          time: event.time,
          duration: event.duration,
          point: event.recordingPoint ? { ...event.recordingPoint } : null,
          label: event.label,
          data: event.data,
          preset: event.preset,
          ...(event.keyboardRepeats ? { keyboardRepeats: event.keyboardRepeats } : {}),
        })),
    ...(telemetry.cursorTrajectory
      ? {
          cursorTrajectory: telemetry.cursorTrajectory,
          ...(telemetry.cursorTrack
            ? { cursorTrack: { ...telemetry.cursorTrack, samples: [] } }
            : {}),
        }
      : {}),
    ...(telemetry.recordingEvents ? { recordingEvents: telemetry.recordingEvents } : {}),
  });
}
function capturedActions(project: VideoProject, recordingId: string): RecordingActionEvent[] {
  return recordingEventProjectActions(project).flatMap((event) =>
    event.anchor.kind === 'recording-source' && event.anchor.recordingId === recordingId
      ? [
          {
            id: event.anchor.sourceEventId,
            kind: event.kind,
            time: event.anchor.sourceTime,
            duration: event.capturedDuration ?? 0,
            point: event.point,
            recordingPoint: event.point,
            label: event.label,
            data: event.data,
            preset: 'NONE',
            ...(event.keyboardRepeats ? { keyboardRepeats: event.keyboardRepeats } : {}),
          },
        ]
      : []
  );
}
/** One preview/export session owns this reader and coalesces its requests. */
export function createReviewRecordingHistorySource(
  project: VideoProject,
  telemetry: RecordingTelemetryEntry,
  dependencies: RecordingEventsStoreDependencies = {
    database: initDB,
    mintGeneration: () => crypto.randomUUID(),
  },
  options: { includeCursor?: boolean } = {}
) {
  project = structuredClone(project);
  telemetry = structuredClone(telemetry);
  const events = createRecordingEventsRenderer(dependencies);
  const cursor = createRecordingCursorTrajectoryRenderer(dependencies);
  const lifetime = new AbortController();
  let reading = false;
  return {
    async read(
      time: number,
      range = { start: Math.max(0, time - 1), end: Math.min(project.duration, time + 1) },
      signal?: AbortSignal
    ) {
      if (reading) throw new Error('Review recording history read is already active.');
      if (
        !Number.isFinite(time) ||
        time < 0 ||
        time > project.duration ||
        !Number.isFinite(range.start) ||
        !Number.isFinite(range.end) ||
        range.start < 0 ||
        range.end < range.start
      )
        throw new Error('Review recording history range is invalid.');
      const active = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
      active.throwIfAborted();
      reading = true;
      try {
        let prepared = await events.prepare(project, range, active);
        active.throwIfAborted();
        if (options.includeCursor !== false) prepared = await cursor.prepare(prepared, time);
        active.throwIfAborted();
        const group = prepared.actionFeedback?.find(
          (group) => group.recordingId === telemetry.recordingId
        );
        const trajectory = prepared.cursorTrack?.sourceObservations?.find(
          (group) => group.recordingId === telemetry.recordingId
        )?.trajectory;
        const source =
          options.includeCursor !== false && trajectory && trajectory.totalBlocks > 0
            ? preparedCursorTrajectorySourceWindow(
                prepared,
                telemetry.recordingId,
                trajectory.trajectoryId
              )
            : undefined;
        if (options.includeCursor !== false && trajectory && trajectory.totalBlocks > 0 && !source)
          throw new Error('Review cursor history source is unavailable.');
        const signals: RecordingTelemetrySignal[] = group?.events
          ? [...recordingEventProjectSignals(prepared, group)]
          : telemetry.signals;
        const byId = new Map(signals.map((signal) => [signal.id, signal]));
        if (group?.events)
          for (const warning of telemetry.signals.filter(
            (signal) => signal.kind === 'static-frame'
          ))
            if (!byId.has(warning.id)) byId.set(warning.id, warning);
        const cursorTemplate = telemetry.cursorTrack ?? prepared.cursorTrack;
        const facts: RecordingTelemetryEntry = {
          ...telemetry,
          actionEvents: group?.events
            ? capturedActions(prepared, telemetry.recordingId)
            : telemetry.actionEvents,
          signals: [...byId.values()],
          ...(trajectory
            ? {
                cursorTrack: cursorTemplate
                  ? {
                      captureMode: cursorTemplate.captureMode,
                      skin: cursorTemplate.skin,
                      samples: [...(source?.samples ?? [])],
                    }
                  : null,
              }
            : {}),
        };
        if (options.includeCursor === false) facts.cursorTrack = null;
        const markers = projectReviewTelemetry(facts, project.duration).markers;
        if (group?.events) applyRecordingEventMarkerFacts(prepared, group, markers);
        return {
          project: prepared,
          telemetry: attachReviewRecordingWindow(facts, {
            markers,
            ...(source ? { cursorEndSeconds: source.knownEndSeconds } : {}),
          }),
        };
      } finally {
        reading = false;
      }
    },
    covers(prepared: VideoProject, time: number) {
      return (
        recordingEventsProjectCoversTime(prepared, time) &&
        (options.includeCursor === false || cursorTrajectoryProjectCoversTime(prepared, time))
      );
    },
    dispose() {
      lifetime.abort();
      events.clear();
      cursor.clear();
    },
  };
}
