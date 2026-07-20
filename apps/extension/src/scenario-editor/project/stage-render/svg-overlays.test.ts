/* the branch-coverage fixture intentionally exercises all overlay kinds in one deterministic table */
import { expect, it } from 'vitest';

import { renderScenarioOverlaySvg } from './svg-overlays';
import {
  renderArrowOverlay,
  renderBlurRectOverlay,
  renderEllipseOverlay,
  renderFocusRectOverlay,
  renderPointOverlay,
  renderRectangleOverlay,
} from './svg-overlays/renderers';
import type { ScenarioStageLayout } from '../../../features/scenario/stage/layout';

const layout: ScenarioStageLayout = {
  canvas: { width: 720, height: 420 },
  viewport: { x: 0, y: 0, width: 720, height: 420 },
  imageRect: { x: 0, y: 0, width: 720, height: 420 },
  sourceViewport: { width: 1440, height: 840 },
};

const assetDataUrl = 'data:image/png;base64,cGl4ZWw=';

it('renders focus, click, and cursor overlays through the canonical svg branch', () => {
  const focusMarkup = renderScenarioOverlaySvg({
    assetDataUrl,
    layout,
    selected: true,
    overlay: {
      id: 'focus',
      kind: 'focus-rect',
      rect: { x: 20, y: 24, width: 100, height: 64 },
    },
  });
  const clickMarkup = renderScenarioOverlaySvg({
    assetDataUrl,
    layout,
    selected: false,
    overlay: {
      id: 'click',
      kind: 'click-ring',
      point: { x: 40, y: 48 },
    },
  });
  const cursorMarkup = renderScenarioOverlaySvg({
    assetDataUrl,
    layout,
    selected: false,
    overlay: {
      id: 'cursor',
      kind: 'cursor',
      point: { x: 44, y: 52 },
    },
  });

  expect(focusMarkup).toContain('stroke-dasharray');
  expect(clickMarkup).toContain('<circle');
  expect(cursorMarkup).toContain('#111827');
});

it('renders arrow and shape overlays through the canonical svg branch', () => {
  const arrowMarkup = renderScenarioOverlaySvg({
    assetDataUrl,
    layout,
    selected: false,
    overlay: {
      id: 'arrow',
      kind: 'arrow',
      start: { x: 10, y: 10 },
      end: { x: 120, y: 80 },
      color: '#0f8f8a',
      strokeWidth: 6,
    },
  });
  const rectangleMarkup = renderScenarioOverlaySvg({
    assetDataUrl,
    layout,
    selected: false,
    overlay: {
      id: 'rect',
      kind: 'rectangle',
      rect: { x: 30, y: 30, width: 100, height: 80 },
      strokeColor: '#0f8f8a',
      fillColor: 'rgba(15,143,138,0.12)',
      strokeWidth: 4,
    },
  });
  const ellipseMarkup = renderScenarioOverlaySvg({
    assetDataUrl,
    layout,
    selected: false,
    overlay: {
      id: 'ellipse',
      kind: 'ellipse',
      rect: { x: 32, y: 32, width: 110, height: 90 },
      strokeColor: '#0f8f8a',
      fillColor: 'rgba(15,143,138,0.12)',
      strokeWidth: 4,
    },
  });

  expect(arrowMarkup).toContain('marker-end');
  expect(rectangleMarkup).toContain('fill="rgba(15,143,138,0.12)"');
  expect(ellipseMarkup).toContain('<ellipse');
});

it('renders text and blur overlays through the canonical svg branch', () => {
  const textMarkup = renderScenarioOverlaySvg({
    assetDataUrl,
    layout,
    selected: false,
    overlay: {
      id: 'text',
      kind: 'text',
      point: { x: 50, y: 60 },
      text: 'Export',
      color: '#111827',
      fontSize: 24,
      fontFamily: 'system-ui',
      fontWeight: 600,
    },
  });
  const blurMarkup = renderScenarioOverlaySvg({
    assetDataUrl,
    layout,
    selected: true,
    overlay: {
      id: 'blur',
      kind: 'blur-rect',
      rect: { x: 60, y: 70, width: 130, height: 90 },
      blurSettings: { amount: 8, blurType: 'gaussian', showBorder: false },
    },
  });

  expect(textMarkup).toContain('Export');
  expect(blurMarkup).toContain('feGaussianBlur');
});

it('renders selected-state branches for focus, click, and arrow overlays', () => {
  const focusMarkup = renderFocusRectOverlay(
    layout,
    {
      id: 'focus-plain',
      kind: 'focus-rect',
      rect: { x: 12, y: 16, width: 120, height: 72 },
    },
    false,
    '#0f8f8a'
  );
  const clickMarkup = renderPointOverlay(
    layout,
    {
      id: 'click-selected',
      kind: 'click-ring',
      point: { x: 80, y: 96 },
    },
    true,
    '#eb5757'
  );
  const arrowMarkup = renderArrowOverlay(
    layout,
    {
      id: 'arrow-selected',
      kind: 'arrow',
      start: { x: 20, y: 24 },
      end: { x: 200, y: 120 },
      color: '#0f8f8a',
      strokeWidth: 6,
    },
    true,
    '#0f8f8a'
  );

  expect(focusMarkup).not.toContain('stroke-dasharray');
  expect(clickMarkup).toContain('stroke-width="5"');
  expect(arrowMarkup).toContain('stroke-width="7"');
});

it('renders selected-state branches for rectangle and ellipse overlays', () => {
  const rectangleMarkup = renderRectangleOverlay(
    layout,
    {
      id: 'rect-selected',
      kind: 'rectangle',
      rect: { x: 28, y: 32, width: 110, height: 84 },
      strokeColor: '#0f8f8a',
      fillColor: 'rgba(15,143,138,0.12)',
      strokeWidth: 4,
    },
    true,
    '#0f8f8a'
  );
  const ellipseMarkup = renderEllipseOverlay(
    layout,
    {
      id: 'ellipse-selected',
      kind: 'ellipse',
      rect: { x: 30, y: 36, width: 114, height: 90 },
      strokeColor: '#0f8f8a',
      fillColor: 'rgba(15,143,138,0.12)',
      strokeWidth: 4,
    },
    true,
    '#0f8f8a'
  );

  expect(rectangleMarkup).toContain('stroke-width="5"');
  expect(ellipseMarkup).toContain('stroke-width="5"');
});

it('renders cursor and blur branches for the remaining renderer states', () => {
  const cursorMarkup = renderPointOverlay(
    layout,
    {
      id: 'cursor-selected',
      kind: 'cursor',
      point: { x: 90, y: 100 },
    },
    true,
    '#111827'
  );
  const blurMarkup = renderBlurRectOverlay(
    assetDataUrl,
    layout,
    {
      id: 'blur-unselected',
      kind: 'blur-rect',
      rect: { x: 40, y: 44, width: 120, height: 88 },
      blurSettings: { amount: 10, blurType: 'gaussian', showBorder: false },
    },
    false,
    '#475569'
  );

  expect(cursorMarkup).toContain('stroke-width="3"');
  expect(blurMarkup).not.toContain('stroke-width="2"');
});
