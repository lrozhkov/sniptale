import { afterEach, expect, it, vi } from 'vitest';

import type { EffectRuntimeRenderedComposition } from '../../../features/video/composition/effect-runtime';
import type { VideoCompositionFrame } from '../../../features/video/composition/types';
import type { VideoCompositionTimelineIndex } from '../../../features/video/composition/timeline/frame';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types';
import type { ExportSceneBackgroundCache } from './background';

const mocks = vi.hoisted(() => ({
  drawBackground: vi.fn(),
  drawOverlay: vi.fn(),
  resolveRenderPasses: vi.fn(),
}));

vi.mock('../../../features/video/composition/timeline/render', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/composition/timeline/render')>()),
  resolveVideoCompositionRenderPasses: mocks.resolveRenderPasses,
}));

vi.mock('./background', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./background')>()),
  drawExportSceneBackground: mocks.drawBackground,
}));

vi.mock('./frame-overlays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./frame-overlays')>()),
  drawExportOverlayPass: mocks.drawOverlay,
}));

afterEach(() => {
  vi.clearAllMocks();
});

it('forwards precomputed composition and effect state to the export owners', async () => {
  const { drawProjectFrame } = await import('./frame');
  const project = createEmptyVideoProject('effect-options', 100, 50);
  const backgroundCache: ExportSceneBackgroundCache = { buffer: null, key: null };
  const compositionIndex: VideoCompositionTimelineIndex = {
    clipsByTrackId: new Map(),
    tracksInRenderOrder: [],
  };
  const effectRuntimeFrames: EffectRuntimeRenderedComposition = {
    framesByTime: new Map(),
    overlayFrames: new Map(),
  };
  const frame = createFrame();
  mocks.resolveRenderPasses.mockReturnValue({ overlayFrame: frame, visualPasses: [] });

  drawProjectFrame(createContext(), project, createSettings(), 3, {}, new Map(), {
    backgroundCache,
    compositionIndex,
    effectRuntimeFrames,
  });

  expect(mocks.resolveRenderPasses).toHaveBeenCalledWith(project, 3, {
    includeSubtitles: false,
    timelineIndex: compositionIndex,
  });
  expect(mocks.drawBackground).toHaveBeenCalledWith(
    expect.objectContaining({ cache: backgroundCache })
  );
});

function createContext(): CanvasRenderingContext2D {
  const context: Partial<CanvasRenderingContext2D> = {
    clearRect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
  };
  return context as CanvasRenderingContext2D;
}

function createFrame(): VideoCompositionFrame {
  return {
    actions: [],
    camera: {
      focusPoint: { x: 50, y: 25 },
      motionBlurAmount: 0,
      regionId: null,
      scale: 1,
      viewportHeight: 50,
      viewportWidth: 100,
      viewportX: 0,
      viewportY: 0,
    },
    cursor: null,
    effectInputLayers: [],
    effectRuntimePlans: [],
    visualLayers: [],
  };
}

function createSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: false,
    format: VideoExportFormat.WEBM,
    fps: 30,
    height: 100,
    quality: VideoExportQualityPreset.BALANCED,
    width: 200,
  };
}
