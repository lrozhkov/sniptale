import { getVideoExportQuantizer } from '../../features/video/project/export/encoding-quality';
import type { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import {
  Output,
  Quality,
  StreamTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
  AudioSampleSource,
  VideoSampleSource,
  type VideoCodec,
  type StreamTargetChunk,
  type EncodedPacket,
  type AudioTrackMetadata,
} from 'mediabunny';
import type { SeekableAssetObjectWriter } from '../../composition/persistence/assets';
import type { ReviewMediaIndex } from './media-index';

/**
 * Builds codec tracks and a bounded positioned stream; caller owns cancellation and publication.
 * A `sampleVideo` swaps packet copy for the frame renderer: frames are drawn pre-rotated,
 * so the output track keeps identity rotation.
 */
export function createReviewMediaOutput(args: {
  index: ReviewMediaIndex;
  container?: 'mp4' | 'webm';
  processedAudio: 'aac' | 'opus' | null;
  /** Sequence audibility is independent of whether the primary source has audio. */
  omitAudio?: boolean;
  /** Caller owns the bounded native encoder; the factory owns only its mux track. */
  presentationAudio?: {
    source: EncodedAudioPacketSource;
    window: NonNullable<AudioTrackMetadata['presentationWindow']>;
  };
  writer: Pick<SeekableAssetObjectWriter, 'writeAt'>;
  signal: AbortSignal;
  provenance?: string;
  sampleVideo?: {
    codec: VideoCodec;
    fullCodecString: string;
    frameRate: number;
    /** Preserve authored microsecond durations, including a partial final sequence frame. */
    preserveFrameTiming?: boolean;
    frameRateMode?: 'constant' | 'adaptive' | undefined;
    bitrate: number;
    quality?: VideoQuality;
  };
  onAudioPacket(packet: EncodedPacket): void;
}) {
  const { index, signal } = args;
  if (args.presentationAudio && (args.omitAudio || args.processedAudio))
    throw new Error('Conflicting presentation audio output policies.');
  const target = new StreamTarget(
    new WritableStream<StreamTargetChunk>({
      async write(chunk) {
        signal.throwIfAborted();
        await args.writer.writeAt(chunk.position, new Blob([chunk.data]));
      },
    }),
    { chunked: true, chunkSize: 1024 * 1024 }
  );
  const output = new Output({
    target,
    format:
      (args.container ?? index.container) === 'mp4'
        ? new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 })
        : new WebMOutputFormat({ minimumClusterDuration: 1 }),
  });
  if (args.provenance) output.setMetadataTags({ comment: args.provenance });
  const quantizer = args.sampleVideo
    ? getVideoExportQuantizer(args.sampleVideo.codec, args.sampleVideo.quality ?? 'HIGH')
    : null;
  const video = args.sampleVideo
    ? {
        kind: 'sample' as const,
        source: new VideoSampleSource({
          codec: args.sampleVideo.codec,
          fullCodecString: args.sampleVideo.fullCodecString,
          quality: new Quality({
            bitrate: args.sampleVideo.bitrate,
            ...(quantizer === null ? {} : { quantizer }),
          }),
          bitrateMode: 'variable',
          latencyMode: 'quality',
          hardwareAcceleration: 'no-preference',
          keyFrameInterval: 2,
        }),
      }
    : { kind: 'copy' as const, source: new EncodedVideoPacketSource(index.videoCodec) };
  output.addVideoTrack(
    video.source,
    args.sampleVideo
      ? args.sampleVideo.preserveFrameTiming || args.sampleVideo.frameRateMode === 'adaptive'
        ? {}
        : { frameRate: args.sampleVideo.frameRate }
      : { rotation: index.rotation }
  );
  const audio = args.omitAudio
    ? null
    : args.presentationAudio
      ? { kind: 'presentation' as const, source: args.presentationAudio.source }
      : args.processedAudio
        ? {
            kind: 'processed' as const,
            source: new AudioSampleSource({
              codec: args.processedAudio,
              bitrate: 128_000,
              onEncodedPacket: args.onAudioPacket,
            }),
          }
        : index.audioCodec
          ? { kind: 'copy' as const, source: new EncodedAudioPacketSource(index.audioCodec) }
          : null;
  if (audio)
    output.addAudioTrack(
      audio.source,
      args.presentationAudio ? { presentationWindow: args.presentationAudio.window } : undefined
    );
  return { output, video, audio };
}
