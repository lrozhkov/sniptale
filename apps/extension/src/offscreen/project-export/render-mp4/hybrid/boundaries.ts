import { resolveProjectExportRange } from '../../../../features/video/project/export/range';
import { type VideoProjectExportSettings } from '../../../../features/video/project/types/export';
import { type VideoProject } from '../../../../features/video/project/types/model';

function insertSortedBoundary(boundaries: number[], boundary: number): void {
  let index = 0;
  while (index < boundaries.length && boundaries[index]! < boundary) {
    index += 1;
  }
  boundaries.splice(index, 0, boundary);
}

export function collectTimelineBoundaries(
  project: VideoProject,
  settings: VideoProjectExportSettings
): number[] {
  const range = resolveProjectExportRange(project, settings);
  const boundaries = new Set<number>([range.start, range.end]);

  for (const clip of project.clips) {
    const clipStart = Math.max(range.start, clip.startTime);
    const clipEnd = Math.min(range.end, clip.startTime + clip.duration);
    if (clipStart > range.start && clipStart < range.end) {
      boundaries.add(clipStart);
    }
    if (clipEnd > range.start && clipEnd < range.end) {
      boundaries.add(clipEnd);
    }
  }

  for (const transition of project.transitions ?? []) {
    const leading = project.clips.find((clip) => clip.id === transition.leadingClipId);
    const trailing = project.clips.find((clip) => clip.id === transition.trailingClipId);
    if (!leading || !trailing) {
      continue;
    }

    const start = Math.max(leading.startTime, trailing.startTime - transition.duration);
    const end = Math.min(
      leading.startTime + leading.duration,
      trailing.startTime + transition.duration
    );
    if (start > range.start && start < range.end) {
      boundaries.add(start);
    }
    if (end > range.start && end < range.end) {
      boundaries.add(end);
    }
  }

  const sortedBoundaries: number[] = [];
  for (const boundary of boundaries) {
    insertSortedBoundary(sortedBoundaries, boundary);
  }
  return sortedBoundaries;
}
