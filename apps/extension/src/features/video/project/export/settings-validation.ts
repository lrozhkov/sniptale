import {
  VideoExportScope,
  VideoSubtitleSidecarFormat,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../types/index';

const MAX_EXPORT_DIMENSION_PX = 7680;
const MAX_EXPORT_FPS = 120;
const MAX_EXPORT_RANGE_SECONDS = 24 * 60 * 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max;
}

function isBoundedRangeValue(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= MAX_EXPORT_RANGE_SECONDS)
  );
}

function hasValidRangeShape(settings: Record<string, unknown>): boolean {
  const start = settings['rangeStartSeconds'];
  const end = settings['rangeEndSeconds'];
  if (!isBoundedRangeValue(start)) {
    return false;
  }
  if (!isBoundedRangeValue(end)) {
    return false;
  }
  if (start === undefined || end === undefined) {
    return true;
  }
  return end > start;
}

function hasValidSelectedClipShape(settings: Record<string, unknown>): boolean {
  if (settings['scope'] !== VideoExportScope.SELECTED_CLIP) {
    return true;
  }
  return Array.isArray(settings['selectedClipIds']) && settings['selectedClipIds'].length > 0;
}

function hasValidSubtitleSidecarFormats(settings: Record<string, unknown>): boolean {
  const formats = settings['subtitleSidecarFormats'];
  return (
    formats === undefined ||
    (Array.isArray(formats) &&
      formats.every(
        (format) =>
          format === VideoSubtitleSidecarFormat.SRT || format === VideoSubtitleSidecarFormat.VTT
      ))
  );
}

export function isBoundedVideoProjectExportSettings(
  settings: unknown
): settings is VideoProjectExportSettings {
  if (!isRecord(settings)) {
    return false;
  }

  return (
    isPositiveInteger(settings['width'], MAX_EXPORT_DIMENSION_PX) &&
    isPositiveInteger(settings['height'], MAX_EXPORT_DIMENSION_PX) &&
    isPositiveInteger(settings['fps'], MAX_EXPORT_FPS) &&
    hasValidRangeShape(settings) &&
    hasValidSelectedClipShape(settings) &&
    hasValidSubtitleSidecarFormats(settings)
  );
}

function isVideoProjectExportSettingsCompatibleWithProject(
  project: Pick<VideoProject, 'clips' | 'duration'>,
  settings: VideoProjectExportSettings
): boolean {
  if (!isBoundedVideoProjectExportSettings(settings)) {
    return false;
  }

  const duration = Math.max(0, project.duration);
  if (
    (settings.rangeStartSeconds !== undefined && settings.rangeStartSeconds >= duration) ||
    (settings.rangeEndSeconds !== undefined && settings.rangeEndSeconds > duration)
  ) {
    return false;
  }

  if (settings.scope !== VideoExportScope.SELECTED_CLIP) {
    return true;
  }

  const clipIds = new Set(project.clips.map((clip) => clip.id));
  return settings.selectedClipIds?.every((clipId) => clipIds.has(clipId)) === true;
}

export function assertVideoProjectExportSettingsCompatibleWithProject(
  project: Pick<VideoProject, 'clips' | 'duration'>,
  settings: VideoProjectExportSettings
): void {
  if (!isVideoProjectExportSettingsCompatibleWithProject(project, settings)) {
    throw new Error('Invalid video project export settings');
  }
}
