import {
  AudioBufferSource,
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Output,
  WebMOutputFormat,
} from 'mediabunny';
import type { VideoProjectExportSettings } from '../../features/video/project/types';
import { closeEncoderQuietly, resolveExportTargetBitrate } from './codecs';

export async function createWebmEncoding(settings: VideoProjectExportSettings, hasAudio: boolean) {
  const codec = settings.webmVideoCodec === 'VP8' ? 'vp8' : 'vp9';
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const source = new EncodedVideoPacketSource(codec);
  output.addVideoTrack(source, { frameRate: settings.fps });
  const audio = hasAudio ? new AudioBufferSource({ codec: 'opus', bitrate: 128_000 }) : null;
  if (audio) output.addAudioTrack(audio);
  const state = createPacketWriter(source);
  const videoEncoder = new VideoEncoder({ output: state.write, error: state.fail });
  try {
    videoEncoder.configure({
      codec: codec === 'vp8' ? 'vp8' : 'vp09.00.10.08',
      width: settings.width,
      height: settings.height,
      framerate: settings.fps,
      bitrate: resolveExportTargetBitrate(settings),
      bitrateMode: 'variable',
    });
    await output.start();
  } catch (error) {
    closeEncoderQuietly(videoEncoder);
    await output.cancel();
    throw error;
  }
  return {
    videoEncoder,
    check: state.check,
    async finish(buffer?: AudioBuffer) {
      await videoEncoder.flush();
      await state.drain();
      if (audio && buffer) await audio.add(buffer);
      await output.finalize();
      state.check();
      if (!output.target.buffer) throw new Error('WEBM_OUTPUT_EMPTY');
      return new Blob([output.target.buffer], { type: 'video/webm' });
    },
    async dispose() {
      closeEncoderQuietly(videoEncoder);
      if (output.state !== 'finalized') await output.cancel();
    },
  };
}

function createPacketWriter(source: EncodedVideoPacketSource) {
  let failure: unknown;
  let pending = Promise.resolve();
  const fail = (error: unknown) => {
    failure ??= error;
  };
  const check = () => {
    if (failure) throw failure;
  };
  return {
    fail,
    check,
    write(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) {
      const packet = EncodedPacket.fromEncodedChunk(chunk);
      pending = pending.then(() => source.add(packet, metadata)).catch(fail);
    },
    async drain() {
      await pending;
      check();
    },
  };
}
