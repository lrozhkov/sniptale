export const VideoExportQualityPreset = {
  DRAFT: 'DRAFT',
  BALANCED: 'BALANCED',
  HIGH: 'HIGH',
} as const;

export type VideoExportQualityPreset =
  (typeof VideoExportQualityPreset)[keyof typeof VideoExportQualityPreset];

export const VideoExportFormat = {
  WEBM: 'WEBM',
  MP4: 'MP4',
} as const;

export type VideoExportFormat = (typeof VideoExportFormat)[keyof typeof VideoExportFormat];

export const VideoMp4Codec = {
  AVC: 'AVC',
  HEVC: 'HEVC',
  VP9: 'VP9',
} as const;

export type VideoMp4Codec = (typeof VideoMp4Codec)[keyof typeof VideoMp4Codec];

export const VideoExportCapabilityReason = {
  VIDEO_ENCODER_UNAVAILABLE: 'VIDEO_ENCODER_UNAVAILABLE',
  CODEC_UNSUPPORTED: 'CODEC_UNSUPPORTED',
} as const;

export type VideoExportCapabilityReason =
  (typeof VideoExportCapabilityReason)[keyof typeof VideoExportCapabilityReason];

export const VideoProjectExportPhase = {
  PREPARING: 'PREPARING',
  RENDERING: 'RENDERING',
  TRANSCODING: 'TRANSCODING',
  SAVING: 'SAVING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type VideoProjectExportPhase =
  (typeof VideoProjectExportPhase)[keyof typeof VideoProjectExportPhase];

export const VideoExportScope = {
  PROJECT: 'project',
  SELECTED_CLIP: 'selected-clip',
} as const;

export type VideoExportScope = (typeof VideoExportScope)[keyof typeof VideoExportScope];

export const VideoSubtitleSidecarFormat = {
  SRT: 'srt',
  VTT: 'vtt',
} as const;

export type VideoSubtitleSidecarFormat =
  (typeof VideoSubtitleSidecarFormat)[keyof typeof VideoSubtitleSidecarFormat];

export interface VideoExportFormatCapability {
  format: VideoExportFormat;
  available: boolean;
}

export interface VideoMp4CodecCapability {
  codec: VideoMp4Codec;
  available: boolean;
  reason?: VideoExportCapabilityReason;
}

export interface VideoExportCapabilities {
  formats: VideoExportFormatCapability[];
  mp4Codecs: VideoMp4CodecCapability[];
  defaultMp4VideoCodec: VideoMp4Codec | null;
}

export interface VideoProjectExportSettings {
  width: number;
  height: number;
  fps: number;
  quality: VideoExportQualityPreset;
  format: VideoExportFormat;
  mp4VideoCodec?: VideoMp4Codec;
  scope?: VideoExportScope;
  selectedClipIds?: string[];
  burnInSubtitles?: boolean;
  subtitleSidecarFormats?: VideoSubtitleSidecarFormat[];
  downloadAfterExport: boolean;
  rangeStartSeconds?: number;
  rangeEndSeconds?: number;
}

export interface VideoProjectExportStatus {
  phase: VideoProjectExportPhase;
  progress: number;
  message: string;
}
