import type { VideoQuality } from './quality';

export const VideoOutputContainer = {
  WEBM: 'WEBM',
  MP4: 'MP4',
} as const;

export type VideoOutputContainer = (typeof VideoOutputContainer)[keyof typeof VideoOutputContainer];

export const VideoOutputCodec = {
  VP8: 'VP8',
  VP9: 'VP9',
  AVC: 'AVC',
} as const;

export type VideoOutputCodec = (typeof VideoOutputCodec)[keyof typeof VideoOutputCodec];

export const VideoResolutionPreset = {
  SOURCE: 'SOURCE',
  P240: '240P',
  P360: '360P',
  P480: '480P',
  P720: '720P',
  P1080: '1080P',
  P1440: '1440P',
  P2160: '2160P',
} as const;

export type VideoResolutionPreset =
  (typeof VideoResolutionPreset)[keyof typeof VideoResolutionPreset];

export const VideoFrameRate = {
  FPS24: 24,
  FPS30: 30,
  FPS60: 60,
} as const;

export type VideoFrameRate = (typeof VideoFrameRate)[keyof typeof VideoFrameRate];

export interface VideoOutputProfile {
  codec: VideoOutputCodec;
  container: VideoOutputContainer;
  frameRate: VideoFrameRate;
  quality: VideoQuality;
  resolution: VideoResolutionPreset;
}

export interface VideoOutputDimensions {
  height: number;
  width: number;
}

type CanonicalVideoQuality = VideoQuality;

export const DEFAULT_VIDEO_OUTPUT_PROFILE: VideoOutputProfile = {
  codec: VideoOutputCodec.VP9,
  container: VideoOutputContainer.WEBM,
  frameRate: VideoFrameRate.FPS30,
  quality: 'HIGH',
  resolution: VideoResolutionPreset.P1080,
};

export const MAX_LIVE_VIDEO_PIXEL_RATE = 3840 * 2160 * 30;

const VIDEO_RESOLUTION_LINES: Readonly<Record<Exclude<VideoResolutionPreset, 'SOURCE'>, number>> = {
  [VideoResolutionPreset.P240]: 240,
  [VideoResolutionPreset.P360]: 360,
  [VideoResolutionPreset.P480]: 480,
  [VideoResolutionPreset.P720]: 720,
  [VideoResolutionPreset.P1080]: 1080,
  [VideoResolutionPreset.P1440]: 1440,
  [VideoResolutionPreset.P2160]: 2160,
};

const RESOLUTION_PRESET_ORDER = [
  VideoResolutionPreset.P240,
  VideoResolutionPreset.P360,
  VideoResolutionPreset.P480,
  VideoResolutionPreset.P720,
  VideoResolutionPreset.P1080,
  VideoResolutionPreset.P1440,
  VideoResolutionPreset.P2160,
] as const;

const VIDEO_BITRATE_LADDER: Readonly<
  Record<Exclude<VideoResolutionPreset, 'SOURCE'>, Record<CanonicalVideoQuality, number>>
> = {
  [VideoResolutionPreset.P240]: { LOW: 250_000, MEDIUM: 400_000, HIGH: 600_000, ULTRA: 900_000 },
  [VideoResolutionPreset.P360]: {
    LOW: 400_000,
    MEDIUM: 650_000,
    HIGH: 1_000_000,
    ULTRA: 1_500_000,
  },
  [VideoResolutionPreset.P480]: {
    LOW: 1_000_000,
    MEDIUM: 1_600_000,
    HIGH: 2_500_000,
    ULTRA: 3_750_000,
  },
  [VideoResolutionPreset.P720]: {
    LOW: 2_000_000,
    MEDIUM: 3_200_000,
    HIGH: 5_000_000,
    ULTRA: 7_500_000,
  },
  [VideoResolutionPreset.P1080]: {
    LOW: 3_000_000,
    MEDIUM: 5_000_000,
    HIGH: 8_000_000,
    ULTRA: 12_000_000,
  },
  [VideoResolutionPreset.P1440]: {
    LOW: 6_400_000,
    MEDIUM: 10_400_000,
    HIGH: 16_000_000,
    ULTRA: 24_000_000,
  },
  [VideoResolutionPreset.P2160]: {
    LOW: 16_000_000,
    MEDIUM: 26_000_000,
    HIGH: 40_000_000,
    ULTRA: 60_000_000,
  },
};

const HIGH_FRAME_RATE_BITRATE_MULTIPLIER = 1.5;

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function floorEven(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function roundEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

export function isVideoOutputCodecCompatible(
  container: VideoOutputContainer,
  codec: VideoOutputCodec
): boolean {
  return container === VideoOutputContainer.WEBM
    ? codec === VideoOutputCodec.VP8 || codec === VideoOutputCodec.VP9
    : codec === VideoOutputCodec.AVC;
}

export function getDefaultVideoOutputCodec(container: VideoOutputContainer): VideoOutputCodec {
  return container === VideoOutputContainer.WEBM ? VideoOutputCodec.VP9 : VideoOutputCodec.AVC;
}

const WEBM_CODEC_NAMES = {
  [VideoOutputCodec.VP8]: 'vp8',
  [VideoOutputCodec.VP9]: 'vp9',
} as const;

const MP4_VIDEO_CODEC_CANDIDATES = {
  [VideoOutputCodec.AVC]: ['avc1.640028', 'avc1.4d0028', 'avc1.42E01E'],
} as const;

export function getVideoRecordingMimeTypeCandidates(
  output: Pick<VideoOutputProfile, 'codec' | 'container'>,
  hasAudioTracks: boolean
): string[] {
  if (output.container === VideoOutputContainer.WEBM) {
    if (output.codec !== VideoOutputCodec.VP8 && output.codec !== VideoOutputCodec.VP9) {
      return [];
    }
    const videoCodec = WEBM_CODEC_NAMES[output.codec];
    return [
      `video/webm;codecs=${videoCodec}${hasAudioTracks ? ',opus' : ''}`,
      ...(hasAudioTracks ? [`video/webm;codecs=${videoCodec}`] : []),
    ];
  }

  if (output.codec !== VideoOutputCodec.AVC) {
    return [];
  }
  const audioCodec = 'mp4a.40.2';
  return MP4_VIDEO_CODEC_CANDIDATES[output.codec].map(
    (videoCodec) => `video/mp4;codecs=${videoCodec}${hasAudioTracks ? `,${audioCodec}` : ''}`
  );
}

export function isVideoOutputProfile(value: unknown): value is VideoOutputProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const containers = new Set<string>(Object.values(VideoOutputContainer));
  const codecs = new Set<string>(Object.values(VideoOutputCodec));
  const frameRates = new Set<number>(Object.values(VideoFrameRate));
  const qualities = new Set<string>(['LOW', 'MEDIUM', 'HIGH', 'ULTRA']);
  const resolutions = new Set<string>(Object.values(VideoResolutionPreset));
  if (
    typeof candidate['container'] !== 'string' ||
    !containers.has(candidate['container']) ||
    typeof candidate['codec'] !== 'string' ||
    !codecs.has(candidate['codec']) ||
    typeof candidate['frameRate'] !== 'number' ||
    !frameRates.has(candidate['frameRate']) ||
    typeof candidate['quality'] !== 'string' ||
    !qualities.has(candidate['quality']) ||
    typeof candidate['resolution'] !== 'string' ||
    !resolutions.has(candidate['resolution'])
  ) {
    return false;
  }

  return isVideoOutputCodecCompatible(
    candidate['container'] as VideoOutputContainer,
    candidate['codec'] as VideoOutputCodec
  );
}

export function resolveVideoOutputProfile(settings: {
  outputProfile?: VideoOutputProfile;
}): VideoOutputProfile {
  if (!isVideoOutputProfile(settings.outputProfile)) {
    throw new Error('Video output profile is required');
  }
  return settings.outputProfile;
}

export function resolveVideoPixelRate(
  dimensions: VideoOutputDimensions,
  frameRate: VideoFrameRate
): number {
  if (
    !isFinitePositive(dimensions.width) ||
    !isFinitePositive(dimensions.height) ||
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height)
  ) {
    throw new Error('Video output dimensions must be positive integers');
  }
  return dimensions.width * dimensions.height * frameRate;
}

export function isVideoPixelRateSupported(totalPixelRate: number): boolean {
  return (
    Number.isFinite(totalPixelRate) &&
    totalPixelRate > 0 &&
    totalPixelRate <= MAX_LIVE_VIDEO_PIXEL_RATE
  );
}

export function isVideoResolutionFrameRateSupported(
  resolution: VideoResolutionPreset,
  frameRate: VideoFrameRate
): boolean {
  return resolution !== VideoResolutionPreset.P2160 || frameRate === VideoFrameRate.FPS24;
}

export function resolveVideoOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  preset: VideoResolutionPreset
): VideoOutputDimensions {
  if (!isFinitePositive(sourceWidth) || !isFinitePositive(sourceHeight)) {
    throw new Error('Video source dimensions must be positive finite numbers');
  }

  const source = { width: sourceWidth, height: sourceHeight };
  if (preset === VideoResolutionPreset.SOURCE) {
    return { width: floorEven(source.width), height: floorEven(source.height) };
  }

  const targetHeight = VIDEO_RESOLUTION_LINES[preset];
  const scale = targetHeight / source.height;
  return {
    width: roundEven(source.width * scale),
    height: targetHeight,
  };
}

export function getVideoResolutionTier(
  width: number,
  height: number
): Exclude<VideoResolutionPreset, 'SOURCE'> {
  if (!isFinitePositive(width) || !isFinitePositive(height)) {
    throw new Error('Video dimensions must be positive finite numbers');
  }

  const source = { width, height };
  for (const preset of RESOLUTION_PRESET_ORDER) {
    if (source.height <= VIDEO_RESOLUTION_LINES[preset]) {
      return preset;
    }
  }

  return VideoResolutionPreset.P2160;
}

export function resolveVideoTargetBitrate(params: {
  fps: number;
  height: number;
  quality: CanonicalVideoQuality;
  resolution?: VideoResolutionPreset;
  width: number;
}): number {
  const resolution =
    params.resolution && params.resolution !== VideoResolutionPreset.SOURCE
      ? params.resolution
      : getVideoResolutionTier(params.width, params.height);
  const base = VIDEO_BITRATE_LADDER[resolution][params.quality];
  const frameRateAdjusted = params.fps > 30 ? base * HIGH_FRAME_RATE_BITRATE_MULTIPLIER : base;
  return Math.round(frameRateAdjusted);
}
