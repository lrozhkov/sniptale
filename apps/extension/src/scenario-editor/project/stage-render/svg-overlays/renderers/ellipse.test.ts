import { expect, it } from 'vitest';

import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { renderEllipseOverlay } from './ellipse';

const layout: ScenarioStageLayout = {
  canvas: { width: 720, height: 420 },
  viewport: { x: 0, y: 0, width: 720, height: 420 },
  imageRect: { x: 0, y: 0, width: 720, height: 420 },
  sourceViewport: { width: 1440, height: 840 },
};

it('renders ellipse overlays with projected geometry', () => {
  const markup = renderEllipseOverlay(
    layout,
    {
      id: 'ellipse-selected',
      kind: 'ellipse',
      rect: { x: 32, y: 32, width: 110, height: 90 },
      strokeColor: '#0f8f8a',
      fillColor: 'rgba(15,143,138,0.12)',
      strokeWidth: 4,
    },
    true,
    '#0f8f8a'
  );

  expect(markup).toContain('<ellipse');
  expect(markup).toContain('stroke-width="5"');
});
