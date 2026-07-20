import { expect, it } from 'vitest';

import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { renderPointOverlay } from './point';

const layout: ScenarioStageLayout = {
  canvas: { width: 720, height: 420 },
  viewport: { x: 0, y: 0, width: 720, height: 420 },
  imageRect: { x: 0, y: 0, width: 720, height: 420 },
  sourceViewport: { width: 1440, height: 840 },
};

it('renders click-ring overlays with the selected stroke width', () => {
  const markup = renderPointOverlay(
    layout,
    {
      id: 'click-selected',
      kind: 'click-ring',
      point: { x: 80, y: 96 },
    },
    true,
    '#eb5757'
  );

  expect(markup).toContain('r="18"');
  expect(markup).toContain('stroke-width="5"');
});

it('renders cursor overlays with the cursor fill and stroke width', () => {
  const markup = renderPointOverlay(
    layout,
    {
      id: 'cursor-selected',
      kind: 'cursor',
      point: { x: 90, y: 100 },
    },
    true,
    '#111827'
  );

  expect(markup).toContain('fill="#111827"');
  expect(markup).toContain('stroke-width="3"');
});
