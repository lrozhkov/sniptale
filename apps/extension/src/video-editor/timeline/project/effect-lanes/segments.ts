import { buildVideoCompositionMotionSegmentsFromRegions } from '../../../../features/video/composition/timeline/lanes';
import { resolveMotionConnectionCandidate } from '../../../../features/video/project/motion';
import type { VideoProject } from '../../../../features/video/project/types';

export function buildTimelineMotionSegments(project: VideoProject) {
  return buildVideoCompositionMotionSegmentsFromRegions(project.motionRegions ?? []);
}

/** Utility rows exclude the independently presented history row. */
export function getTimelineUtilityRowPresence(project: VideoProject) {
  return {
    motion: (project.motionRegions?.length ?? 0) > 0,
  };
}

/** Disposable rows reserve compatible connection chains without changing authored timing. */
export function getTimelineMotionLayout(project: VideoProject) {
  const regions = (project.motionRegions ?? [])
    .filter((region) => region.duration > 0)
    .toSorted((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
  const chains: Array<{ ids: string[]; start: number; end: number; camera: boolean }> = [];
  const byId = new Map<string, (typeof chains)[number]>();
  for (const region of regions) {
    const source = resolveMotionConnectionCandidate(project, region);
    const previous = source ? byId.get(source.id) : undefined;
    const chain =
      previous && previous.end <= region.startTime
        ? previous
        : {
            ids: [],
            start: region.startTime,
            end: region.startTime,
            camera: !region.border && !region.spotlight,
          };
    if (chain !== previous) chains.push(chain);
    chain.ids.push(region.id);
    chain.end = Math.max(chain.end, region.startTime + region.duration);
    byId.set(region.id, chain);
  }
  const rows = new Map<string, number>();
  const occupied: Array<Array<{ start: number; end: number }>> = [];
  for (const chain of chains.toSorted(
    (a, b) => Number(b.camera) - Number(a.camera) || a.start - b.start
  )) {
    let row = occupied.findIndex((spans) =>
      spans.every((span) => chain.start >= span.end || chain.end <= span.start)
    );
    if (row < 0) {
      row = occupied.length;
      occupied.push([]);
    }
    occupied[row]!.push(chain);
    for (const id of chain.ids) rows.set(id, row);
  }
  return {
    rows,
    rowCount: Math.max(occupied.length, Number(getTimelineUtilityRowPresence(project).motion)),
  };
}
