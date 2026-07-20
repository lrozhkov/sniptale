export const VIDEO_EDITOR_PREVIEW_MODES = ['live', 'cache'] as const;
export const VIDEO_EDITOR_PREVIEW_RASTER_PRESETS = [
  '360p',
  '540p',
  '720p',
  '1080p',
  '1440p',
  '2160p',
] as const;
export const VIDEO_EDITOR_PREVIEW_ZOOM_LEVELS = ['fit', '75%', '100%'] as const;

export const VideoEditorPreviewMode = { CACHE: 'cache', LIVE: 'live' } as const;
export type VideoEditorPreviewMode = (typeof VIDEO_EDITOR_PREVIEW_MODES)[number];

export const VideoEditorPreviewRasterPreset = {
  P360: '360p',
  P540: '540p',
  P720: '720p',
  P1080: '1080p',
  P1440: '1440p',
  P2160: '2160p',
} as const;
export type VideoEditorPreviewRasterPreset = (typeof VIDEO_EDITOR_PREVIEW_RASTER_PRESETS)[number];

export const VideoEditorPreviewZoom = { FIT: 'fit', P75: '75%', P100: '100%' } as const;
export type VideoEditorPreviewZoom = (typeof VIDEO_EDITOR_PREVIEW_ZOOM_LEVELS)[number];
