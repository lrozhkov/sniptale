import { expect, it } from 'vitest';

import { createScenarioCaptureStep } from '../project/public';
import { type ScenarioCaptureStep } from '../contracts/types/project';
import {
  createDefaultScenarioViewportTransform,
  resolveScenarioStageLayout,
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
} from './layout';

it('keeps the stable public layout facade for editor rendering', () => {
  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
    page: {
      title: null,
      url: null,
      viewport: { x: 0, y: 0, width: 1440, height: 900 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  });

  const layout = resolveScenarioStageLayout(
    {
      ...step,
      viewportTransform: { x: 80, y: 40, width: 560, height: 320 },
      imageTransform: { scale: 1.25, x: 12, y: -18 },
    },
    { width: 1440, height: 900 }
  );

  expect(layout.canvas).toEqual({
    width: SCENARIO_STAGE_WIDTH,
    height: SCENARIO_STAGE_HEIGHT,
  });
  expect(layout.viewport).toEqual({ x: 80, y: 40, width: 560, height: 320 });
  expect(layout.imageRect).toEqual({
    x: 52,
    y: -18,
    width: 640,
    height: 400,
  });
});

it('falls back to the canonical default viewport when legacy steps omit it', () => {
  const step = createScenarioCaptureStep({ assetId: 'asset-1' });
  const legacyStep = { ...step } as unknown as ScenarioCaptureStep;
  const legacyStepRecord = legacyStep as unknown as Record<string, unknown>;

  Reflect.deleteProperty(legacyStepRecord, 'viewportTransform');

  expect(resolveScenarioStageLayout(legacyStep, { width: 1440, height: 900 }).viewport).toEqual(
    createDefaultScenarioViewportTransform()
  );
});
