import {
  isBoundedNumber,
  isRecord,
  MAX_VIDEO_PROJECT_DURATION_SECONDS,
} from '../validation/primitives';

/** Source seconds in the camera's owning editor. IDs are local to that camera. */
export interface CameraHiddenRange {
  id: string;
  start: number;
  end: number;
}

export const MAX_CAMERA_HIDDEN_RANGES = 512;

/** Admit one bounded source interval without changing authored time. */
export function isCameraHiddenRange(value: unknown): value is CameraHiddenRange {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'].length > 0 &&
    value['id'].length <= 256 &&
    value['id'].trim() === value['id'] &&
    isBoundedNumber(value['start'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isBoundedNumber(value['end'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    value['start'] < value['end']
  );
}

/** Copy valid source intervals. Adjacent intervals remain separate authored entities. */
export function parseCameraHiddenRanges(value: unknown): CameraHiddenRange[] | null {
  if (!Array.isArray(value) || value.length > MAX_CAMERA_HIDDEN_RANGES) return null;
  const ids = new Set<string>();
  const result: CameraHiddenRange[] = [];
  for (const raw of value) {
    if (!isCameraHiddenRange(raw) || ids.has(raw.id) || (result.at(-1)?.end ?? 0) > raw.start)
      return null;
    ids.add(raw.id);
    result.push({ id: raw.id, start: raw.start, end: raw.end });
  }
  return result;
}

/** Visibility includes the start and excludes the end of each source interval. */
export function isCameraHiddenAt(
  ranges: readonly CameraHiddenRange[],
  sourceTime: number
): boolean {
  return ranges.some((range) => sourceTime >= range.start && sourceTime < range.end);
}
