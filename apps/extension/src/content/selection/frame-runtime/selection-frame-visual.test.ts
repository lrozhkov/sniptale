import { expect, it } from 'vitest';

import { getSelectionFrameVisual } from './selection-frame-visual';

it('uses canonical alpha paint without retired opacity fields', () => {
  const visual = getSelectionFrameVisual();
  const strokeHex = visual.strokeColor.slice(1).toLowerCase();

  expect(visual.fillColor).toBe('#00000000');
  expect(visual.strokeColor.startsWith('#')).toBe(true);
  expect([6, 8]).toContain(strokeHex.length);
  expect([...strokeHex].every((character) => '0123456789abcdef'.includes(character))).toBe(true);
  expect(visual).not.toHaveProperty('opacity');
  expect(visual).not.toHaveProperty('fillOpacity');
  expect(visual).not.toHaveProperty('strokeOpacity');
});
