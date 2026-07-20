import type { VideoProjectClip, VideoProjectLogicalLane } from '../types/index';

export interface VideoProjectClipLogicalLaneAssignment {
  logicalLaneId: string;
  rowCount: number;
  rowIndex: number;
}

type VideoProjectTrackLogicalLaneSource = {
  clips: readonly Pick<VideoProjectClip, 'timelineLaneId' | 'trackId'>[];
  tracks: readonly { id: string; logicalLanes?: readonly VideoProjectLogicalLane[] }[];
};

const LOGICAL_LANE_PREFIX = 'line-';
export const DEFAULT_LOGICAL_LANE_ID = createVideoProjectClipLogicalLaneId(0);

export function createVideoProjectClipLogicalLaneId(rowIndex: number): string {
  return `${LOGICAL_LANE_PREFIX}${Math.max(1, Math.floor(rowIndex) + 1)}`;
}

export function createVideoProjectLogicalLane(rowIndex: number): VideoProjectLogicalLane {
  return { id: createVideoProjectClipLogicalLaneId(rowIndex) };
}

export function normalizeVideoProjectClipLogicalLaneId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function assignVideoProjectClipsToLogicalLanes(
  clips: readonly VideoProjectClip[],
  logicalLaneIds: readonly string[] = []
): Map<string, VideoProjectClipLogicalLaneAssignment> {
  const laneIds = createSortedLogicalLaneIds([
    DEFAULT_LOGICAL_LANE_ID,
    ...logicalLaneIds,
    ...clips.map(resolveClipLogicalLaneId),
  ]);
  const rowIndexes = createLogicalLaneRowIndexes(laneIds);
  const rowCount = Math.max(1, ...[...rowIndexes.values()].map((rowIndex) => rowIndex + 1));

  return new Map(
    clips.map((clip) => {
      const logicalLaneId = resolveClipLogicalLaneId(clip);
      return [
        clip.id,
        {
          logicalLaneId,
          rowCount,
          rowIndex: rowIndexes.get(logicalLaneId)!,
        },
      ];
    })
  );
}

export function resolveClipLogicalLaneId(clip: Pick<VideoProjectClip, 'timelineLaneId'>): string {
  return normalizeVideoProjectClipLogicalLaneId(clip.timelineLaneId) ?? DEFAULT_LOGICAL_LANE_ID;
}

export function normalizeVideoProjectLogicalLanes(
  lanes: readonly VideoProjectLogicalLane[] | undefined
): VideoProjectLogicalLane[] {
  return createSortedLogicalLaneIds(
    (lanes ?? []).flatMap((lane) => {
      const id = normalizeVideoProjectClipLogicalLaneId(lane.id);
      return id ? [id] : [];
    })
  ).map((id) => ({ id }));
}

export function getVideoProjectTrackLogicalLaneIds(
  project: VideoProjectTrackLogicalLaneSource,
  trackId: string
): string[] {
  const track = project.tracks.find((item) => item.id === trackId);
  const persistedLaneIds = normalizeVideoProjectLogicalLanes(track?.logicalLanes).map(
    (lane) => lane.id
  );
  const clipLaneIds = project.clips
    .filter((clip) => clip.trackId === trackId)
    .map(resolveClipLogicalLaneId);
  return createSortedLogicalLaneIds([DEFAULT_LOGICAL_LANE_ID, ...persistedLaneIds, ...clipLaneIds]);
}

export function getVideoProjectTrackLogicalLaneIdsThrough(
  project: VideoProjectTrackLogicalLaneSource,
  trackId: string,
  targetLaneId: string | null | undefined
): string[] {
  const laneIds = getVideoProjectTrackLogicalLaneIds(project, trackId);
  const targetIndex = targetLaneId ? parseLogicalLaneIndex(targetLaneId) : null;
  if (targetIndex === null) {
    return targetLaneId ? createSortedLogicalLaneIds([...laneIds, targetLaneId]) : laneIds;
  }

  return createSortedLogicalLaneIds([
    ...laneIds,
    ...Array.from({ length: targetIndex }, (_item, index) =>
      createVideoProjectClipLogicalLaneId(index)
    ),
  ]);
}

export function getNextVideoProjectTrackLogicalLaneId(
  project: VideoProjectTrackLogicalLaneSource,
  trackId: string
): string {
  return createVideoProjectClipLogicalLaneId(
    Math.max(1, getVideoProjectTrackLogicalLaneIds(project, trackId).length)
  );
}

export function createNextVideoProjectTrackLogicalLane(
  project: VideoProjectTrackLogicalLaneSource,
  trackId: string
): VideoProjectLogicalLane {
  return { id: getNextVideoProjectTrackLogicalLaneId(project, trackId) };
}

function createSortedLogicalLaneIds(laneIds: readonly string[]): string[] {
  return [
    ...new Set(laneIds.flatMap((id) => normalizeVideoProjectClipLogicalLaneId(id) ?? [])),
  ].sort(compareLogicalLaneIds);
}

function compareLogicalLaneIds(left: string, right: string): number {
  const leftIndex = parseLogicalLaneIndex(left);
  const rightIndex = parseLogicalLaneIndex(right);
  if (leftIndex !== null && rightIndex !== null) {
    return leftIndex - rightIndex;
  }
  if (leftIndex !== null) {
    return -1;
  }
  if (rightIndex !== null) {
    return 1;
  }
  return left.localeCompare(right);
}

function parseLogicalLaneIndex(laneId: string): number | null {
  if (!laneId.startsWith(LOGICAL_LANE_PREFIX)) {
    return null;
  }
  const index = Number(laneId.slice(LOGICAL_LANE_PREFIX.length));
  return Number.isInteger(index) && index > 0 ? index : null;
}

function resolveLogicalLaneRowIndex(laneId: string, fallbackIndex: number): number {
  const parsedIndex = parseLogicalLaneIndex(laneId);
  return parsedIndex === null ? fallbackIndex : parsedIndex - 1;
}

function createLogicalLaneRowIndexes(laneIds: readonly string[]): Map<string, number> {
  const rowIndexes = new Map<string, number>();
  const usedRowIndexes = new Set<number>();

  for (const laneId of laneIds) {
    const parsedIndex = parseLogicalLaneIndex(laneId);
    if (parsedIndex !== null) {
      rowIndexes.set(laneId, parsedIndex - 1);
      usedRowIndexes.add(parsedIndex - 1);
    }
  }

  for (const laneId of laneIds) {
    if (rowIndexes.has(laneId)) {
      continue;
    }
    const rowIndex = getNextAvailableLogicalRowIndex(usedRowIndexes);
    rowIndexes.set(laneId, resolveLogicalLaneRowIndex(laneId, rowIndex));
    usedRowIndexes.add(rowIndex);
  }

  return rowIndexes;
}

function getNextAvailableLogicalRowIndex(usedRowIndexes: ReadonlySet<number>): number {
  let rowIndex = 0;
  while (usedRowIndexes.has(rowIndex)) {
    rowIndex += 1;
  }
  return rowIndex;
}
