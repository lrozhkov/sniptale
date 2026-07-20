import { createFile, DataStream, type Mp4BoxInfo, type Mp4BoxSample } from '@webav/mp4box.js';

import { loadBlobForAsset } from '../../media';
import { waitForEncoderQueueCapacity } from '../../codecs';
import type { Mp4CleanSourceRenderSpan } from './types';
import { collectSpanSamples } from './demux.samples';

const CLEAN_SOURCE_ENCODER_QUEUE_CAPACITY = 6;
const MP4_BOX_HEADER_BYTES = 8;

interface ExtractedMp4VideoSamples {
  codec: string;
  configDescription: BufferSource | undefined;
  samples: Mp4BoxSample[];
}

interface Mp4ParseState {
  settled: boolean;
}

function toMp4BoxBuffer(arrayBuffer: ArrayBuffer): ArrayBuffer & { fileStart?: number } {
  const buffer = arrayBuffer as ArrayBuffer & { fileStart?: number };
  buffer.fileStart = 0;
  return buffer;
}

function writeDecoderConfigRecord(
  description: NonNullable<Mp4BoxSample['description']>
): BufferSource | undefined {
  const box = description.avcC ?? description.hvcC ?? description.vpcC;
  if (!box) {
    return undefined;
  }

  const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
  box.write(stream);
  return stream.buffer.slice(MP4_BOX_HEADER_BYTES);
}

function getVideoTrack(info: Mp4BoxInfo) {
  return info.videoTracks?.[0] ?? null;
}

function finishMp4ParseError(
  state: Mp4ParseState,
  reject: (reason?: unknown) => void,
  error: unknown
) {
  if (state.settled) {
    return;
  }
  state.settled = true;
  reject(error instanceof Error ? error : new Error(String(error)));
}

function extractTrackSamples(
  file: ReturnType<typeof createFile>,
  track: NonNullable<ReturnType<typeof getVideoTrack>>
): Mp4BoxSample[] {
  const samples: Mp4BoxSample[] = [];
  file.onSamples = (_id, _user, nextSamples) => {
    samples.push(...nextSamples);
  };
  file.setExtractionOptions(track.id, null, {
    nbSamples: Math.max(1, track.nb_samples),
    rapAlignement: false,
  });
  file.start();
  file.flush();
  file.stop();
  return samples;
}

function resolveExtractedSamples(
  track: NonNullable<ReturnType<typeof getVideoTrack>>,
  samples: Mp4BoxSample[]
): ExtractedMp4VideoSamples {
  const firstDescription = samples.find((sample) => sample.description)?.description;
  return {
    codec: track.codec,
    configDescription: firstDescription ? writeDecoderConfigRecord(firstDescription) : undefined,
    samples,
  };
}

function parseMp4VideoSamples(arrayBuffer: ArrayBuffer): Promise<ExtractedMp4VideoSamples> {
  return new Promise((resolve, reject) => {
    const file = createFile(true);
    const state: Mp4ParseState = { settled: false };

    file.onError = (error) => finishMp4ParseError(state, reject, error);
    file.onReady = (info) => {
      const track = getVideoTrack(info);
      if (!track) {
        finishMp4ParseError(state, reject, new Error('MP4 source has no video track.'));
        return;
      }

      const samples = extractTrackSamples(file, track);
      if (state.settled) {
        return;
      }

      state.settled = true;
      resolve(resolveExtractedSamples(track, samples));
    };

    try {
      file.appendBuffer(toMp4BoxBuffer(arrayBuffer));
      if (!state.settled) {
        file.flush();
      }
    } catch (error) {
      finishMp4ParseError(state, reject, error);
    }
  });
}

function createDecoderConfig(
  samples: ExtractedMp4VideoSamples,
  span: Mp4CleanSourceRenderSpan
): VideoDecoderConfig {
  return {
    codec: samples.codec,
    codedHeight: span.clip.transform.height,
    codedWidth: span.clip.transform.width,
    ...(samples.configDescription === undefined ? {} : { description: samples.configDescription }),
  };
}

function createEncodedVideoChunk(sample: Mp4BoxSample): EncodedVideoChunk {
  return new EncodedVideoChunk({
    data: sample.data,
    duration: Math.round((sample.duration / sample.timescale) * 1_000_000),
    timestamp: Math.round((sample.cts / sample.timescale) * 1_000_000),
    type: sample.is_rap ? 'key' : 'delta',
  });
}

async function waitForDecoderFlush(decoder: VideoDecoder): Promise<void> {
  await decoder.flush();
  decoder.close();
}

interface CleanSourceEncodeArgs {
  signal?: AbortSignal;
  span: Mp4CleanSourceRenderSpan;
  throwIfPipelineFailed: () => void;
  videoEncoder: VideoEncoder;
}

function queueDecodedFrameEncode(args: {
  encodeTasks: Promise<void>[];
  frame: VideoFrame;
  outputIndexRef: { current: number };
  request: CleanSourceEncodeArgs;
}) {
  const sourceTimestampSeconds = args.frame.timestamp / 1_000_000;
  const projectTimestampUs = Math.round(
    (args.request.span.start +
      Math.max(0, sourceTimestampSeconds - args.request.span.sourceStart)) *
      1_000_000
  );
  const outputFrame = new VideoFrame(args.frame, {
    timestamp: projectTimestampUs,
    ...(typeof args.frame.duration === 'number' ? { duration: args.frame.duration } : {}),
  });
  args.frame.close();
  const encodeTask = waitForEncoderQueueCapacity(
    args.request.videoEncoder,
    CLEAN_SOURCE_ENCODER_QUEUE_CAPACITY,
    args.request.signal
  ).then(() => {
    try {
      args.request.videoEncoder.encode(outputFrame, {
        keyFrame: args.outputIndexRef.current === 0,
      });
      args.outputIndexRef.current += 1;
    } finally {
      outputFrame.close();
    }
  });
  args.encodeTasks.push(encodeTask);
}

async function getSupportedDecoderConfig(
  samples: ExtractedMp4VideoSamples,
  span: Mp4CleanSourceRenderSpan
): Promise<VideoDecoderConfig | null> {
  const config = createDecoderConfig(samples, span);
  const supported = await VideoDecoder.isConfigSupported(config).catch(() => null);
  if (!supported?.supported) {
    return null;
  }
  return supported.config ?? config;
}

function createCleanSourceDecoder(request: CleanSourceEncodeArgs, encodeTasks: Promise<void>[]) {
  const outputIndexRef = { current: 0 };
  return new VideoDecoder({
    output: (frame) => {
      queueDecodedFrameEncode({ encodeTasks, frame, outputIndexRef, request });
    },
    error: () => undefined,
  });
}

function decodeSpanSamples(
  decoder: VideoDecoder,
  spanSamples: Mp4BoxSample[],
  args: CleanSourceEncodeArgs
) {
  for (const sample of spanSamples) {
    if (args.signal?.aborted) {
      decoder.close();
      throw new DOMException('The export was aborted.', 'AbortError');
    }
    args.throwIfPipelineFailed();
    decoder.decode(createEncodedVideoChunk(sample));
  }
}

export async function encodeCleanSourceMp4Span(args: CleanSourceEncodeArgs): Promise<boolean> {
  if (typeof VideoDecoder === 'undefined') {
    return false;
  }

  const blob = await loadBlobForAsset(args.span.asset);
  const samples = await parseMp4VideoSamples(await blob.arrayBuffer());
  const spanSamples = collectSpanSamples(samples.samples, args.span);
  if (spanSamples.length === 0) {
    return false;
  }

  const config = await getSupportedDecoderConfig(samples, args.span);
  if (!config) {
    return false;
  }

  const encodeTasks: Promise<void>[] = [];
  const decoder = createCleanSourceDecoder(args, encodeTasks);
  decoder.configure(config);
  decodeSpanSamples(decoder, spanSamples, args);
  await waitForDecoderFlush(decoder);
  await Promise.all(encodeTasks);
  args.throwIfPipelineFailed();
  return true;
}
