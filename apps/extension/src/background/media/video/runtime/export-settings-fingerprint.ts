import type { VideoProjectExportSettings } from '../../../../features/video/project/types';

export function createProjectExportSettingsFingerprint(
  settings: VideoProjectExportSettings
): string {
  return JSON.stringify([
    ['width', settings.width],
    ['height', settings.height],
    ['fps', settings.fps],
    ['quality', settings.quality],
    ['format', settings.format],
    ['mp4VideoCodec', settings.mp4VideoCodec ?? null],
    ['scope', settings.scope ?? null],
    ['selectedClipIds', settings.selectedClipIds ?? []],
    ['burnInSubtitles', settings.burnInSubtitles ?? null],
    ['subtitleSidecarFormats', settings.subtitleSidecarFormats ?? []],
    ['downloadAfterExport', settings.downloadAfterExport],
    ['rangeStartSeconds', settings.rangeStartSeconds ?? null],
    ['rangeEndSeconds', settings.rangeEndSeconds ?? null],
  ]);
}
