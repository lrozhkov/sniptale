import { expect, it } from 'vitest';

import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { renderArrowOverlay } from './arrow';

const layout: ScenarioStageLayout = {
  canvas: { width: 720, height: 420 },
  viewport: { x: 0, y: 0, width: 720, height: 420 },
  imageRect: { x: 0, y: 0, width: 720, height: 420 },
  sourceViewport: { width: 1440, height: 840 },
};

it('renders arrow overlays with the selected stroke adjustment', () => {
  const markup = renderArrowOverlay(
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

  expect(markup).toContain('marker-end="url(#sniptaleScenarioArrowHead)"');
  expect(markup).toContain('stroke-width="7"');
});

it('omits the arrow marker when the projected segment is too short to orient safely', () => {
  const markup = renderArrowOverlay(
    layout,
    {
      id: 'arrow-short',
      kind: 'arrow',
      start: { x: 20, y: 24 },
      end: { x: 22, y: 26 },
      color: '#0f8f8a',
      strokeWidth: 6,
    },
    false,
    '#0f8f8a'
  );

  expect(markup).not.toContain('marker-end="url(#sniptaleScenarioArrowHead)"');
  expect(markup).toContain('stroke-width="6"');
});
