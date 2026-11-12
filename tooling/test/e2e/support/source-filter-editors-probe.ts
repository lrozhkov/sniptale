import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Input,
  Output,
  Quality,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  WebMOutputFormat,
} from 'mediabunny';
import {
  createSourceImageFilter,
  type SourceImageFilterStack,
} from '../../../../apps/extension/src/features/image-filters/contract';
import { applySourceImageFilters } from '../../../../apps/extension/src/features/image-filters/reference';
import { createReviewPreviewRenderer } from '../../../../apps/extension/src/workflows/video-review/render-preview';
import { createPreviewRenderResources } from '../../../../apps/extension/src/workflows/video-review/preview-render-resources';
import { resolvePreviewRenderAllocation } from '../../../../apps/extension/src/workflows/video-review/preview-render-allocation';
import { createQuickEditAdvancedState } from '../../../../apps/extension/src/features/video/review/advanced/defaults';
import { createNeutralPresentationSettings } from '../../../../apps/extension/src/features/video/review/advanced/presentation';
import { writeReviewFrames } from '../../../../apps/extension/src/workflows/video-review/render-export';
import { inspectReviewMedia } from '../../../../apps/extension/src/workflows/video-review/media-index';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../../../apps/extension/src/features/video/project/mutation';
import { createNativeGpuPreviewRenderer } from '../../../../apps/extension/src/workflows/video/native-composition/gpu-preview';
import { renderNativeCompositionScene } from '../../../../apps/extension/src/workflows/video/native-composition/render-scene';
import { drawProjectFrame } from '../../../../apps/extension/src/offscreen/project-export/renderer';
import type { VideoProjectExportSettings } from '../../../../apps/extension/src/features/video/project/types';
const size = { width: 64, height: 48 },
  time = 0.2;
function surface() {
  return Object.assign(document.createElement('canvas'), size);
}
function pixels(canvas: HTMLCanvasElement) {
  return canvas.getContext('2d')!.getImageData(0, 0, size.width, size.height).data;
}
function difference(actual: Uint8ClampedArray, expected: Uint8ClampedArray) {
  let maximum = 0,
    total = 0;
  for (let p = 0; p < actual.length; p += 4)
    for (let c = 0; c < 3; c++) {
      const delta = Math.abs(actual[p + c]! - expected[p + c]!);
      maximum = Math.max(maximum, delta);
      total += delta;
    }
  return { maximum, mean: total / (size.width * size.height * 3) };
}
async function sourceFile() {
  const source = surface(),
    context = source.getContext('2d')!,
    data = context.createImageData(size.width, size.height);
  for (let y = 0; y < size.height; y++)
    for (let x = 0; x < size.width; x++)
      data.data.set(
        [40 + x * 2, 35 + y * 2, 60 + Math.floor((x + y) / 2), 255],
        (y * size.width + x) * 4
      );
  context.putImageData(data, 0, 0);
  const target = new BufferTarget(),
    output = new Output({ target, format: new WebMOutputFormat() }),
    video = new VideoSampleSource({ codec: 'vp8', quality: new Quality({ bitrate: 5_000_000 }) });
  output.addVideoTrack(video, { frameRate: 30 });
  await output.start();
  for (let i = 0; i < 12; i++) {
    const sample = new VideoSample(source, { timestamp: i / 30, duration: 1 / 30 });
    try {
      await video.add(sample);
    } finally {
      sample.close();
    }
  }
  video.close();
  await output.finalize();
  if (!target.buffer) throw new Error('Source output absent');
  return new Blob([target.buffer], { type: 'video/webm' });
}
async function decode(file: Blob) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Video track absent');
    const timeResolution = await track.getTimeResolution();
    const canvas = surface(),
      samples: Array<{ timestamp: number; duration: number }> = [];
    let captured = false;
    for await (const sample of new VideoSampleSink(track).samples())
      try {
        samples.push({ timestamp: sample.timestamp, duration: sample.duration });
        if (!captured && sample.timestamp >= time - 1e-5) {
          sample.draw(canvas.getContext('2d')!, 0, 0, size.width, size.height);
          captured = true;
        }
      } finally {
        sample.close();
      }
    if (!captured) throw new Error('Witness frame absent');
    return { canvas, samples, timeResolution };
  } finally {
    input.dispose();
  }
}
function stacks(): SourceImageFilterStack[] {
  const color = createSourceImageFilter('color', 'color');
  if (color.kind !== 'color') throw new Error('Expected color');
  color.parameters.exposure = 0.4;
  color.parameters.saturation = 0.4;
  const blur = createSourceImageFilter('blur', 'blur');
  const bloom = createSourceImageFilter('bloom', 'bloom');
  if (bloom.kind !== 'bloom') throw new Error('Expected bloom');
  bloom.parameters.threshold = 0.25;
  bloom.intensity = 0.6;
  const catalogue = (
    ['monochrome', 'sepia', 'sharpen', 'pixelate', 'vignette', 'grain'] as const
  ).map((kind) => createSourceImageFilter(kind, kind));
  return [color, blur, bloom]
    .map((filter) => ({ version: 1 as const, filters: [filter] }))
    .concat(
      [{ version: 1, filters: [color, blur, bloom] }],
      catalogue.map((filter) => ({ version: 1 as const, filters: [filter] })),
      [{ version: 1, filters: [color, blur, bloom, ...catalogue] }]
    );
}
export async function probe() {
  const file = await sourceFile(),
    decoded = await decode(file),
    source = decoded.canvas,
    inputPixels = pixels(source),
    signal = new AbortController().signal;
  const index = await inspectReviewMedia(file, signal),
    rows = [];
  for (const [indexOfStack, stack] of stacks().entries()) {
    const reference = applySourceImageFilters(
      inputPixels,
      size.width,
      size.height,
      stack,
      size,
      time
    );
    const preview = [];
    for (const backend of ['gpu', 'legacy'] as const) {
      const scene = {
        source: size,
        sourceFilters: stack,
        background: { enabled: false as const },
        zoomRegions: [],
        comments: [],
        keys: [],
        clicks: [],
      };
      const resources = createPreviewRenderResources({
        maximumManagedBytes: 1,
        maximumCanvases: 1,
      });
      const allocation = {
        describe: () =>
          resolvePreviewRenderAllocation({
            scene,
            dimensions: { canonical: size, backing: size },
            resultTime: time,
            sourceTime: time,
            sourceAllocationBytes: null,
            sourceBacking: size,
            camera: { retainedBytes: null, activeBytes: null },
            transitionBytes: null,
            previousFront: null,
            assets: {
              headerBitmap: null,
              backgroundBitmap: null,
              watermark: null,
              previousWatermarkCache: null,
            },
          }),
        replaceLimits: resources.replaceLimits.bind(resources),
      };
      const gallery = createReviewPreviewRenderer({ renderer: backend, resources, allocation });
      try {
        const prepared = await gallery.prepare(scene, { canonical: size, backing: size }, signal);
        try {
          const frame = new VideoFrame(source, { timestamp: 200000, duration: 33333 });
          try {
            const output = await gallery.render(
              prepared,
              {
                generation: prepared.generation,
                sourceTime: time,
                resultTime: time,
                source: {
                  timestamp: time,
                  backing: size,
                  videoFrame: () => frame,
                  draw: (context, x, y, width, height) =>
                    context.drawImage(source, x, y, width, height),
                },
              },
              signal
            );
            try {
              preview.push({
                editor: 'gallery',
                requested: backend,
                actual: output.renderer.backend,
                difference: difference(pixels(output.canvas), reference),
              });
            } finally {
              output.release();
            }
          } finally {
            frame.close();
          }
        } finally {
          prepared.release();
        }
      } finally {
        gallery.dispose();
        resources.dispose();
      }
      if (resources.counters.managedBytes || resources.counters.canvasCount)
        throw new Error('Gallery resources retained');
    }
    const base = createVideoProjectFromRecording({
      recordingId: 'filter-proof',
      filename: 'source.webm',
      ...size,
      duration: 0.4,
      mimeType: 'video/webm',
      size: file.size,
      hasAudio: false,
    });
    const project = applyVideoProjectMutationPatch(base, {
      clips: base.clips.map((clip) =>
        clip.type === 'VIDEO' ? { ...clip, sourceFilters: stack } : clip
      ),
    });
    const clip = project.clips.find((clip) => clip.type === 'VIDEO');
    if (!clip) throw new Error('Video clip absent');
    const media = {
      sourceWidth: size.width,
      sourceHeight: size.height,
      toVideoFrame: () => new VideoFrame(source, { timestamp: 200000, duration: 33333 }),
      draw: (
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number
      ) => context.drawImage(source, x, y, width, height),
    };
    for (const backend of ['gpu', 'legacy'] as const) {
      const canvas = surface(),
        gpu = createNativeGpuPreviewRenderer();
      try {
        const result = await renderNativeCompositionScene({
          project,
          canvas,
          sceneOutput: { ...size, includeSubtitles: false },
          stage: null,
          imageBank: {},
          currentTime: time,
          videoRefs: { current: {} },
          decodedVideoFrames: new Map([[clip.id, media]]),
          signal,
          previewRenderer: backend,
          gpuPreview: gpu,
          previewRasterSize: size,
        });
        if (!result) throw new Error('Native preview did not complete');
        try {
          preview.push({
            editor: 'native',
            requested: backend,
            actual: result.renderer?.backend ?? 'legacy',
            difference: difference(pixels(canvas), reference),
          });
        } finally {
          result.output?.release();
        }
      } finally {
        gpu.dispose();
      }
    }
    const settings: VideoProjectExportSettings = {
      format: 'WEBM',
      webmVideoCodec: 'VP9',
      fps: 30,
      width: 64,
      height: 48,
      resolution: 'SOURCE',
      quality: 'HIGH',
      scope: 'project',
      burnInSubtitles: false,
      downloadAfterExport: false,
      subtitleSidecarFormats: [],
    };
    const nativeExport = surface();
    await drawProjectFrame(
      nativeExport.getContext('2d')!,
      project,
      settings,
      time,
      {},
      new Map([[clip.id, media]]),
      { signal }
    );
    const exports = [];
    for (const format of ['mp4', 'webm'] as const) {
      const advanced = createQuickEditAdvancedState();
      advanced.presentation = createNeutralPresentationSettings();
      advanced.background = { enabled: false };
      advanced.sourceFilters = stack;
      let bytes = new Uint8Array(0);
      const receipt = await writeReviewFrames({
        file,
        index,
        advanced,
        edits: [],
        fragmentOffset: 0,
        renderSettings: { format, codec: 'vp9', frameRate: 30, quality: 'HIGH' },
        signal,
        readProjectAsset: async () => null,
        writer: {
          async writeAt(position, chunk) {
            const data = new Uint8Array(await chunk.arrayBuffer());
            if (position + data.length > bytes.length) {
              const next = new Uint8Array(position + data.length);
              next.set(bytes);
              bytes = next;
            }
            bytes.set(data, position);
          },
        },
      });
      const result = await decode(new Blob([bytes]));
      exports.push({
        format,
        bytes: bytes.length,
        receipt: { duration: receipt.resultDuration, videoReencoded: receipt.videoReencoded },
        difference: difference(pixels(result.canvas), reference),
        samples: result.samples,
        timeResolution: result.timeResolution,
      });
    }
    rows.push({
      index: indexOfStack,
      preview,
      nativeExport: difference(pixels(nativeExport), reference),
      exports,
    });
  }
  return { sourceSamples: decoded.samples, rows };
}
