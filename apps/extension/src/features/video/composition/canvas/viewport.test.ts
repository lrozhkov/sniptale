// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { resolvePreviewStageViewportMetrics } from './viewport';
import { createEmptyVideoProject } from '../../project/factories/creation';
import {
  resolvePreviewEffectRuntimeRasterScale,
  resolvePreviewCompositionFrameSize,
  resolvePreviewSceneCanvasLayout,
} from '../../../../workflows/video/native-composition/canvas';

it('keeps interaction and shared rendering on the same contained viewport', () => {
  const project = createEmptyVideoProject('Viewport', 800, 600);
  const stage = document.createElement('div');
  Object.defineProperty(stage, 'getBoundingClientRect', {
    value: () => ({ width: 1280, height: 560, left: 25, top: 30 }),
  });
  const canvas = document.createElement('canvas');
  const interaction = resolvePreviewStageViewportMetrics(stage, project);
  const rendering = resolvePreviewSceneCanvasLayout({
    canvas,
    project,
    stage,
    previewRasterSize: { width: 1280, height: 560 },
  });
  expect(rendering.bounds).toEqual(interaction.bounds);
  expect(rendering.viewport).toEqual(interaction.viewport);
  expect(interaction.viewport).toEqual({
    offsetX: (1280 - 800 * (560 / 600)) / 2,
    offsetY: 0,
    width: 800 * (560 / 600),
    height: 560,
    scale: 560 / 600,
  });
});

it('preserves the existing SOURCE crop while preset output contains the full project', () => {
  const project = createEmptyVideoProject('Odd source', 801, 601);
  const canvas = document.createElement('canvas');
  const raster = { width: 800, height: 600 };
  const base = { canvas, project, stage: null, previewRasterSize: raster };
  const cropped = resolvePreviewSceneCanvasLayout({
    ...base,
    sceneOutput: { ...raster, resolution: 'SOURCE' },
  });
  expect(cropped.viewport).toEqual({ offsetX: 0, offsetY: 0, width: 801, height: 601, scale: 1 });
  const contained = resolvePreviewSceneCanvasLayout({
    ...base,
    sceneOutput: { ...raster, resolution: '1080P' },
  });
  expect(contained.viewport.scale).toBe(600 / 601);
  expect(contained.viewport.width).toBeCloseTo((801 * 600) / 601);
  expect(contained.backing).toEqual(raster);
});

it('keeps the source pixel grid inside a one-pixel output crop', () => {
  const project = createEmptyVideoProject('Odd source', 801, 601);
  const canvas = document.createElement('canvas');
  const output = { width: 800, height: 600, resolution: 'SOURCE' as const };
  expect(
    resolvePreviewEffectRuntimeRasterScale({
      canvas,
      project,
      stage: null,
      previewRasterSize: output,
      sceneOutput: output,
    })
  ).toBe(1);
  expect(
    resolvePreviewCompositionFrameSize({
      canvas,
      project,
      stage: null,
      previewRasterSize: output,
      sceneOutput: output,
    })
  ).toEqual({ width: 801, height: 601 });
});
