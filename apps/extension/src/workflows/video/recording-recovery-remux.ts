import {
  ALL_FORMATS,
  BlobSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  VideoSampleSink,
  AudioSampleSink,
  WebMOutputFormat,
  type EncodedPacket,
  type StreamTargetChunk,
} from 'mediabunny';
import {
  createSeekableAssetObjectWriter,
  readAssetFile,
} from '../../composition/persistence/assets';
import type { PersistenceMutationTransitionPermit } from '../../composition/persistence/infrastructure/mutation-barrier';
import {
  createRecoveryProgressReporter,
  type RecordingRecoveryProgressObserver,
} from './recording-recovery-progress';

/** A broken suffix ends packet reading; it never removes the source or acknowledges output. */
async function nextRetainedPacket(sink: EncodedPacketSink, packet: EncodedPacket) {
  try {
    return await sink.getNextPacket(packet);
  } catch {
    return null;
  }
}

/** Remuxes packets to disk with bounded mux buffers, then decodes the complete result. */
export async function remuxRecoveryRecording(
  file: File,
  persistenceTransitionPermit?: PersistenceMutationTransitionPermit,
  onProgress?: RecordingRecoveryProgressObserver
) {
  const report = createRecoveryProgressReporter(onProgress);
  report({ stage: 'remuxing', completed: 0 });
  const mimeType = file.type.includes('mp4') ? 'video/mp4' : 'video/webm';
  const writer = await createSeekableAssetObjectWriter(
    { mimeType },
    persistenceTransitionPermit ? { persistenceTransitionPermit } : {}
  );
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let output: Output | undefined;
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!video?.codec) throw new Error('The saved recording has no readable video track.');
    const videoConfig = await video.getDecoderConfig();
    const audioConfig = await audio?.getDecoderConfig();
    if (!videoConfig || (audio && (!audio.codec || !audioConfig)))
      throw new Error('The saved recording has no usable codec configuration.');
    const videoSink = new EncodedPacketSink(video);
    const audioSink = audio ? new EncodedPacketSink(audio) : null;
    let v = await videoSink.getFirstPacket();
    let a = audioSink ? await audioSink.getFirstPacket() : null;
    if (!v || (await video.determinePacketType(v)) !== 'key')
      throw new Error('The saved recording has no independent starting frame.');
    output = new Output({
      format:
        mimeType === 'video/mp4'
          ? new Mp4OutputFormat({ fastStart: 'fragmented' })
          : new WebMOutputFormat(),
      target: new StreamTarget(
        new WritableStream<StreamTargetChunk>({
          async write(chunk) {
            await writer.writeAt(chunk.position, new Blob([chunk.data]));
          },
        }),
        { chunked: true, chunkSize: 1024 * 1024 }
      ),
    });
    const videoSource = new EncodedVideoPacketSource(video.codec);
    const audioSource = audio?.codec ? new EncodedAudioPacketSource(audio.codec) : null;
    output.addVideoTrack(videoSource, { rotation: video.rotation });
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();
    let packets = 0;
    while (v || a) {
      if (v && (!a || v.timestamp <= a.timestamp)) {
        await videoSource.add(v, { decoderConfig: videoConfig });
        v = await nextRetainedPacket(videoSink, v);
      } else if (a && audioSink && audioSource && audioConfig) {
        await audioSource.add(a, { decoderConfig: audioConfig });
        a = await nextRetainedPacket(audioSink, a);
      } else {
        throw new Error('The saved audio track cannot be recovered.');
      }
      report({ stage: 'remuxing', completed: ++packets });
    }
    report({ stage: 'remuxing', completed: packets }, true);
    videoSource.close();
    audioSource?.close();
    await output.finalize();
    const prepared = await writer.finalize();
    const result = await readAssetFile(prepared.ref, file.name);
    await validateRecoveredRecording(result, report);
    return { file: result, preparedAsset: prepared, release: () => writer.abort() };
  } catch (error) {
    await output?.cancel().catch(() => undefined);
    await writer.abort();
    throw error;
  } finally {
    input.dispose();
  }
}

async function validateRecoveredRecording(
  file: File,
  report: ReturnType<typeof createRecoveryProgressReporter>
) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('The recovered video track is missing.');
    let frames = 0;
    report({ stage: 'validatingVideo', completed: 0 });
    for await (const sample of new VideoSampleSink(video).samples()) {
      frames++;
      sample.close();
      report({ stage: 'validatingVideo', completed: frames });
    }
    if (!frames) throw new Error('The recovered recording has no decodable frames.');
    report({ stage: 'validatingVideo', completed: frames }, true);
    const audio = await input.getPrimaryAudioTrack();
    if (audio) {
      let samples = 0;
      report({ stage: 'validatingAudio', completed: 0 });
      for await (const sample of new AudioSampleSink(audio).samples()) {
        samples++;
        sample.close();
        report({ stage: 'validatingAudio', completed: samples });
      }
      if (!samples) throw new Error('The recovered audio track has no decodable samples.');
      report({ stage: 'validatingAudio', completed: samples }, true);
    }
  } finally {
    input.dispose();
  }
}
