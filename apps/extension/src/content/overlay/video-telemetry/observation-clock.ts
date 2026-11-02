import type { CursorSourceMoment } from './cursor-source';
import type { RecordingFrameClockAnchor } from '../../../contracts/video/recording-frame-clock';
import type {
  RecordingObservationClock,
  RecordingTelemetryCapabilities,
} from '../../../features/video/project/types';

/** One document retains its observations while calibration updates only the phase mapping. */
export function createObservationClock(timeOriginMs = performance.timeOrigin) {
  const documentId = crypto.randomUUID();
  const clock: RecordingObservationClock = { version: 1, domain: 'observation', segments: [] };
  const revisions = new Map<string, number>();
  return {
    get id(): string {
      return clock.segments.at(-1)?.id ?? documentId;
    },
    start(timestamp: number, observationStartSeconds: number, mediaStartEstimateSeconds: number) {
      clock.segments.push({
        id: crypto.randomUUID(),
        documentId,
        timeOriginMs,
        startedAtTimestampMs: timestamp,
        observationStartSeconds,
        mediaStartEstimateSeconds,
        mapping: null,
      });
    },
    update(anchor: RecordingFrameClockAnchor) {
      const segment = clock.segments.at(-1);
      if (!segment) return;
      segment.mapping = {
        captureEpochMs: anchor.captureEpochMs,
        mediaTimeSeconds: anchor.mediaTimeSeconds,
        uncertaintyMs: anchor.uncertaintyMs ?? 0,
        ...(anchor.maximumUncertaintyMs === undefined
          ? {}
          : { maximumUncertaintyMs: anchor.maximumUncertaintyMs }),
      };
      revisions.set(segment.id, anchor.revision);
      if (anchor.phase === 'paused') segment.mediaEndSeconds = anchor.mediaTimeSeconds;
    },
    /** Queued input keeps its original phase when calibration or Resume arrives later. */
    projectAt(segmentId: string, observationTime: number) {
      const segment = clock.segments.find((candidate) => candidate.id === segmentId);
      if (!segment) throw new Error('Unknown observation clock phase');
      const start = segment.mapping
        ? segment.mapping.mediaTimeSeconds +
          (timeOriginMs + segment.startedAtTimestampMs - segment.mapping.captureEpochMs) / 1000
        : segment.mediaStartEstimateSeconds;
      const seconds = Math.max(0, start + observationTime - segment.observationStartSeconds);
      return {
        activeTimeUs: Math.round(Math.min(seconds, segment.mediaEndSeconds ?? seconds) * 1_000_000),
        clockRevision: revisions.get(segment.id) ?? 0,
        clock: {
          source: 'dom-event-time' as const,
          timestampQuantumUs: null,
          resolutionBoundUs: null,
          mappingUncertaintyUs: segment.mapping
            ? Math.ceil(segment.mapping.uncertaintyMs * 1000)
            : null,
        },
      };
    },
    estimateAt(observationTime: number): number {
      const segment = clock.segments.at(-1);
      if (!segment) return 0;
      const start = segment.mapping
        ? segment.mapping.mediaTimeSeconds +
          (timeOriginMs + segment.startedAtTimestampMs - segment.mapping.captureEpochMs) / 1000
        : segment.mediaStartEstimateSeconds;
      return Math.max(0, start + observationTime - segment.observationStartSeconds);
    },
    end(mediaEndSeconds: number | undefined) {
      const segment = clock.segments.at(-1);
      if (segment && mediaEndSeconds !== undefined) segment.mediaEndSeconds = mediaEndSeconds;
    },
    snapshot(): RecordingObservationClock {
      return structuredClone(clock);
    },
    timing(): NonNullable<RecordingTelemetryCapabilities['timing']> {
      const maps = clock.segments.map((segment) => segment.mapping);
      if (!maps.length || maps.some((mapping) => !mapping))
        return { mode: 'approximate', accuracyMs: null };
      const accuracyMs = Math.max(...maps.map((mapping) => mapping?.uncertaintyMs ?? 0));
      const bounded = maps.every(
        (mapping) =>
          mapping && mapping.uncertaintyMs <= (mapping.maximumUncertaintyMs ?? 1000 / 120)
      );
      return { mode: bounded ? 'bounded' : 'approximate', accuracyMs };
    },
  };
}

interface TelemetryClockState {
  isPaused: boolean;
  segmentStartedAtTimestamp: number;
  accumulatedDurationMs: number;
  observationClock: { id: string };
}

/** Source time omits paused intervals and retains the observed viewport geometry. */
export function getTelemetryElapsedSeconds(
  state: TelemetryClockState,
  timestampMs: number
): number {
  const runningDurationMs = state.isPaused ? 0 : timestampMs - state.segmentStartedAtTimestamp;
  return Math.max(0, (state.accumulatedDurationMs + runningDurationMs) / 1000);
}

/** Events and derived signals use the same DOM source moment. */
export function createTelemetrySourceMoment(
  state: TelemetryClockState,
  timestampMs: number,
  sourceClockId = state.observationClock.id,
  observationTimeSeconds = getTelemetryElapsedSeconds(state, timestampMs)
): CursorSourceMoment {
  return {
    sourceClockId,
    observationTimeSeconds,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      visualViewportScale: window.visualViewport?.scale ?? 1,
      visualViewportOffsetX: window.visualViewport?.offsetLeft ?? 0,
      visualViewportOffsetY: window.visualViewport?.offsetTop ?? 0,
    },
  };
}
