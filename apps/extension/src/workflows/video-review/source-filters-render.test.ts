// @vitest-environment jsdom
import { resolvePreviewRenderAllocation } from './preview-render-allocation';
import type { PreviewScene } from './preview-scene';
import { createReviewPreviewRenderer } from './render-preview';
import { createPreviewRenderResources } from './preview-render-resources';
import { prepareReviewExportSourceSampling } from './export-source-sampling';
import { vi } from 'vitest';
import type { ExportEnhancer } from '../../features/video/composition/export-enhancement/enhancer';
import { expect, it } from 'vitest';
import {
  createSourceImageFilter,
  type SourceImageFilterStack,
} from '../../features/image-filters/contract';
import { computeQuickEditSceneLayout } from '../../features/video/review/advanced/scene';
import { drawReviewSceneFrame } from './scene-frame';
import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../features/video/project/mutation';
import { resolveVideoCompositionFrame } from '../../features/video/composition/timeline/frame';
import { drawVideoLayer } from '../../features/video/composition/draw/video';
function source() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'rgb(32,64,96)';
  context.fillRect(0, 0, 64, 32);
  return canvas;
}
function stack(): SourceImageFilterStack {
  const color = createSourceImageFilter('color', 'color');
  if (color.kind !== 'color') throw new Error('Expected color.');
  color.parameters.brightness = 2;
  return { version: 1 as const, filters: [color] };
}
it('filters Gallery source pixels before the independent background and preserves the source', () => {
  const input = source(),
    canvas = document.createElement('canvas');
  canvas.width = 72;
  canvas.height = 40;
  const context = canvas.getContext('2d')!;
  const background = {
    enabled: true as const,
    type: 'solid' as const,
    color: '#102030ff',
    zoomBehavior: 'window' as const,
    layout: { padding: 4, cornerRadius: 0 },
  };
  const layout = computeQuickEditSceneLayout({
    source: { width: 64, height: 32 },
    output: { width: 72, height: 40 },
    background,
    camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
  });
  drawReviewSceneFrame(context, {
    canvas,
    layout,
    sourceFilters: stack(),
    sourceSize: { width: 64, height: 32 },
    background,
    image: null,
    sample: {
      draw(target, x, y, width, height) {
        target.drawImage(input, x, y, width, height);
      },
    },
  });
  expect([...context.getImageData(36, 20, 1, 1).data]).toEqual([64, 128, 192, 255]);
  expect([...context.getImageData(0, 0, 1, 1).data]).toEqual([16, 32, 48, 255]);
  expect([...input.getContext('2d')!.getImageData(20, 10, 1, 1).data]).toEqual([32, 64, 96, 255]);
});
it('filters Native source pixels through the real Canvas media draw without changing the decoded source', () => {
  const input = source(),
    canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  let project = createVideoProjectFromRecording({
    recordingId: 'source-filter-render',
    filename: 'source.webm',
    width: 64,
    height: 32,
    duration: 3,
    mimeType: 'video/webm',
    size: 1,
    hasAudio: false,
  });
  project = applyVideoProjectMutationPatch(project, {
    clips: project.clips.map((clip) =>
      clip.type === 'VIDEO' ? { ...clip, sourceFilters: stack() } : clip
    ),
  });
  const frame = resolveVideoCompositionFrame(project, 1),
    layer = frame.visualLayers.find((item) => item.kind === 'video');
  if (layer?.kind !== 'video') throw new Error('Missing source layer');
  const media = {
    sourceWidth: 64,
    sourceHeight: 32,
    draw(target: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
      target.drawImage(input, x, y, width, height);
    },
  };
  drawVideoLayer(
    canvas.getContext('2d')!,
    layer,
    { x: 0, y: 0, width: 64, height: 32 },
    1,
    new Map([[layer.clipId, media]]),
    {}
  );
  expect([...canvas.getContext('2d')!.getImageData(32, 16, 1, 1).data]).toEqual([
    64, 128, 192, 255,
  ]);
  expect([...input.getContext('2d')!.getImageData(32, 16, 1, 1).data]).toEqual([32, 64, 96, 255]);
});

it.each(['neutral', 'active'] as const)(
  'uses full prepared source support only for the %s source stack',
  async (kind) => {
    const sourceFilters = stack();
    if (kind === 'neutral') {
      const color = sourceFilters.filters[0];
      if (color?.kind !== 'color') throw new Error('Expected color');
      color.parameters.brightness = 1;
    }
    const input = source();
    const enhancer = {
      withEnhancedRegion: vi.fn<ExportEnhancer['withEnhancedRegion']>(async (request, consume) => {
        await consume({
          image: input,
          sourceRect: { x: 0, y: 0, width: 64, height: 32 },
          destination: { x: 0, y: 0, ...request.targetSize },
        });
        return { applied: true, tileCount: 1 };
      }),
    };
    const prepared = await prepareReviewExportSourceSampling({
      enhancer,
      scene: {
        sourceSize: { width: 64, height: 32 },
        sourceFilters,
        background: { enabled: false },
        zoomRegions: [],
      },
      output: { width: 128, height: 64 },
      sample: {
        timestamp: 0.5,
        draw(context, x, y, width, height) {
          context.drawImage(input, x, y, width, height);
        },
      },
      sourceTime: 0.5,
      resultTime: 1,
      signal: new AbortController().signal,
      camera: { scale: 2, centerX: 0.5, centerY: 0.5 },
    });
    if (!prepared) throw new Error('Expected magnified source');
    try {
      const request = enhancer.withEnhancedRegion.mock.calls[0]![0];
      if (kind === 'active') expect(request.roi).toEqual({ x: 0, y: 0, width: 64, height: 32 });
      else expect(request.roi.width).toBeLessThan(64);
      expect(prepared.sampling.sourceTime).toBe(0.5);
      expect(prepared.sampling.passTime).toBe(1);
    } finally {
      prepared.dispose();
    }
  }
);

it.each([
  { enhanced: false, blur: false },
  { enhanced: true, blur: false },
  { enhanced: false, blur: true },
  { enhanced: true, blur: true },
])(
  'admits filtered Gallery pixels through the managed allocation ledger ($enhanced, blur: $blur)',
  async ({ enhanced, blur }) => {
    const input = source(),
      size = { width: 64, height: 32 };
    const resources = createPreviewRenderResources({ maximumManagedBytes: 1, maximumCanvases: 1 });
    const sourceFilters = stack();
    if (blur) sourceFilters.filters.push(createSourceImageFilter('blur', 'blur'));
    const scene: PreviewScene = {
      source: size,
      sourceFilters,
      background: { enabled: false },
      zoomRegions: [],
      comments: [],
      keys: [],
      clicks: [],
    };
    const allocation = {
      describe: () =>
        resolvePreviewRenderAllocation({
          scene,
          dimensions: { canonical: size, backing: size },
          resultTime: 1,
          sourceTime: 1,
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
    const renderer = createReviewPreviewRenderer({ renderer: 'legacy', resources, allocation });
    try {
      const prepared = await renderer.prepare(
        scene,
        { canonical: size, backing: size },
        new AbortController().signal
      );
      try {
        const exportEnhancer = enhanced
          ? {
              dispose: async () => {},
              withEnhancedRegion: vi.fn<ExportEnhancer['withEnhancedRegion']>(
                async (request, consume) => {
                  await consume({
                    image: input,
                    sourceRect: { x: 0, y: 0, width: 64, height: 32 },
                    destination: { x: 0, y: 0, ...request.targetSize },
                  });
                  return { applied: true, tileCount: 1 };
                }
              ),
            }
          : undefined;
        const output = await renderer.render(prepared, {
          ...(exportEnhancer
            ? { exportEnhancer, cameraTransform: { scale: 2, centerX: 0.5, centerY: 0.5 } }
            : {}),
          generation: prepared.generation,
          sourceTime: 1,
          resultTime: 1,
          source: {
            timestamp: 1,
            backing: size,
            draw(context, x, y, width, height) {
              context.drawImage(input, x, y, width, height);
            },
          },
        });
        try {
          expect([...output.context.getImageData(32, 16, 1, 1).data]).toEqual([64, 128, 192, 255]);
        } finally {
          output.release();
        }
      } finally {
        prepared.release();
      }
    } finally {
      renderer.dispose();
      resources.dispose();
    }
    expect(resources.counters.managedBytes).toBe(0);
    expect(resources.counters.canvasCount).toBe(0);
  }
);
