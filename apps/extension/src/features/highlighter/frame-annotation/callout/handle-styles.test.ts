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

  expect(styles.dragHandleStyle).toMatchObject({ left: 628, top: 46 });
  expect(styles.settingsHandleStyle).toMatchObject({ left: 688, top: 46 });
  expect(styles.tailBaseRangeHandleStyle).not.toBeNull();
});

it.each([4, 0.5, 0.2])('keeps centered comment handles anchored at ui scale %s', (uiScale) => {
  const layout = getCalloutLayoutState({
    dimensions: { height: 8, width: 16 },
    frameRect: { height: 80, width: 120, x: 200, y: 200 },
    isEditing: false,
    settings: createDefaultCalloutSettings(),
    visualScale: uiScale,
    zIndex: 20,
  });
  const styles = createCalloutHandleStyles({
    layout: {
      ...layout,
      calloutDimensions: { height: 8, width: 16 },
      calloutPos: { x: 40, y: 30 },
    },
    showSettingsHandle: true,
    uiScale,
    viewport: { height: 120, width: 160 },
  });

  expect(Number(styles.resizeLeftHandleStyle.left) + 6).toBeCloseTo(40);
  expect(Number(styles.resizeLeftHandleStyle.top) + 6).toBeCloseTo(34);

  const tailPoint =
    layout.dynamicTail?.kind === 'line'
      ? layout.dynamicTail.attachment.bubbleEdgePoint
      : layout.dynamicTail?.attachment.baseEdgeA;
  if (tailPoint && styles.tailHandleStyle) {
    expect(Number(styles.tailHandleStyle.left) + 6).toBeCloseTo(tailPoint.x);
    expect(Number(styles.tailHandleStyle.top) + 6).toBeCloseTo(tailPoint.y);
  }
});

it('uses the compact control count and omits the shared wedge range for a line connector', () => {
  const settings = createDefaultCalloutSettings();
  settings.style.connector.kind = 'line';
  const layout = getCalloutLayoutState({
    dimensions: { height: 40, width: 80 },
    frameRect: { height: 80, width: 120, x: 200, y: 200 },
    isEditing: false,
    settings,
    zIndex: 20,
  });

  const styles = createCalloutHandleStyles({
    layout,
    showSettingsHandle: false,
    viewport: { height: 600, width: 800 },
  });

  expect(styles.tailBaseRangeHandleStyle).toBeNull();
  expect(styles.dragHandleStyle.left).toEqual(expect.any(Number));
});
