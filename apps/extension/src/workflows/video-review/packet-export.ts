import {
  ALL_FORMATS,
  StreamTarget,
  BlobSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  type EncodedPacket,
  type InputVideoTrack,
  type StreamTargetChunk,
} from 'mediabunny';
import type { SeekableAssetObjectWriter } from '../../composition/persistence/assets';
import type { ReviewEdit } from '../../features/video/review/types';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { isIndependentReviewPacket } from '../../features/video/review/random-access';
import type { ReviewMediaIndex } from './media-index';

type Segment = ReturnType<typeof buildReviewTimeMap>[number];
export interface ReviewPacketReceipt {
  videoPackets: number;
  audioPackets: number;
  resultDuration: number;
  audioRanges: { sourceStart: number; sourceEnd: number; resultStart: number; resultEnd: number }[];
}

/** Streams unchanged compressed video/audio payloads; publication belongs to export-lifecycle. */
export async function writeReviewPackets(args: {
  file: Blob;
  index: ReviewMediaIndex;
  edits: readonly ReviewEdit[];
  writer: Pick<SeekableAssetObjectWriter, 'writeAt'>;
  signal: AbortSignal;
  onProgress?(fraction: number): void;
}): Promise<ReviewPacketReceipt> {
  const { index, signal } = args;
  signal.throwIfAborted();
  if (
    args.edits.some(
      (edit) =>
        edit.kind !== 'cut' ||
        !index.boundaries.includes(edit.start) ||
        !index.boundaries.includes(edit.end)
    )
  )
    throw new Error('Export requires verified cut boundaries.');
  const segments = buildReviewTimeMap(index.duration, args.edits).filter(
    (part) => part.kind !== 'cut'
  );
  if (!segments.length) throw new Error('The edited video is empty.');
  const input = new Input({ source: new BlobSource(args.file), formats: ALL_FORMATS });
  const dispose = () => input.dispose();
  signal.addEventListener('abort', dispose, { once: true });
  let output: Output | null = null;
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!video || video.codec !== index.videoCodec || (audio?.codec ?? null) !== index.audioCodec)
      throw new Error('Source tracks changed.');
    const videoConfig = await video.getDecoderConfig();
    const audioConfig = await audio?.getDecoderConfig();
    if (!videoConfig || (audio && !audioConfig))
      throw new Error('Codec configuration is unavailable.');
    const target = new StreamTarget(
      new WritableStream<StreamTargetChunk>({
        async write(chunk) {
          signal.throwIfAborted();
          await args.writer.writeAt(chunk.position, new Blob([chunk.data]));
        },
      }),
      { chunked: true, chunkSize: 1024 * 1024 }
    );
    output = new Output({
      target,
      format:
        index.container === 'mp4'
          ? new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 })
          : new WebMOutputFormat({ minimumClusterDuration: 1 }),
    });
    const videoSource = new EncodedVideoPacketSource(index.videoCodec);
    const audioSource = index.audioCodec ? new EncodedAudioPacketSource(index.audioCodec) : null;
    output.addVideoTrack(videoSource, { rotation: index.rotation });
    if (audioSource) output.addAudioTrack(audioSource);
    const videoSink = new EncodedPacketSink(video);
    const audioSink = audio ? new EncodedPacketSink(audio) : null;
    const sampleRate = audio ? await audio.getSampleRate() : 0;
    const receipt: ReviewPacketReceipt = {
      videoPackets: 0,
      audioPackets: 0,
      resultDuration: segments.at(-1)!.resultEnd,
      audioRanges: [],
    };
    const clock = { time: 0 };
    let videoEnd = 0;
    await output.start();
    for (const segment of segments) {
      signal.throwIfAborted();
      const videoPackets = await segmentVideoPackets(
        video,
        videoSink,
        videoConfig,
        index,
        segment,
        signal
      );
      const audioPackets =
        audioSink && index.audioCodec
          ? retainedAudio(audioSink, segment, clock, index.audioCodec, sampleRate, receipt, signal)
          : null;
      videoEnd = Math.max(
        videoEnd,
        await muxSegmentPackets({
          videoPackets,
          audioPackets,
          videoSource,
          audioSource,
          videoConfig,
          audioConfig,
          receipt,
          signal,
          onProgress: args.onProgress,
        })
      );
    }
    videoSource.close();
    audioSource?.close();
    signal.throwIfAborted();
    await output.finalize();
    signal.throwIfAborted();
    receipt.resultDuration = Math.max(videoEnd, clock.time);
    args.onProgress?.(1);
    return receipt;
  } catch (error) {
    await output?.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener('abort', dispose);
    input.dispose();
  }
}

async function segmentVideoPackets(
  video: InputVideoTrack,
  videoSink: EncodedPacketSink,
  videoConfig: VideoDecoderConfig,
  index: ReviewMediaIndex,
  segment: Segment,
  signal: AbortSignal
) {
  const start =
    segment.sourceStart === 0
      ? await videoSink.getFirstPacket()
      : await videoSink.getKeyPacket(segment.sourceStart);
  if (
    !start ||
    (segment.sourceStart !== 0 && start.timestamp !== segment.sourceStart) ||
    !isIndependentReviewPacket(
      index.videoCodec,
      start.data,
      videoConfig.description,
      await video.determinePacketType(start)
    )
  )
    throw new Error('Export entry point is not independently decodable.');
  const end =
    segment.sourceEnd === index.duration ? null : await videoSink.getKeyPacket(segment.sourceEnd);
  if (end && end.timestamp !== segment.sourceEnd) throw new Error('Export boundary changed.');
  return retainedVideo(videoSink, start, end, segment, signal);
}

/** Merge one pending packet per track so muxer buffering stays bounded. */
async function muxSegmentPackets(args: {
  videoPackets: AsyncGenerator<EncodedPacket, void, unknown>;
  audioPackets: AsyncGenerator<EncodedPacket, void, unknown> | null;
  videoSource: EncodedVideoPacketSource;
  audioSource: EncodedAudioPacketSource | null;
  videoConfig: VideoDecoderConfig;
  audioConfig: AudioDecoderConfig | null | undefined;
  receipt: ReviewPacketReceipt;
  signal: AbortSignal;
  onProgress: ((fraction: number) => void) | undefined;
}) {
  const {
    videoPackets,
    audioPackets,
    videoSource,
    audioSource,
    videoConfig,
    audioConfig,
    receipt,
    signal,
  } = args;
  let videoEnd = 0;
  let v = await videoPackets.next();
  let a = await audioPackets?.next();
  while (!v.done || (a && !a.done)) {
    signal.throwIfAborted();
    if (!v.done && (!a || a.done || v.value.timestamp <= a.value.timestamp)) {
      await videoSource.add(v.value, { decoderConfig: videoConfig });
      videoEnd = Math.max(videoEnd, v.value.timestamp + v.value.duration);
      receipt.videoPackets++;
      args.onProgress?.(Math.min(1, v.value.timestamp / receipt.resultDuration));
      v = await videoPackets.next();
    } else if (a && !a.done && audioSource && audioConfig) {
      await audioSource.add(a.value, { decoderConfig: audioConfig });
      receipt.audioPackets++;
      a = await audioPackets!.next();
    }
  }
  return videoEnd;
}

async function* retainedVideo(
  sink: EncodedPacketSink,
  start: EncodedPacket,
  end: EncodedPacket | null,
  segment: Segment,
  signal: AbortSignal
) {
  let pending: EncodedPacket | null = null;
  const timed = (packet: EncodedPacket, nextTime: number) => {
    const duration = packet.duration > 0 ? packet.duration : nextTime - packet.timestamp;
    if (duration <= 0) throw new Error('Video packet duration cannot be determined.');
    return packet.clone({
      timestamp: segment.resultStart + packet.timestamp - segment.sourceStart,
      duration,
    });
  };
  for await (const packet of sink.packets(start, end ?? undefined)) {
    signal.throwIfAborted();
    if (packet.timestamp < segment.sourceStart || packet.timestamp >= segment.sourceEnd) continue;
    if (pending) yield timed(pending, packet.timestamp);
    pending = packet;
  }
  // WebM SimpleBlock may omit the last duration; the declared segment end owns its visible tail.
  if (pending) yield timed(pending, segment.sourceEnd);
}

/** Use codec sample duration, not muxer timestamps or a fixed assumed Opus frame size. */
function audioPacketDuration(packet: EncodedPacket, codec: 'aac' | 'opus', sampleRate: number) {
  if (codec === 'aac') return 1024 / sampleRate;
  const toc = packet.data[0];
  if (toc === undefined) throw new Error('Empty Opus packet.');
  const config = toc >> 3;
  const frameMs =
    config >= 16
      ? 2.5 * 2 ** (config & 3)
      : config >= 12
        ? 10 * 2 ** (config & 1)
        : [10, 20, 40, 60][config & 3]!;
  const code = toc & 3;
  const count = code === 0 ? 1 : code === 3 ? (packet.data[1] ?? 0) & 63 : 2;
  const duration = (count * frameMs) / 1000;
  if (duration <= 0 || duration > 0.12) throw new Error('Invalid Opus packet duration.');
  return duration;
}

async function* retainedAudio(
  sink: EncodedPacketSink,
  segment: Segment,
  clock: { time: number },
  codec: 'aac' | 'opus',
  sampleRate: number,
  receipt: ReviewPacketReceipt,
  signal: AbortSignal
) {
  let packet = (await sink.getPacket(segment.sourceStart)) ?? (await sink.getFirstPacket());
  if (!packet) return;
  const next = await sink.getNextPacket(packet);
  if (
    next &&
    Math.abs(next.timestamp - segment.sourceStart) <
      Math.abs(packet.timestamp - segment.sourceStart)
  )
    packet = next;
  let range: ReviewPacketReceipt['audioRanges'][number] | null = null;
  for await (const current of sink.packets(packet)) {
    signal.throwIfAborted();
    const duration = audioPacketDuration(current, codec, sampleRate);
    if (current.timestamp + duration <= segment.sourceStart) continue;
    if (current.timestamp + duration / 2 > segment.sourceEnd) break;
    // Preserve delayed track starts and gaps, while preventing packet rounding from overlapping joins.
    const timestamp = Math.max(
      clock.time,
      segment.resultStart + current.timestamp - segment.sourceStart
    );
    if (timestamp + duration / 2 > segment.resultEnd) break;
    clock.time = timestamp + duration;
    if (!range || current.timestamp - range.sourceEnd > duration / 2) {
      if (range) receipt.audioRanges.push(range);
      range = {
        sourceStart: current.timestamp,
        sourceEnd: current.timestamp,
        resultStart: timestamp,
        resultEnd: timestamp,
      };
    }
    range.sourceEnd = current.timestamp + duration;
    range.resultEnd = clock.time;
    yield current.clone({ timestamp, duration });
  }
  if (range) receipt.audioRanges.push(range);
}
