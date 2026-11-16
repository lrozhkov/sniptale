import { reviewInteractionSourceQueries } from '../../features/video/review/interaction-timeline';
import type { ReviewInteractionTimeline } from '../../features/video/review/interaction-types';
import { projectActionFeedbackMarkers } from '../../features/video/review/project-action-audio';
import { recordingEventProjectSources } from '../../features/video/project/recording-events/project-facts';
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
  recordingSourceActionFacts,
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
      ? recordingSourceActionFacts(event)
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
  options: {
    includeCursor?: boolean;
    interactionTimeline?: ReviewInteractionTimeline | undefined;
  } = {}
) {
  project = structuredClone(project);
  telemetry = structuredClone(telemetry);
  const interactionTimeline = options.interactionTimeline
    ? structuredClone(options.interactionTimeline)
    : undefined;
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
        if (options.includeCursor !== false)
          prepared = await cursor.prepare(prepared, time, range, active);
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
        const relocated = await readReviewInteractionArchiveMarkers(
          project,
          events,
          interactionTimeline,
          range,
          active
        );
        const byRef = new Map(
          [...markers, ...relocated.markers].map((marker) => [JSON.stringify(marker.ref), marker])
        );
        return {
          project: prepared,
          telemetry: attachReviewRecordingWindow(facts, {
            markers: [...byRef.values()],
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

/** Reads only original event windows needed by relocated presentation in this destination window. */
export async function readReviewInteractionArchiveMarkers(
  project: VideoProject,
  reader: Pick<ReturnType<typeof createRecordingEventsRenderer>, 'prepare'>,
  timeline: ReviewInteractionTimeline | undefined,
  range: { start: number; end: number },
  signal: AbortSignal
) {
  const markers: ReturnType<typeof projectActionFeedbackMarkers> = [];
  const sources: ReturnType<typeof recordingEventProjectSources> = [];
  for (const query of reviewInteractionSourceQueries(timeline, range)) {
    signal.throwIfAborted();
    const prepared = await reader.prepare(project, query.range, signal);
    signal.throwIfAborted();
    sources.push(...recordingEventProjectSources(prepared));
    for (const group of prepared.actionFeedback ?? [])
      markers.push(
        ...projectActionFeedbackMarkers(prepared, group, false).filter(
          (marker) => marker.ref.kind === query.ref.kind && marker.ref.id === query.ref.id
        )
      );
  }
  return { markers, sources };
}
