import { expect, it } from 'vitest';

import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { renderRectangleOverlay } from './rectangle';

const layout: ScenarioStageLayout = {
  canvas: { width: 720, height: 420 },
  viewport: { x: 0, y: 0, width: 720, height: 420 },
  imageRect: { x: 0, y: 0, width: 720, height: 420 },
  sourceViewport: { width: 1440, height: 840 },
};

it('renders rectangle overlays with projected bounds and selected stroke width', () => {
  const markup = renderRectangleOverlay(
    layout,
    {
      id: 'rect-selected',
      kind: 'rectangle',
      rect: { x: 28, y: 32, width: 110, height: 84 },
      strokeColor: '#0f8f8a',
      fillColor: 'rgba(15,143,138,0.12)" onload="alert(1)',
      strokeWidth: 4,
    },
    true,
    '#0f8f8a" onload="alert(1)'
  );

  expect(markup).toContain('fill="rgba(15,143,138,0.12)&quot; onload=&quot;alert(1)"');
  expect(markup).toContain('stroke="#0f8f8a&quot; onload=&quot;alert(1)"');
  expect(markup).toContain('stroke-width="5"');
});
