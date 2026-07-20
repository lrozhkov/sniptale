import { expect, it } from 'vitest';

import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { renderFocusRectOverlay } from './focus-rect';

const layout: ScenarioStageLayout = {
  canvas: { width: 720, height: 420 },
  viewport: { x: 0, y: 0, width: 720, height: 420 },
  imageRect: { x: 0, y: 0, width: 720, height: 420 },
  sourceViewport: { width: 1440, height: 840 },
};

it('renders focus overlays and only adds the dashed selection style when selected', () => {
  const unselectedMarkup = renderFocusRectOverlay(
    layout,
    {
      id: 'focus-plain',
      kind: 'focus-rect',
      rect: { x: 12, y: 16, width: 120, height: 72 },
    },
    false,
    '#0f8f8a'
  );
  const selectedMarkup = renderFocusRectOverlay(
    layout,
    {
      id: 'focus-selected',
      kind: 'focus-rect',
      rect: { x: 12, y: 16, width: 120, height: 72 },
    },
    true,
    '#0f8f8a'
  );

  expect(unselectedMarkup).not.toContain('stroke-dasharray');
  expect(selectedMarkup).toContain('stroke-dasharray="10 6"');
});
