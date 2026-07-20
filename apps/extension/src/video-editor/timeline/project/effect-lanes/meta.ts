import type { VideoCompositionCursorSegment } from '../../../../features/video/composition/types';
import type { VideoProject } from '../../../../features/video/project/types';

interface CursorInteractionMeta {
  end: number;
  nextBoundary: number;
  nextSampleId: string | null;
  previousBoundary: number;
  sampleId: string;
  start: number;
}

export function buildCursorSegmentMeta(
  project: VideoProject,
  segments: VideoCompositionCursorSegment[]
) {
  const samples = project.cursorTrack?.samples ?? [];
  const sampleIndexById = new Map(samples.map((sample, index) => [sample.id, index]));

  return new Map(
    segments.map((segment) => [
      segment.id,
      {
        interactionTargets: segment.sampleIds.flatMap<CursorInteractionMeta>((sampleId) => {
          const sampleIndex = sampleIndexById.get(sampleId);
          if (sampleIndex === undefined) {
            return [];
          }
          const sample = samples[sampleIndex];
          if (!sample) {
            return [];
          }

          return [
            {
              end: samples[sampleIndex + 1]?.time ?? project.duration,
              nextBoundary: samples[sampleIndex + 2]?.time ?? project.duration,
              nextSampleId: samples[sampleIndex + 1]?.id ?? null,
              previousBoundary: samples[sampleIndex - 1]?.time ?? 0,
              sampleId,
              start: sample.time,
            },
          ];
        }),
      },
    ])
  );
}
