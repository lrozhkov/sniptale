import type { VideoProject, VideoProjectExportSettings } from '../types/index';

const MIN_EXPORT_DURATION_SECONDS = 0.1;

function clampRangeValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface VideoProjectExportRange {
  duration: number;
  end: number;
  start: number;
}

export function resolveProjectExportRange(
  project: Pick<VideoProject, 'duration'>,
  settings: Pick<VideoProjectExportSettings, 'rangeEndSeconds' | 'rangeStartSeconds'>
): VideoProjectExportRange {
  const projectDuration = Math.max(0, project.duration);
  const defaultEnd = projectDuration;
  const requestedStart =
    typeof settings.rangeStartSeconds === 'number' && Number.isFinite(settings.rangeStartSeconds)
      ? settings.rangeStartSeconds
      : 0;
  const start = clampRangeValue(requestedStart, 0, projectDuration);
  const requestedEnd =
    typeof settings.rangeEndSeconds === 'number' && Number.isFinite(settings.rangeEndSeconds)
      ? settings.rangeEndSeconds
      : defaultEnd;
  const end = clampRangeValue(requestedEnd, start, projectDuration);

  return {
    duration: Math.max(MIN_EXPORT_DURATION_SECONDS, end - start),
    end,
    start,
  };
}

export function hasProjectExportRange(
  project: Pick<VideoProject, 'duration'>,
  settings: Pick<VideoProjectExportSettings, 'rangeEndSeconds' | 'rangeStartSeconds'>
): boolean {
  const range = resolveProjectExportRange(project, settings);
  return range.start > 0 || range.end < Math.max(0, project.duration);
}
