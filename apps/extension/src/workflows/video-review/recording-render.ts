import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import type { VideoProject } from '../../features/video/project/types';
import type { ReviewEdit, ReviewSource } from '../../features/video/review/types';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import {
  resolveQuickEditEffectiveState,
  resolveQuickEditEffectiveFeatures,
} from '../../features/video/review/advanced/effective';
import { resolveReviewCameraConflicts } from '../../features/video/review/advanced/scene';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { projectReviewTelemetry } from '../../features/video/review/telemetry';
import { scheduleReviewClicks } from '../../features/video/review/click-animation';
import { scheduleReviewKeys } from '../../features/video/review/key-animation';
import { createReviewRecordingHistorySource } from './recording-review';
import { QuickEditExportUnavailable } from './export-unavailable';

/** One frame job retains two source windows, including independently prepared transition endpoints. */
export function createReviewRecordingRenderSource(
  args: {
    project: VideoProject;
    telemetry: RecordingTelemetryEntry;
    source: ReviewSource;
    advanced: QuickEditAdvancedState;
    edits: readonly ReviewEdit[];
  },
  dependencies = { createReader: createReviewRecordingHistorySource }
) {
  const advanced = structuredClone(args.advanced);
  const source = structuredClone(args.source);
  const segments = buildReviewTimeMap(source.duration, args.edits);
  const applied = resolveQuickEditEffectiveFeatures(advanced).actionsApplied;
  const settings = [...(advanced.keyAnimations ?? []), ...(advanced.clickAnimations ?? [])];
  const reach =
    Math.max(
      1,
      ...settings.map((style) => Math.max(style.before, style.after) + Math.abs(style.offset))
    ) * Math.max(1, ...segments.map((segment) => segment.rate));
  const reader = dependencies.createReader(args.project, args.telemetry);
  type Prepared = Awaited<ReturnType<typeof reader.read>>;
  const views: { center: number; prepared: Prepared }[] = [];
  let reading = false;
  let disposed = false;
  return {
    async read(
      sourceTime: number,
      resultTime: number,
      output: { width: number; height: number; frameDuration: number },
      signal?: AbortSignal
    ) {
      if (disposed) throw new Error('Recording render history source is disposed.');
      if (!Number.isFinite(output.frameDuration) || output.frameDuration <= 0)
        throw new Error('Recording render frame duration is invalid.');
      if (reading) throw new Error('Recording render history read is already active.');
      reading = true;
      try {
        signal?.throwIfAborted();
        let view = views.find(
          (view) =>
            Math.abs(view.center - sourceTime) <= 0.5 &&
            reader.covers(view.prepared.project, sourceTime)
        );
        if (!view) {
          const prepared = await reader.read(
            sourceTime,
            {
              start: Math.max(0, sourceTime - reach),
              end: Math.min(source.duration, sourceTime + reach),
            },
            signal
          );
          signal?.throwIfAborted();
          if (disposed) throw new Error('Recording render history source is disposed.');
          view = { center: sourceTime, prepared };
          views.unshift(view);
          if (views.length > 2) views.pop();
        }
        const telemetry = view.prepared.telemetry;
        const effective = resolveQuickEditEffectiveState(advanced, { facts: telemetry, source });
        const markers = projectReviewTelemetry(telemetry, source.duration).markers;
        const conflicts = resolveReviewCameraConflicts(
          effective.zoomRegions,
          {
            source,
            background: effective.background,
            canvas: effective.canvas,
            windowHeader: effective.windowHeader,
            output,
          },
          {
            start: resultTime,
            end: Math.min(
              segments.at(-1)?.resultEnd ?? resultTime,
              resultTime + output.frameDuration
            ),
          }
        );
        if (conflicts.length)
          throw new QuickEditExportUnavailable(['camera-follow'], [], conflicts);
        return {
          telemetry,
          effective,
          keyCues: scheduleReviewKeys(
            markers,
            applied ? (advanced.keyAnimations ?? []) : [],
            segments
          ),
          clickCues: scheduleReviewClicks(
            markers,
            applied ? (advanced.clickAnimations ?? []) : [],
            segments
          ),
        };
      } finally {
        reading = false;
      }
    },
    dispose() {
      disposed = true;
      views.length = 0;
      reader.dispose();
    },
  };
}
export type ReviewRecordingRenderSource = ReturnType<typeof createReviewRecordingRenderSource>;
