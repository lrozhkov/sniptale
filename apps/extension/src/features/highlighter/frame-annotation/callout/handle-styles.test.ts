// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { createDefaultCalloutSettings } from './model';
import { getCalloutLayoutState } from './layout';
import { createCalloutHandleStyles } from './handle-styles';

it('places both comment controls left and below a callout at the top-right viewport edge', () => {
  const layout = getCalloutLayoutState({
    dimensions: { height: 40, width: 80 },
    frameRect: { height: 80, width: 120, x: 200, y: 200 },
    isEditing: false,
    settings: createDefaultCalloutSettings(),
    zIndex: 20,
  });
  const styles = createCalloutHandleStyles({
    layout: {
      ...layout,
      calloutDimensions: { height: 40, width: 80 },
      calloutPos: { x: 720, y: 2 },
    },
    showSettingsHandle: true,
    viewport: { height: 600, width: 800 },
  });

  expect(styles.dragHandleStyle).toMatchObject({ left: 658, top: 46 });
  expect(styles.settingsHandleStyle).toMatchObject({ left: 688, top: 46 });
});
