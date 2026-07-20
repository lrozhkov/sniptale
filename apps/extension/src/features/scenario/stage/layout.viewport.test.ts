import { expect, it } from 'vitest';

import { createScenarioCaptureStep } from '../project/public';
import {
  createDefaultScenarioViewportTransform,
  normalizeScenarioViewport,
  resolveScenarioSourceViewport,
  resolveScenarioViewport,
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
} from './layout.viewport.ts';

it('provides the canonical default scenario viewport transform', () => {
  expect(createDefaultScenarioViewportTransform()).toEqual({
    x: 0,
    y: 0,
    width: SCENARIO_STAGE_WIDTH,
    height: SCENARIO_STAGE_HEIGHT,
  });
});

it('normalizes editor viewport bounds inside the fixed canvas', () => {
  expect(
    normalizeScenarioViewport(
      { x: -40, y: 480, width: 920, height: 20 },
      { width: 720, height: 420 }
    )
  ).toEqual({
    x: 0,
    y: 300,
    width: 720,
    height: 120,
  });
});

it('resolves render viewports for export and original modes', () => {
  const exportViewport = resolveScenarioViewport({
    asset: { width: 1440, height: 900 },
    canvas: { width: 720, height: 420 },
    renderMode: 'export',
    stepViewportTransform: { x: 80, y: 40, width: 560, height: 320 },
  });
  const originalViewport = resolveScenarioViewport({
    asset: { width: 2880, height: 1800 },
    canvas: { width: 2880, height: 1800 },
    renderMode: 'original',
    stepViewportTransform: { x: 80, y: 40, width: 560, height: 320 },
  });

  expect(exportViewport.normalizedViewport).toEqual({
    x: 80,
    y: 40,
    width: 560,
    height: 320,
  });
  expect(exportViewport.viewport.width).toBeGreaterThan(560);
  expect(exportViewport.viewport.height).toBeGreaterThan(320);
  expect(originalViewport.viewport).toEqual({
    x: 0,
    y: 0,
    width: 2880,
    height: 1800,
  });
});

it('falls back to asset dimensions when source viewport metadata is missing', () => {
  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
    page: {
      title: null,
      url: null,
      viewport: { x: 0, y: 0, width: 0, height: 0 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  });

  expect(resolveScenarioSourceViewport(step, { width: 800, height: 400 })).toEqual({
    width: 800,
    height: 400,
  });
});
