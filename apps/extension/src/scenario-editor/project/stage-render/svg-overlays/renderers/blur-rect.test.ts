import { expect, it } from 'vitest';

import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { renderBlurRectOverlay } from './blur-rect';

const layout: ScenarioStageLayout = {
  canvas: { width: 720, height: 420 },
  viewport: { x: 0, y: 0, width: 720, height: 420 },
  imageRect: { x: 0, y: 0, width: 720, height: 420 },
  sourceViewport: { width: 1440, height: 840 },
};

const assetDataUrl = 'data:image/png;base64,cGl4ZWw=';

it('renders blur overlays with blur and clip ids derived from the overlay id', () => {
  const markup = renderBlurRectOverlay(
    assetDataUrl,
    layout,
    {
      id: 'blur-selected',
      kind: 'blur-rect',
      rect: { x: 60, y: 70, width: 130, height: 90 },
      blurSettings: { amount: 8, blurType: 'gaussian', showBorder: false },
    },
    true,
    '#475569'
  );

  expect(markup).toContain('feGaussianBlur');
  expect(markup).toContain('sniptaleScenarioBlur-blur-selected');
  expect(markup).toContain('stroke-width="3"');
});

it('clips scenario blur inside configured border styling', () => {
  const markup = renderBlurRectOverlay(
    assetDataUrl,
    layout,
    {
      id: 'blur-bordered',
      kind: 'blur-rect',
      rect: { x: 60, y: 70, width: 130, height: 90 },
      blurSettings: {
        amount: 8,
        blurType: 'gaussian',
        radius: 10,
        shadow: 0,
        showBorder: true,
        strokeColor: '#112233',
        strokeOpacity: 0.6,
        strokeStyle: 'dash-dot',
        strokeWidth: 6,
      },
    },
    false,
    '#475569'
  );

  expect(markup).toContain('x="33"');
  expect(markup).toContain('width="59"');
  expect(markup).toContain('rx="7"');
  expect(markup).toContain('stroke="#112233"');
  expect(markup).toContain('stroke-opacity="0.6"');
  expect(markup).toContain('stroke-dasharray="18 9.6 6 11.4"');
});

it('renders long-dash blur frame styling', () => {
  const markup = renderBlurRectOverlay(
    assetDataUrl,
    layout,
    {
      id: 'blur-long-dash',
      kind: 'blur-rect',
      rect: { x: 60, y: 70, width: 130, height: 90 },
      blurSettings: {
        amount: 8,
        blurType: 'gaussian',
        showBorder: true,
        strokeStyle: 'long-dash',
        strokeWidth: 6,
      },
    },
    false,
    '#475569'
  );

  expect(markup).toContain('stroke-dasharray="30 10.8"');
});
