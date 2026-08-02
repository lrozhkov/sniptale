import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoMp4Codec,
  VideoExportScope,
  VideoSubtitleSidecarFormat,
  VideoWebmCodec,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../types/index';
import {
  resolveVideoOutputDimensions,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';

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

function hasCanonicalOutputSettings(settings: Record<string, unknown>): boolean {
  if (
    !Object.values(VideoExportQualityPreset).includes(
      settings['quality'] as VideoExportQualityPreset
    ) ||
    !Object.values(VideoResolutionPreset).includes(settings['resolution'] as VideoResolutionPreset)
  ) {
    return false;
  }

  if (settings['format'] === VideoExportFormat.MP4) {
    return (
      Object.values(VideoMp4Codec).includes(settings['mp4VideoCodec'] as VideoMp4Codec) &&
      settings['webmVideoCodec'] === undefined
    );
  }
  if (settings['format'] === VideoExportFormat.WEBM) {
    return (
      Object.values(VideoWebmCodec).includes(settings['webmVideoCodec'] as VideoWebmCodec) &&
      settings['mp4VideoCodec'] === undefined
    );
  }
  return false;
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
    settings['width'] % 2 === 0 &&
    settings['height'] % 2 === 0 &&
    isPositiveInteger(settings['fps'], MAX_EXPORT_FPS) &&
    hasCanonicalOutputSettings(settings) &&
    hasValidRangeShape(settings) &&
    hasValidSelectedClipShape(settings) &&
    hasValidSubtitleSidecarFormats(settings)
  );
}

function isVideoProjectExportSettingsCompatibleWithProject(
  project: Pick<VideoProject, 'clips' | 'duration' | 'height' | 'width'>,
  settings: unknown
): boolean {
  if (!isBoundedVideoProjectExportSettings(settings)) {
    return false;
  }

  const dimensions = resolveVideoOutputDimensions(
    project.width,
    project.height,
    settings.resolution
  );
  if (settings.width !== dimensions.width || settings.height !== dimensions.height) {
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
  project: Pick<VideoProject, 'clips' | 'duration' | 'height' | 'width'>,
  settings: unknown
): void {
  if (!isVideoProjectExportSettingsCompatibleWithProject(project, settings)) {
    throw new Error('Invalid video project export settings');
  }
}
