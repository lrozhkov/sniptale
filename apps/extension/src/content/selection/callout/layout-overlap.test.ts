// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { getCalloutLayoutState } from './layout';
import { createDefaultCalloutSettings } from './model';

it('collapses a wedge that would turn back into an overlapping bubble', () => {
  const settings = createDefaultCalloutSettings();
  const frameRect = { x: 50, y: 95, width: 500, height: 95 };
  const layout = getCalloutLayoutState({
    dimensions: { width: 250, height: 118 },
    frameRect,
    isEditing: false,
    settings: {
      ...settings,
      placement: {
        ...settings.placement,
        anchor: 'bottom-center',
        side: 'bottom',
        manualPlacement: { centerOffsetX: -2, centerOffsetY: 52.5 },
      },
      style: {
        ...settings.style,
        connector: { ...settings.style.connector, kind: 'wedge' },
        surface: { ...settings.style.surface, borderColor: '#3388ff', borderWidth: 4 },
      },
    },
    zIndex: 20,
  });

  expect(layout.calloutPos).toEqual({ x: 173, y: 136 });
  expect(layout.dynamicTail).toBeNull();
  expect(layout.cloudStyle.backgroundColor).toBe(settings.style.surface.backgroundColor);
  expect(layout.cloudStyle.border).toBe('4px solid #3388ff');
});
