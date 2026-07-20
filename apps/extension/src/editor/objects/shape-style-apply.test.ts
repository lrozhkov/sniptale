import { Rect } from 'fabric';
import { expect, it } from 'vitest';

import { applyShapeSettings } from './shape-style-apply';

it('applies shared shape styling and rectangle geometry through the apply owner', () => {
  const rect = new Rect({ height: 20, left: 10, top: 20, width: 40 });

  applyShapeSettings(rect, 'rectangle', {
    borderPresetId: 'preset',
    customCss: '',
    fillColor: '#ffffff',
    fillOpacity: 0.5,
    inheritCustomCss: false,
    opacity: 1,
    radius: 6,
    shadow: 0,
    strokeColor: '#112233',
    strokeOpacity: 1,
    strokeStyle: 'dashed',
    strokeWidth: 4,
  });

  expect(rect.sniptaleBorderPresetId).toBe('preset');
  expect(rect.strokeDashArray).toEqual([12, 6.4]);
  expect(rect.fill).toBe('rgba(255, 255, 255, 0.5)');
  expect(rect.rx).toBe(6);
});
