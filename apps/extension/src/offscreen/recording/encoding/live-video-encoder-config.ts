import type { VideoCodec } from 'mediabunny';
import type { LiveVideoFrameTransform } from './live-video-frame-transform';

export type LiveEncoderContentHint = 'detail' | 'motion' | 'text';
type LiveVideoBitrateMode = 'constant' | 'variable';

interface LiveVideoEncodingSelection {
  container: 'mp4' | 'webm';
  frameRate: number;
  videoBitrate: number;
  videoCodec: VideoCodec;
  videoCodecString?: string;
}

interface LiveVideoEncodingInput {
  encoding: LiveVideoEncodingSelection;
  frameTransform?: LiveVideoFrameTransform | undefined;
  stream: MediaStream;
}

const VP9_LEVELS = [
  { level: 10, maxBitrate: 200_000, maxPictureSize: 36_864 },
  { level: 11, maxBitrate: 800_000, maxPictureSize: 73_728 },
  { level: 20, maxBitrate: 1_800_000, maxPictureSize: 122_880 },
  { level: 21, maxBitrate: 3_600_000, maxPictureSize: 245_760 },
  { level: 30, maxBitrate: 7_200_000, maxPictureSize: 552_960 },
  { level: 31, maxBitrate: 12_000_000, maxPictureSize: 983_040 },
  { level: 40, maxBitrate: 18_000_000, maxPictureSize: 2_228_224 },
  { level: 41, maxBitrate: 30_000_000, maxPictureSize: 2_228_224 },
  { level: 50, maxBitrate: 60_000_000, maxPictureSize: 8_912_896 },
  { level: 51, maxBitrate: 120_000_000, maxPictureSize: 8_912_896 },
  { level: 52, maxBitrate: 180_000_000, maxPictureSize: 8_912_896 },
  { level: 60, maxBitrate: 180_000_000, maxPictureSize: 35_651_584 },
  { level: 61, maxBitrate: 240_000_000, maxPictureSize: 35_651_584 },
  { level: 62, maxBitrate: 480_000_000, maxPictureSize: 35_651_584 },
] as const;

export function resolveLiveEncoderContentHint(
  track: MediaStreamVideoTrack
): LiveEncoderContentHint {
  const hint = track.contentHint;
  return hint === 'motion' || hint === 'text' || hint === 'detail' ? hint : 'detail';
}

export function resolveLiveVideoBitrateMode(
  input: Pick<LiveVideoEncodingInput, 'encoding' | 'frameTransform'>
): LiveVideoBitrateMode {
  return input.frameTransform &&
    input.encoding.container === 'webm' &&
    input.encoding.videoCodec === 'vp9'
    ? 'constant'
    : 'variable';
}

export function buildExactVideoEncoderConfig(
  input: Pick<LiveVideoEncodingInput, 'encoding' | 'frameTransform'>,
  dimensions: { height: number; width: number },
  contentHint: LiveEncoderContentHint
): VideoEncoderConfig | null {
  const codec = input.encoding.videoCodecString;
  if (!codec) return null;
  return buildVideoEncoderConfig(input, dimensions, contentHint, codec);
}

export function buildNativeVideoEncoderConfig(
  input: Pick<LiveVideoEncodingInput, 'encoding' | 'frameTransform'>,
  dimensions: { height: number; width: number },
  contentHint: LiveEncoderContentHint
): VideoEncoderConfig | null {
  const codec =
    input.encoding.videoCodecString ??
    (input.encoding.videoCodec === 'vp9'
      ? buildVp9CodecString(dimensions, input.encoding.videoBitrate)
      : null);
  if (!codec) return null;
  return buildVideoEncoderConfig(input, dimensions, contentHint, codec);
}

function buildVideoEncoderConfig(
  input: Pick<LiveVideoEncodingInput, 'encoding' | 'frameTransform'>,
  dimensions: { height: number; width: number },
  contentHint: LiveEncoderContentHint,
  codec: string
): VideoEncoderConfig {
  return {
    alpha: 'discard',
    bitrate: input.encoding.videoBitrate,
    bitrateMode: resolveLiveVideoBitrateMode(input),
    codec,
    contentHint,
    displayHeight: dimensions.height,
    displayWidth: dimensions.width,
    framerate: input.encoding.frameRate,
    hardwareAcceleration: 'no-preference',
    height: dimensions.height,
    latencyMode: 'quality',
    width: dimensions.width,
    ...(input.encoding.videoCodec === 'avc' ? { avc: { format: 'avc' as const } } : {}),
  };
}

function buildVp9CodecString(
  dimensions: { height: number; width: number },
  bitrate: number
): string {
  const pictureSize = dimensions.width * dimensions.height;
  const level =
    VP9_LEVELS.find(
      (candidate) => pictureSize <= candidate.maxPictureSize && bitrate <= candidate.maxBitrate
    ) ?? VP9_LEVELS.at(-1)!;
  return `vp09.00.${String(level.level).padStart(2, '0')}.08`;
}

export function canUseNativeEncoderTransform(
  transform: LiveVideoFrameTransform | undefined,
  encoderConfig: VideoEncoderConfig | null
): boolean {
  if (!encoderConfig || transform?.fit !== 'fill') return false;
  const positiveEvenDimensions = [
    transform.outputSize.width,
    transform.outputSize.height,
    transform.sourceRect.width,
    transform.sourceRect.height,
  ].every((value) => Number.isInteger(value) && value > 0 && value % 2 === 0);
  const alignedOrigin = [transform.sourceRect.x, transform.sourceRect.y].every(
    (value) => Number.isInteger(value) && value >= 0 && value % 2 === 0
  );
  return positiveEvenDimensions && alignedOrigin;
}

export function resolveLiveEncodingDimensions(
  input: Pick<LiveVideoEncodingInput, 'frameTransform' | 'stream'>
): { height: number; width: number } {
  const [videoTrack] = input.stream.getVideoTracks();
  if (!videoTrack) throw new Error('Live recording stream has no video track.');
  const videoSettings = videoTrack.getSettings();
  if (!input.frameTransform) {
    if (!videoSettings.width || !videoSettings.height) {
      throw new Error('Live recording video dimensions are unavailable.');
    }
    return { height: videoSettings.height, width: videoSettings.width };
  }
  const { outputSize, sourceRect } = input.frameTransform;
  if (
    !Number.isInteger(outputSize.width) ||
    !Number.isInteger(outputSize.height) ||
    outputSize.width <= 0 ||
    outputSize.height <= 0 ||
    outputSize.width % 2 !== 0 ||
    outputSize.height % 2 !== 0
  ) {
    throw new Error('Live recording transform output must use positive even dimensions.');
  }
  const sourceWidth = videoSettings.width;
  const sourceHeight = videoSettings.height;
  if (
    typeof sourceWidth !== 'number' ||
    typeof sourceHeight !== 'number' ||
    ![sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height].every(Number.isFinite) ||
    sourceRect.x < 0 ||
    sourceRect.y < 0 ||
    sourceRect.width <= 0 ||
    sourceRect.height <= 0 ||
    sourceRect.x + sourceRect.width > sourceWidth ||
    sourceRect.y + sourceRect.height > sourceHeight
  ) {
    throw new Error('Live recording transform source rectangle is outside the source frame.');
  }
  return outputSize;
}

export function assertLiveVideoEncoderConfig(input: {
  actual: VideoEncoderConfig;
  contentHint: LiveEncoderContentHint;
  dimensions: { height: number; width: number };
  encoding: LiveVideoEncodingSelection;
  expected: VideoEncoderConfig | null;
  frameTransform?: LiveVideoFrameTransform | undefined;
}): void {
  const { actual, encoding, expected } = input;
  if (actual.framerate !== encoding.frameRate) {
    throw new Error(
      'Live encoder did not preserve the requested frame rate as its rate-control expectation.'
    );
  }
  if (actual.bitrateMode !== resolveLiveVideoBitrateMode(input)) {
    throw new Error(
      'Live encoder did not preserve screen-efficient variable or selected bitrate mode.'
    );
  }
  if (actual.contentHint !== input.contentHint) {
    throw new Error('Live encoder did not preserve source content hint.');
  }
  if (
    !matchesSelectedCodec(actual.codec, encoding.videoCodec) ||
    actual.width !== input.dimensions.width ||
    actual.height !== input.dimensions.height ||
    actual.bitrate !== encoding.videoBitrate ||
    actual.alpha !== 'discard' ||
    actual.hardwareAcceleration !== 'no-preference' ||
    actual.latencyMode !== 'quality'
  ) {
    throw new Error('Live encoder did not preserve the selected video configuration.');
  }
  if (!expected) return;
  if (
    actual.codec !== expected.codec ||
    actual.width !== expected.width ||
    actual.height !== expected.height ||
    actual.displayWidth !== expected.displayWidth ||
    actual.displayHeight !== expected.displayHeight ||
    actual.framerate !== expected.framerate ||
    actual.bitrate !== expected.bitrate ||
    actual.bitrateMode !== expected.bitrateMode ||
    actual.alpha !== expected.alpha ||
    actual.hardwareAcceleration !== expected.hardwareAcceleration ||
    actual.latencyMode !== expected.latencyMode ||
    actual.avc?.format !== expected.avc?.format
  ) {
    throw new Error('Live encoder did not preserve the exact selected AVC configuration.');
  }
}

function matchesSelectedCodec(configuredCodec: string, selectedCodec: VideoCodec): boolean {
  if (selectedCodec === 'avc') return configuredCodec.startsWith('avc1');
  if (selectedCodec === 'vp9') {
    return configuredCodec === 'vp9' || configuredCodec.startsWith('vp09');
  }
  return configuredCodec === selectedCodec || configuredCodec.startsWith(`${selectedCodec}.`);
}
