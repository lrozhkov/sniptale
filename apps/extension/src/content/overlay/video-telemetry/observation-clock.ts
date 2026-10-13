import type { RecordingFrameClockAnchor } from '../../../contracts/video/recording-frame-clock';
import type {
  RecordingObservationClock,
  RecordingTelemetryCapabilities,
} from '../../../features/video/project/types';

/** One document retains its observations while calibration updates only the phase mapping. */
export function createObservationClock(timeOriginMs = performance.timeOrigin) {
  const documentId = crypto.randomUUID();
  const clock: RecordingObservationClock = { version: 1, domain: 'observation', segments: [] };
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
      if (anchor.phase === 'paused') segment.mediaEndSeconds = anchor.mediaTimeSeconds;
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
