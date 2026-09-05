import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input, type Rotation } from 'mediabunny';
import { isIndependentReviewPacket } from '../../features/video/review/random-access';

export interface ReviewMediaIndex {
  duration: number;
  boundaries: number[];
  videoCodec: 'avc' | 'hevc' | 'vp8' | 'vp9' | 'av1';
  audioCodec: 'aac' | 'opus' | null;
  container: 'mp4' | 'webm';
  rotation: Rotation;
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
    return {
      duration,
      boundaries: [...new Set([0, ...boundaries, duration])].sort((left, right) => left - right),
      videoCodec,
      audioCodec,
      container:
        videoCodec === 'avc' || videoCodec === 'hevc' || audioCodec === 'aac' ? 'mp4' : 'webm',
      rotation: await video.getRotation(),
    };
  } finally {
    signal.removeEventListener('abort', dispose);
    input.dispose();
  }
}
