import {
  ALL_FORMATS,
  BlobSource,
  AudioSample,
  EncodedPacketSink,
  type EncodedVideoPacketSource,
  Input,
  type Output,
  type EncodedPacket,
  type InputVideoTrack,
} from 'mediabunny';
import type { SeekableAssetObjectWriter } from '../../composition/persistence/assets';
import type { ReviewEdit } from '../../features/video/review/types';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { isIndependentReviewPacket } from '../../features/video/review/random-access';
import type { ReviewMediaIndex } from './media-index';
import { createReviewMediaOutput } from './media-output';
import type { ReviewExportClipPlan } from './export-lifecycle';
import { audioPacketDuration, chooseReviewAudioCodec, renderReviewAudio } from './audio-render';

type Segment = ReturnType<typeof buildReviewTimeMap>[number];
export interface ReviewPacketReceipt {
  videoPackets: number;
  audioPackets: number;
  resultDuration: number;
  audioReencoded?: boolean;
  /** Full frame re-encode; the packet copy path never sets this. */
  videoReencoded?: boolean;
  outputAudioCodec?: 'aac' | 'opus' | null;
  audioRanges: { sourceStart: number; sourceEnd: number; resultStart: number; resultEnd: number }[];
}

/** Streams unchanged compressed video/audio payloads; publication belongs to export-lifecycle. */
export async function writeReviewPackets(args: {
  file: Blob;
  index: ReviewMediaIndex;
  edits: readonly ReviewEdit[];
  writer: Pick<SeekableAssetObjectWriter, 'writeAt'>;
  signal: AbortSignal;
  provenance?: string;
  exportAudio?: ReviewExportClipPlan;
  onProgress?(fraction: number): void;
}): Promise<ReviewPacketReceipt> {
  const { index, signal } = args;
  signal.throwIfAborted();
  if (
    args.edits.some(
      (edit) => !index.boundaries.includes(edit.start) || !index.boundaries.includes(edit.end)
    )
  )
    throw new Error('Export requires verified cut boundaries.');
  const segments = buildReviewTimeMap(index.duration, args.edits).filter(
    (part) => part.kind !== 'cut'
  );
  if (!segments.length) throw new Error('The edited video is empty.');
  const speedExists = args.edits.some((edit) => edit.kind === 'speed');
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

    const processing = (speedExists && !!audio) || !!args.exportAudio;
    const processedAudio = processing ? await chooseReviewAudioCodec(audio, index.container) : null;
    if (processing && !processedAudio) throw new Error('Audio processing is unavailable.');
    const videoSink = new EncodedPacketSink(video);
    const audioSink = audio ? new EncodedPacketSink(audio) : null;
    const sampleRate = audio ? await audio.getSampleRate() : 0;
    const receipt: ReviewPacketReceipt = {
      videoPackets: 0,
      audioPackets: 0,
      resultDuration: segments.at(-1)!.resultEnd,
      audioRanges: [],
      audioReencoded: !!processedAudio,
      outputAudioCodec: processedAudio ?? index.audioCodec,
    };
    const clock = { time: 0 };
    const tracks = createReviewMediaOutput({
      index,
      writer: args.writer,
      signal,
      processedAudio,
      ...(args.provenance ? { provenance: args.provenance } : {}),
      onAudioPacket: (packet) => {
        receipt.audioPackets++;
        clock.time = Math.max(clock.time, packet.timestamp + packet.duration);
      },
    });
    output = tracks.output;
    if (tracks.video.kind !== 'copy') throw new Error('Video output configuration changed.');
    const videoSource = tracks.video.source;
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
      const muted =
        !!args.exportAudio?.originalMuted ||
        args.edits.some(
          (edit) =>
            edit.kind === 'speed' && edit.start === segment.sourceStart && edit.audio === 'mute'
        );
      const audioPackets = processedAudio
        ? renderReviewAudio(audio, segment, muted, signal, args.exportAudio)
        : audioSink && index.audioCodec
          ? retainedAudio(audioSink, segment, clock, index.audioCodec, sampleRate, receipt, signal)
          : null;
      if (processedAudio && (speedExists || !!args.exportAudio))
        receipt.audioRanges.push({
          sourceStart: segment.sourceStart,
          sourceEnd: segment.sourceEnd,
          resultStart: segment.resultStart,
          resultEnd: segment.resultEnd,
        });
      videoEnd = Math.max(
        videoEnd,
        await muxSegmentPackets({
          videoPackets,
          audioPackets,
          videoSource,
          audioSource: tracks.audio,
          videoConfig,
          audioConfig,
          receipt,
          signal,
          onProgress: args.onProgress,
        })
      );
    }
    videoSource.close();
    tracks.audio?.source.close();
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
  audioPackets: AsyncGenerator<EncodedPacket | AudioSample, void, unknown> | null;
  videoSource: EncodedVideoPacketSource;
  audioSource: ReturnType<typeof createReviewMediaOutput>['audio'] | null;
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
  try {
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
      } else if (a && !a.done && audioSource) {
        if (audioSource.kind === 'processed' && a.value instanceof AudioSample) {
          await audioSource.source.add(a.value);
        } else if (
          audioSource.kind === 'copy' &&
          !(a.value instanceof AudioSample) &&
          audioConfig
        ) {
          await audioSource.source.add(a.value, { decoderConfig: audioConfig });
          receipt.audioPackets++;
        } else throw new Error('Audio output configuration changed.');
        a = await audioPackets!.next();
      }
    }
    return videoEnd;
  } finally {
    await videoPackets.return();
    await audioPackets?.return();
  }
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
      timestamp: segment.resultStart + (packet.timestamp - segment.sourceStart) / segment.rate,
      duration: duration / segment.rate,
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

export async function* retainedAudio(
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
