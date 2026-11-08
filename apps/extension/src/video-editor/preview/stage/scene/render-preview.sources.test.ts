// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import { renderPreviewScene } from './render-preview';
import type { PreviewSceneRenderInput } from './types';
it('Canvas fallback draws each exact exposure source without HTML readiness or recapture', async () => {
  const clip = createVideoClip({ id: 'source', duration: 5, sourceDuration: 5 });
  const project = createProject([clip]);
  project.width = 80;
  project.height = 40;
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 5,
      scale: 2,
      zoomInDuration: 5,
      motionBlurAmount: 1,
    },
  ];
  const passes = resolveVideoCompositionRenderPasses(project, 1);
  expect(passes.visualPasses.length).toBeGreaterThan(1);
  const canvas = document.createElement('canvas');
  Object.defineProperties(canvas, { clientWidth: { value: 80 }, clientHeight: { value: 40 } });
  const makeSource = () => ({
    sourceWidth: 80,
    sourceHeight: 40,
    draw: vi.fn(),
    toVideoFrame: vi.fn(() => {
      throw new Error('Exact source must not be recaptured');
    }),
  });
  const sources = new Map<object, ReturnType<typeof makeSource>>(
    [passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)].map((frame) => [
      frame,
      makeSource(),
    ])
  );
  const release = vi.fn();
  const sourceFrames = {
    nominal: new Map([[clip.id, sources.get(passes.overlayFrame)!]]),
    intervals: new Map(),
    media: (frame: Pick<typeof passes.overlayFrame, 'visualLayers'>) => {
      const source = sources.get(frame);
      if (!source) throw new Error('Missing pose');
      return new Map([[clip.id, source]]);
    },
    release,
  };
  const input: PreviewSceneRenderInput = {
    project,
    currentTime: 1,
    canvas,
    stage: null,
    videoRefs: { current: {} },
    imageBank: {},
    previewRenderer: 'gpu',
    gpuPreview: { render: vi.fn(async () => undefined), dispose: vi.fn() },
    preparedFrame: {
      passes,
      rasterScale: 1,
      compositionTime: 1,
      sourcePresentation: new Map(),
      sourceFrames,
      gpuIsolated: false,
    },
  };
  await expect(renderPreviewScene(input)).resolves.toMatchObject({
    time: 1,
    renderer: { backend: 'legacy' },
  });
  for (const pass of passes.visualPasses) expect(sources.get(pass.frame)!.draw).toHaveBeenCalled();
  for (const source of sources.values()) expect(source.toVideoFrame).not.toHaveBeenCalled();
  expect(release).not.toHaveBeenCalled();
});
