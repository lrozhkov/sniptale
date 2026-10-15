import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  EncodedPacketSink,
  Input,
  Output,
  VideoSampleSink,
  WebMOutputFormat,
} from 'mediabunny';
import { writeReviewFrames } from '../../../apps/extension/src/workflows/video-review/render-export';
import { inspectReviewMedia } from '../../../apps/extension/src/workflows/video-review/media-index';
import { createQuickEditAdvancedState } from '../../../apps/extension/src/features/video/review/advanced/defaults';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../apps/extension/src/features/video/project/factories/creation';
import { createShapeClip } from '../../../apps/extension/src/features/video/project/factories/overlay-clip';
import { createAudioClipFromAsset } from '../../../apps/extension/src/features/video/project/factories/clip';
import { saveProjectAsset } from '../../../apps/extension/src/composition/persistence/projects/index';
import {
  VideoProjectAssetType,
  VideoProjectShapeType,
  VideoTrackKind,
  type VideoProjectExportSettings,
} from '../../../apps/extension/src/features/video/project/types';
import { renderCompositeToMp4 } from '../../../apps/extension/src/offscreen/project-export/render-mp4';
import { renderCompositeToWebm } from '../../../apps/extension/src/offscreen/project-export/render-webm';
import type { ExportJobState } from '../../../apps/extension/src/offscreen/project-export/types';
import { createAdaptiveFrameWriter } from '../../../apps/extension/src/features/video/project/export/adaptive-frames';

const DURATION = 2.223;
function surface(width = 160, height = 90) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false })!;
  return { canvas, context };
}

async function sourceVideo(withAudio: boolean, width = 160, height = 90) {
  const { canvas, context } = surface(width, height);
  context.scale(width / 160, height / 90);
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: 'vp9', bitrate: 1_000_000 });
  const audio = withAudio ? new AudioBufferSource({ codec: 'opus', bitrate: 64_000 }) : null;
  output.addVideoTrack(video);
  if (audio) output.addAudioTrack(audio);
  await output.start();
  for (let i = 0; i / 60 < DURATION; i++) {
    context.fillStyle = '#102040';
    context.fillRect(0, 0, 160, 90);
    if (i === 60 || (i >= 84 && i < 108)) {
      context.fillStyle = '#ff2020';
      context.fillRect(i === 60 ? 50 : 20 + i - 84, 25, 40, 40);
    }
    await video.add(i / 60, Math.min(1 / 60, DURATION - i / 60));
  }
  video.close();
  if (audio) {
    const buffer = new AudioBuffer({
      length: Math.round(DURATION * 48000),
      sampleRate: 48000,
      numberOfChannels: 1,
    });
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin((i * 2 * Math.PI * 440) / 48000) * 0.1;
    await audio.add(buffer);
    audio.close();
  }
  await output.finalize();
  return new Blob([output.target.buffer!], { type: 'video/webm' });
}

async function quickExport(
  file: Blob,
  format: 'mp4' | 'webm',
  adaptive: boolean,
  fragment: boolean
) {
  const signal = new AbortController().signal;
  const index = { ...(await inspectReviewMedia(file, signal)), duration: DURATION };
  const chunks: Array<{ offset: number; bytes: Uint8Array }> = [];
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  await writeReviewFrames({
    file,
    index,
    advanced,
    signal,
    edits: fragment ? [{ id: 'trim', kind: 'cut', start: 0, end: 0.137 }] : [],
    fragmentOffset: 0,
    readProjectAsset: async () => null,
    renderSettings: {
      format,
      codec: format === 'mp4' ? 'avc' : 'vp9',
      frameRate: 60,
      quality: 'HIGH',
      frameRateMode: adaptive ? 'adaptive' : 'constant',
    },
    writer: {
      writeAt: async (offset, blob) => {
        chunks.push({ offset, bytes: new Uint8Array(await blob.arrayBuffer()) });
      },
    },
  });
  const bytes = new Uint8Array(Math.max(...chunks.map((c) => c.offset + c.bytes.length)));
  for (const c of chunks) bytes.set(c.bytes, c.offset);
  return new Blob([bytes], { type: `video/${format}` });
}

async function fullExport(
  file: Blob,
  format: 'mp4' | 'webm',
  adaptive: boolean,
  fragment: boolean,
  withAudio: boolean,
  width = 160,
  height = 90
) {
  const project = createEmptyVideoProject('Adaptive proof', width, height);
  project.duration = DURATION;
  for (const i of [60, ...Array.from({ length: 24 }, (_, k) => k + 84)]) {
    const shape = createShapeClip(
      project.tracks[0]!.id,
      160,
      90,
      i / 60,
      VideoProjectShapeType.RECTANGLE
    );
    shape.duration = 1 / 60;
    shape.transform = {
      ...shape.transform,
      x: ((i === 60 ? 50 : 20 + i - 84) * width) / 160,
      y: (25 * height) / 90,
      width: (40 * width) / 160,
      height: (40 * height) / 90,
    };
    shape.style = { ...shape.style, fillColor: '#ff2020', strokeWidth: 0 };
    project.clips.push(shape);
  }
  if (withAudio) {
    const id = crypto.randomUUID();
    await saveProjectAsset(id, file, file.type, 'adaptive-source.webm');
    const asset = createVideoProjectAsset(
      'Audio',
      VideoProjectAssetType.VIDEO,
      { kind: 'project-asset', projectAssetId: id },
      {
        width: 160,
        height: 90,
        duration: DURATION,
        mimeType: file.type,
        size: file.size,
        hasAudio: true,
        audioPeaks: null,
      }
    );
    const track = createVideoProjectTrack('Audio', 2, VideoTrackKind.AUDIO);
    project.assets.push(asset);
    project.tracks.push(track);
    project.clips.push(createAudioClipFromAsset(track.id, asset));
  }
  const common = {
    width,
    height,
    fps: 60,
    quality: 'HIGH' as const,
    resolution: 'SOURCE' as const,
    downloadAfterExport: false,
    frameRateMode: adaptive ? ('adaptive' as const) : ('constant' as const),
    ...(fragment
      ? { scope: 'selected-range' as const, rangeStartSeconds: 0.137, rangeEndSeconds: DURATION }
      : {}),
  };
  const settings: VideoProjectExportSettings =
    format === 'mp4'
      ? { ...common, format: 'MP4', mp4VideoCodec: 'AVC' }
      : { ...common, format: 'WEBM', webmVideoCodec: 'VP9' };
  const job: ExportJobState = {
    jobId: crypto.randomUUID(),
    cancelled: false,
    mediaRecorder: null,
    clipMediaElements: new Map(),
    clipAudioNodes: new Map(),
    audioContext: null,
    audioDestination: null,
    exportAudioSettings: null,
    assetUrls: [],
    cleanupNode: null,
    exportAbortController: new AbortController(),
    exportStream: null,
  };
  const { canvas, context } = surface(width, height);
  return format === 'mp4'
    ? renderCompositeToMp4(job, project, settings, {}, canvas, context)
    : renderCompositeToWebm(job, project, settings, {}, context, canvas);
}

async function inspect(blob: Blob, fragment: boolean) {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = (await input.getPrimaryVideoTrack())!;
    const packets: Array<{ timestamp: number; duration: number; key: boolean }> = [];
    for await (const packet of new EncodedPacketSink(track).packets())
      packets.push({
        timestamp: packet.timestamp,
        duration: packet.duration,
        key: packet.type === 'key',
      });
    const audio = await input.getPrimaryAudioTrack();
    const times = [0.9, 1.005, 1.03, 1.45, 1.55, DURATION - 0.001].map(
      (t) => t - (fragment ? 0.137 : 0)
    );
    const { canvas, context } = surface();
    const colors: number[][] = [];
    for await (const sample of new VideoSampleSink(track).samplesAtTimestamps(times)) {
      if (!sample) throw new Error('Missing exported frame');
      sample.draw(context, 0, 0, canvas.width, canvas.height);
      colors.push([...context.getImageData(60, 40, 1, 1).data]);
      sample.close();
    }
    return {
      bytes: blob.size,
      packets,
      videoDuration: await track.computeDuration(),
      metadataDuration: await input.getDurationFromMetadata(),
      audioDuration: audio ? await audio.computeDuration() : null,
      colors,
    };
  } finally {
    input.dispose();
  }
}

export async function adaptiveExportProof(
  editor: 'quick' | 'full',
  format: 'mp4' | 'webm',
  fragment: boolean,
  withAudio: boolean,
  width = 160,
  height = 90
) {
  const file = await sourceVideo(withAudio, width, height);
  const run = (adaptive: boolean) =>
    editor === 'quick'
      ? quickExport(file, format, adaptive, fragment)
      : fullExport(file, format, adaptive, fragment, withAudio, width, height);
  const started = performance.now();
  const adaptive = await run(true);
  const adaptiveMs = performance.now() - started;
  const constantStart = performance.now();
  const constant = await run(false);
  const constantMs = performance.now() - constantStart;
  return {
    adaptive: await inspect(adaptive, fragment),
    constant: await inspect(constant, fragment),
    adaptiveMs,
    constantMs,
  };
}

export async function adaptiveReadbackProof() {
  await proveAdaptiveNativePixels();
  const rows = [];
  for (const moving of [false, true]) {
    const { canvas, context } = surface(3840, 2160);
    let emitted = 0;
    const writer = createAdaptiveFrameWriter(context, async () => {
      emitted++;
    });
    const started = performance.now();
    for (let i = 0; i < 60; i++) {
      context.fillStyle = moving ? `rgb(${i * 3}, 32, 64)` : '#102040';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await writer.add(
        Math.round((i * 1e6) / 60),
        Math.round(((i + 1) * 1e6) / 60) - Math.round((i * 1e6) / 60)
      );
    }
    await writer.flush();
    rows.push({ moving, milliseconds: performance.now() - started, emitted });
    writer.dispose();
  }
  return rows;
}

async function proveAdaptiveNativePixels() {
  const canvas = document.createElement('canvas');
  canvas.width = 17;
  canvas.height = 9;
  const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })!;
  const expected: number[][] = [];
  const emitted: number[][] = [];
  const writer = createAdaptiveFrameWriter(context, async (frame) => {
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    await frame.copyTo(data, { format: 'RGBA', colorSpace: 'srgb' });
    emitted.push([...data]);
  });
  try {
    const pixel = context.createImageData(1, 1);
    for (const [i, rgba] of [
      [0, 0, 0, 0],
      [80, 120, 160, 127],
      [0, 0, 0, 0],
      [127, 80, 40, 255],
      [128, 80, 40, 255],
    ].entries()) {
      pixel.data.set(rgba);
      context.putImageData(pixel, 16, 8);
      // Compare with the ordinary WebCodecs snapshot path; native frame bytes may
      // be premultiplied, unlike getImageData's unpremultiplied representation.
      const reference = new VideoFrame(canvas, { timestamp: i * 1000 });
      try {
        const data = new Uint8Array(canvas.width * canvas.height * 4);
        await reference.copyTo(data, { format: 'RGBA', colorSpace: 'srgb' });
        expected.push([...data]);
      } finally {
        reference.close();
      }
      await writer.add(i * 1000, 1000);
    }
    await writer.flush();
    if (JSON.stringify(emitted) !== JSON.stringify(expected))
      throw new Error('Adaptive native-frame comparison lost an edge pixel, alpha or ABA change.');
  } finally {
    writer.dispose();
  }
}
