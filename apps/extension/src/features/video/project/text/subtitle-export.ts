import { exportReviewSubtitles } from '../../review/subtitle-export';
import type { ReviewTextFragment } from '../../review/text-types';
import { isSubtitleClip } from '../timeline/presentation';
import type { VideoProject } from '../types/model';
import { projectVideoProjectTextFragment } from './projection';

/** Sidecars use montage time; a selected video range clips and rebases that clock. */
export function exportVideoProjectSubtitles(
  project: VideoProject,
  options: {
    format: 'srt' | 'vtt';
    language?: string | null;
    onlyShown?: boolean;
    normalizeOverlaps?: boolean;
    range?: { start: number; end: number };
  }
) {
  const entries = new Map(
    (project.textDocuments ?? []).flatMap((entry) =>
      entry.document.fragments.map(
        (fragment) =>
          [
            JSON.stringify(['document', entry.id, fragment.id]),
            { entry, fragmentId: fragment.id },
          ] as const
      )
    )
  );
  const visibleTracks = new Set(
    project.tracks
      .filter((track) => track.kind === 'SUBTITLE' && track.visible)
      .map((track) => track.id)
  );
  const legacyFragments: ReviewTextFragment[] = project.clips
    .filter(isSubtitleClip)
    .filter((clip) => visibleTracks.has(clip.trackId))
    .map((clip) => ({
      id: JSON.stringify(['clip', clip.id]),
      text: clip.text.trim(),
      originalText: '',
      start: clip.startTime,
      end: clip.startTime + clip.duration,
      timeDomain: 'result',
      alignment: 'manual',
      revision: 0,
      timingRevision: 0,
      showInVideo: true,
    }));
  const fragments = [
    ...legacyFragments,
    ...(project.textDocuments ?? []).flatMap((entry) =>
      entry.document.fragments.map((fragment) => ({
        ...fragment,
        id: JSON.stringify(['document', entry.id, fragment.id]),
      }))
    ),
  ];
  const range = options.range ?? { start: 0, end: project.duration };
  if (
    !Number.isFinite(range.start) ||
    !Number.isFinite(range.end) ||
    range.start < 0 ||
    range.end < range.start
  )
    return { ok: false, reason: 'timing' } as const;
  return exportReviewSubtitles({
    fragments,
    ids: fragments.map((fragment) => fragment.id),
    segments: [],
    format: options.format,
    language: options.language ?? null,
    onlyShown: options.onlyShown ?? false,
    normalizeOverlaps: options.normalizeOverlaps ?? false,
    mainOffset: 0,
    omitSubMillisecondRanges: true,
    project: (fragment) => {
      const binding = entries.get(fragment.id);
      const projected = binding
        ? projectVideoProjectTextFragment(project, binding.entry, {
            ...fragment,
            id: binding.fragmentId,
          })
        : {
            excludedFromResult: false,
            partiallyExcluded: false,
            ranges: [{ start: fragment.start, end: fragment.end }],
          };
      const ranges = projected.ranges.flatMap((span) => {
        const start = Math.max(span.start, range.start);
        const end = Math.min(span.end, range.end);
        return end > start ? [{ start: start - range.start, end: end - range.start }] : [];
      });
      return {
        ranges,
        excludedFromResult: ranges.length === 0,
        partiallyExcluded:
          projected.partiallyExcluded ||
          projected.ranges.some((span) => span.start < range.start || span.end > range.end),
      };
    },
  });
}
