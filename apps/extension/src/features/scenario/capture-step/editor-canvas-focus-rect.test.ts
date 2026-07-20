import { describe, expect, it } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../highlighter/style/defaults';
import { SCENARIO_FOCUS_RECT_RADIUS } from './annotation-styles';
import { createFocusRectCanvasObject } from './editor-canvas-focus-rect';

function verifyFocusRectCanvasObject() {
  const canvasObject = createFocusRectCanvasObject({
    id: 'frame-1',
    kind: 'focus-rect',
    rect: { x: 10, y: 20, width: 120, height: 40 },
    autoSource: 'capture-target',
  });

  expect(canvasObject).toEqual(
    expect.objectContaining({
      type: 'Rect',
      left: 10,
      top: 20,
      width: 120,
      height: 40,
      stroke: DEFAULT_BORDER_PRESET.color,
      strokeWidth: DEFAULT_BORDER_PRESET.width,
      rx: SCENARIO_FOCUS_RECT_RADIUS,
      ry: SCENARIO_FOCUS_RECT_RADIUS,
      sniptaleLabel: 'Scenario frame',
      sniptaleBorderPresetId: DEFAULT_BORDER_PRESET.id,
      sniptaleShapeStrokeStyle: DEFAULT_BORDER_PRESET.style,
      sniptaleShapeShadow: DEFAULT_BORDER_PRESET.shadow,
      sniptaleMetaKind: 'scenario-focus-rect',
      sniptaleAutoSource: 'capture-target',
    })
  );
}

function verifyFocusRectCanvasObjectWithoutAutoSource() {
  const canvasObject = createFocusRectCanvasObject({
    id: 'frame-2',
    kind: 'focus-rect',
    rect: { x: 5, y: 6, width: 50, height: 30 },
  });

  expect(canvasObject).toEqual(
    expect.objectContaining({ sniptaleAutoSource: null, sniptaleId: 'frame-2' })
  );
}

describe('capture-step editor canvas focus rect', () => {
  it('projects focus rectangles into tagged Fabric rect objects', verifyFocusRectCanvasObject);
  it(
    'stores a null auto-source marker for manual focus rectangles',
    verifyFocusRectCanvasObjectWithoutAutoSource
  );
});
