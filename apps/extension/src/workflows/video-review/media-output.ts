import {
  Output,
  StreamTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
  AudioSampleSource,
  type StreamTargetChunk,
  type EncodedPacket,
} from 'mediabunny';
import type { SeekableAssetObjectWriter } from '../../composition/persistence/assets';
import type { ReviewMediaIndex } from './media-index';

/** Builds codec tracks and a bounded positioned stream; caller owns cancellation and publication. */
export function createReviewMediaOutput(args: {
  index: ReviewMediaIndex;
  processedAudio: 'aac' | 'opus' | null;
  writer: Pick<SeekableAssetObjectWriter, 'writeAt'>;
  signal: AbortSignal;
  provenance?: string;
  onAudioPacket(packet: EncodedPacket): void;
}) {
  const { index, signal } = args;
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
      index.container === 'mp4'
        ? new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 })
        : new WebMOutputFormat({ minimumClusterDuration: 1 }),
  });
  if (args.provenance) output.setMetadataTags({ comment: args.provenance });
  const video = new EncodedVideoPacketSource(index.videoCodec);
  output.addVideoTrack(video, { rotation: index.rotation });
  const audio = args.processedAudio
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
  if (audio) output.addAudioTrack(audio.source);
  return { output, video, audio };
}
