import { resolveReviewVideoEncoderConfig, type ReviewOutputCodec } from './render-codec';
import type {
  VideoQuality,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input, type Rotation } from 'mediabunny';
import { isIndependentReviewPacket } from '../../features/video/review/random-access';
import { chooseReviewAudioCodec } from './audio-render';

export type { ReviewOutputCodec } from './render-codec';

/** Session-local export choices; basic mode keeps the source encoding. */
export interface ReviewRenderSettings {
  format?: 'mp4' | 'webm';
  codec?: ReviewOutputCodec;
  resolution?: VideoResolutionPreset;
  quality: VideoQuality;
  frameRate: 0 | 24 | 30 | 60;
}

export interface ReviewMediaIndex {
  duration: number;
  boundaries: number[];
  videoCodec: 'avc' | 'hevc' | 'vp8' | 'vp9' | 'av1';
  audioCodec: 'aac' | 'opus' | null;
  container: 'mp4' | 'webm';
  rotation: Rotation;
  processedAudioCodec?: 'aac' | 'opus' | null;
  /** Encoder for a full frame render; null keeps visual exports honestly blocked. */
  processedVideoCodec?: ReviewOutputCodec | null;
  supportedVideoCodecs?: ReviewOutputCodec[];
  outputCodecs?: { mp4: ReviewOutputCodec[]; webm: ReviewOutputCodec[] };
  outputAudioCodecs?: { mp4: 'aac' | 'opus' | null; webm: 'opus' | null };
  /** Probed average frame rate; the render loop quantizes output frames to it. */
  frameRate?: number;
  width?: number;
  height?: number;
}

/** Re-encode codec for one frame render; mp4 keeps the broadly supported AVC path. */
export async function chooseReviewVideoCodec(
  container: 'mp4' | 'webm',
  dimensions: { width: number; height: number; bitrate?: number; fps?: number }
): Promise<ReviewOutputCodec | null> {
  return (await supportedReviewVideoCodecs(container, dimensions))[0] ?? null;
}

export async function supportedReviewVideoCodecs(
  container: 'mp4' | 'webm',
  dimensions: { width: number; height: number; bitrate?: number; fps?: number }
): Promise<ReviewOutputCodec[]> {
  if (typeof VideoEncoder === 'undefined') return [];
  const candidates =
    container === 'mp4' ? (['avc', 'hevc', 'vp9'] as const) : (['vp9', 'vp8'] as const);
  const supported: ReviewOutputCodec[] = [];
  for (const codec of candidates) {
    const requested = resolveReviewVideoEncoderConfig(codec, dimensions);
    try {
      const { supported: available, config } = await VideoEncoder.isConfigSupported(requested);
      if (
        available &&
        config &&
        config.codec === requested.codec &&
        config.width === requested.width &&
        config.height === requested.height &&
        config.framerate === requested.framerate &&
        config.bitrate === requested.bitrate &&
        config.bitrateMode === 'variable'
      )
        supported.push(codec);
    } catch {
      // Codec availability is independent; a rejected family must not hide other formats.
    }
  }
  return supported;
}

/** Indexes actual independent packets; no decoded frames or retained packet payloads. */
export async function inspectReviewMedia(
  file: Blob,
  signal: AbortSignal
): Promise<ReviewMediaIndex> {
  signal.throwIfAborted();
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const dispose = () => input.dispose();
  signal.addEventListener('abort', dispose, { once: true });
  try {
    const declaredDuration = await input.getDurationFromMetadata();
    const [videos, audios, duration] = await Promise.all([
      input.getVideoTracks(),
      input.getAudioTracks(),
      declaredDuration !== null && Number.isFinite(declaredDuration) && declaredDuration > 0
        ? Promise.resolve(declaredDuration)
        : input.computeDuration(),
    ]);
    const video = videos[0];
    const audio = audios[0];
    if (videos.length !== 1 || audios.length > 1 || !video)
      throw new Error('Packet export requires one video track and at most one audio track.');
    const videoCodec = video.codec;
    const audioCodec = audio?.codec ?? null;
    if (
      videoCodec !== 'avc' &&
      videoCodec !== 'hevc' &&
      videoCodec !== 'vp8' &&
      videoCodec !== 'vp9' &&
      videoCodec !== 'av1'
    )
      throw new Error('Video codec is unavailable for packet export.');
    if (audioCodec !== null && audioCodec !== 'aac' && audioCodec !== 'opus')
      throw new Error('Audio codec is unavailable for packet export.');
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Video duration is invalid.');
    const config = await video.getDecoderConfig();
    if (!config) throw new Error('Video configuration is unavailable.');
    if (audioCodec === 'aac') {
      const audioConfig = await audio!.getDecoderConfig();
      if (audioConfig?.codec !== 'mp4a.40.2')
        throw new Error('Only AAC-LC packet timing is supported.');
    }
    const sink = new EncodedPacketSink(video);
    const boundaries: number[] = [];
    let packet = await sink.getFirstKeyPacket();
    while (packet) {
      signal.throwIfAborted();
      const determined = await video.determinePacketType(packet);
      if (isIndependentReviewPacket(videoCodec, packet.data, config.description, determined)) {
        const time = packet.timestamp;
        if (time >= 0 && time < duration) boundaries.push(time);
      }
      packet = await sink.getNextKeyPacket(packet);
    }
    signal.throwIfAborted();
    if (!boundaries.length) throw new Error('Independent video frames are unavailable.');
    const first = await sink.getFirstPacket();
    if (!first || first.timestamp < 0 || !boundaries.includes(first.timestamp))
      throw new Error('The first video packet is not an independent source entry point.');
    const container =
      videoCodec === 'avc' || videoCodec === 'hevc' || audioCodec === 'aac' ? 'mp4' : 'webm';
    const [mp4Audio, webmAudio, mp4Video, webmVideo, packetStats] = await Promise.all([
      chooseReviewAudioCodec(audio ?? null, 'mp4'),
      chooseReviewAudioCodec(audio ?? null, 'webm'),
      supportedReviewVideoCodecs('mp4', {
        width: await video.getDisplayWidth(),
        height: await video.getDisplayHeight(),
      }),
      supportedReviewVideoCodecs('webm', {
        width: await video.getDisplayWidth(),
        height: await video.getDisplayHeight(),
      }),
      video.computePacketStats(Infinity, { metadataOnly: true }),
    ]);
    signal.throwIfAborted();
    const supportedVideoCodecs = container === 'mp4' ? mp4Video : webmVideo;
    return {
      duration,
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      boundaries: [...new Set([0, ...boundaries, duration])].sort((left, right) => left - right),
      videoCodec,
      audioCodec,
      container,
      processedAudioCodec: container === 'mp4' ? mp4Audio : webmAudio,
      outputAudioCodecs: { mp4: mp4Audio, webm: webmAudio === 'opus' ? webmAudio : null },
      outputCodecs: { mp4: mp4Video, webm: webmVideo },
      processedVideoCodec: supportedVideoCodecs[0] ?? null,
      supportedVideoCodecs,
      frameRate:
        Number.isFinite(packetStats.averagePacketRate) && packetStats.averagePacketRate > 0
          ? Math.min(120, Math.max(1, Math.round(packetStats.averagePacketRate)))
          : 30,
      rotation: await video.getRotation(),
    };
  } finally {
    signal.removeEventListener('abort', dispose);
    input.dispose();
  }
}
