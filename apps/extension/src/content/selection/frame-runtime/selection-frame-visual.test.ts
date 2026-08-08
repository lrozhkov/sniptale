import { expect, it } from 'vitest';

import { getSelectionFrameVisual } from './selection-frame-visual';

it('uses canonical alpha paint without retired opacity fields', () => {
  const visual = getSelectionFrameVisual();

  expect(visual.fillColor).toBe('#00000000');
  expect(visual.strokeColor).toMatch(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i);
  expect(visual).not.toHaveProperty('opacity');
  expect(visual).not.toHaveProperty('fillOpacity');
  expect(visual).not.toHaveProperty('strokeOpacity');
});
