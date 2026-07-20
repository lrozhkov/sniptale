/* scenario-stage tests keep layout and SVG branch coverage in one deterministic suite */
import { expect, it } from 'vitest';

import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { buildScenarioCaptureSvgMarkup } from './svg';
import {
  resolveScenarioStageLayout,
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
} from '../../../features/scenario/stage/layout';

it('resolves viewport-aware image placement inside the fixed canvas', () => {
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
  expect(layout.imageRect.width).toBeGreaterThan(layout.viewport.width);
  expect(layout.imageRect.y).toBeLessThan(layout.viewport.y);
});

it('clamps oversized viewport transforms back into the fixed editor canvas', () => {
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

  const layout = resolveScenarioStageLayout(
    {
      ...step,
      viewportTransform: { x: -40, y: -30, width: 920, height: 520 },
    },
    { width: 800, height: 400 }
  );

  expect(layout.viewport).toEqual({ x: 0, y: 0, width: 720, height: 420 });
  expect(layout.sourceViewport).toEqual({ width: 800, height: 400 });
});

it('clamps positive viewport offsets that overflow the canvas bounds', () => {
  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
  });

  const layout = resolveScenarioStageLayout(
    {
      ...step,
      viewportTransform: { x: 640, y: 360, width: 220, height: 180 },
    },
    { width: 1440, height: 900 }
  );

  expect(layout.viewport).toEqual({ x: 500, y: 240, width: 220, height: 180 });
});

it('falls back to the default viewport transform for legacy capture steps', () => {
  const legacyStep = {
    ...createScenarioCaptureStep({
      assetId: 'asset-1',
    }),
    viewportTransform: undefined,
  } as unknown as ReturnType<typeof createScenarioCaptureStep>;

  const layout = resolveScenarioStageLayout(legacyStep, { width: 1440, height: 900 });

  expect(layout.viewport).toEqual({ x: 0, y: 0, width: 720, height: 420 });
});

it('expands focused editor viewports into a centered export composition', () => {
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
    { width: 1440, height: 900 },
    undefined,
    'export'
  );

  expect(layout.viewport.width).toBeGreaterThan(560);
  expect(layout.viewport.height).toBeGreaterThan(320);
  expect(layout.viewport.x).toBeGreaterThan(0);
  expect(layout.viewport.y).toBeGreaterThan(0);
  expect(layout.imageRect.width).toBeGreaterThan(layout.viewport.width);
});

it('can resolve a full-size original-image layout for annotated previews', () => {
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
    { width: 2880, height: 1800 },
    { width: 2880, height: 1800 },
    'original'
  );

  expect(layout.viewport).toEqual({ x: 0, y: 0, width: 2880, height: 1800 });
  expect(layout.imageRect).toEqual({ x: 0, y: 0, width: 2880, height: 1800 });
  expect(layout.sourceViewport).toEqual({ width: 1440, height: 900 });
});

it('renders canonical svg markup for capture overlays and missing assets', () => {
  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
    overlays: [
      {
        id: 'overlay-1',
        kind: 'blur-rect',
        rect: { x: 120, y: 80, width: 160, height: 120 },
        blurSettings: { amount: 10, blurType: 'gaussian', showBorder: false },
      },
      {
        id: 'overlay-2',
        kind: 'text',
        point: { x: 140, y: 96 },
        text: 'Export',
        color: '#111827',
        fontSize: 22,
        fontFamily: 'system-ui',
        fontWeight: 600,
      },
    ],
  });

  const markup = buildScenarioCaptureSvgMarkup({
    step,
    assetDataUrl: 'data:image/png;base64,cGl4ZWw=',
    assetDimensions: { width: 1440, height: 900 },
    backgroundColor: '" onload="alert(1)',
    selectedOverlayId: 'overlay-1',
  });
  const missing = buildScenarioCaptureSvgMarkup({
    step,
    missingLabel: 'Missing asset',
  });

  expect(markup).toContain('<svg');
  expect(markup).toContain('clipPath');
  expect(markup).toContain('feGaussianBlur');
  expect(markup).toContain('Export');
  expect(markup).toContain('fill="&quot; onload=&quot;alert(1)"');
  expect(markup).toContain('data:image/png;base64,cGl4ZWw=');
  expect(missing).toContain('Missing asset');
});

it('omits overlays when the capture step is rendered as an asset preview', () => {
  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
    overlays: [
      {
        id: 'overlay-1',
        kind: 'blur-rect',
        rect: { x: 120, y: 80, width: 160, height: 120 },
        blurSettings: { amount: 10, blurType: 'gaussian', showBorder: false },
      },
    ],
  });

  const overlaysHidden = buildScenarioCaptureSvgMarkup({
    step: {
      ...step,
      annotationRenderMode: 'asset',
    },
    assetDataUrl: 'data:image/png;base64,cGl4ZWw=',
    assetDimensions: { width: 1440, height: 900 },
  });

  expect(overlaysHidden).not.toContain('feGaussianBlur');
});

it('escapes missing asset labels in the fallback svg branch', () => {
  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
  });

  const escapedMissing = buildScenarioCaptureSvgMarkup({
    step,
    missingLabel: 'Missing & <asset>',
  });

  expect(escapedMissing).toContain('Missing &amp; &lt;asset&gt;');
});
