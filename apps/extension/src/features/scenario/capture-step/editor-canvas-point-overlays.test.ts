import { describe, expect, it } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../highlighter/style/defaults';
import { translate } from '../../../platform/i18n';
import {
  SCENARIO_CLICK_RING_FILL,
  SCENARIO_CLICK_RING_RADIUS,
  SCENARIO_CLICK_RING_STROKE,
  SCENARIO_CLICK_RING_STROKE_WIDTH,
} from './annotation-styles';
import { createPointOverlayCanvasObject } from './editor-canvas-point-overlays';

function verifyClickRingCanvasObject() {
  const canvasObject = createPointOverlayCanvasObject({
    id: 'ring-1',
    kind: 'click-ring',
    point: { x: 24, y: 34 },
    autoSource: 'capture-click',
  });

  expect(canvasObject).toEqual(
    expect.objectContaining({
      type: 'Ellipse',
      left: 24,
      top: 34,
      width: SCENARIO_CLICK_RING_RADIUS * 2,
      height: SCENARIO_CLICK_RING_RADIUS * 2,
      fill: SCENARIO_CLICK_RING_FILL,
      stroke: SCENARIO_CLICK_RING_STROKE,
      strokeWidth: SCENARIO_CLICK_RING_STROKE_WIDTH,
      sniptaleMetaKind: 'scenario-click-ring',
      sniptaleAutoSource: 'capture-click',
      sniptaleShapeShadow: DEFAULT_BORDER_PRESET.shadow,
    })
  );
}

function verifyCursorCanvasObject() {
  const canvasObject = createPointOverlayCanvasObject({
    id: 'cursor-1',
    kind: 'cursor',
    point: { x: 42, y: 52 },
  });

  expect(canvasObject).toEqual(
    expect.objectContaining({
      type: 'Ellipse',
      left: 42,
      top: 52,
      width: 20,
      height: 20,
      fill: '#111827',
      stroke: '#ffffff',
      strokeWidth: 2,
      sniptaleLabel: translate('scenario.editor.overlayKinds.cursor'),
      sniptaleMetaKind: 'scenario-cursor',
      sniptaleShapeShadow: DEFAULT_BORDER_PRESET.shadow,
    })
  );
}

describe('capture-step editor canvas point overlays', () => {
  it('projects click rings into tagged Fabric ellipse objects', verifyClickRingCanvasObject);
  it('projects cursors into tagged Fabric ellipse objects', verifyCursorCanvasObject);
});
