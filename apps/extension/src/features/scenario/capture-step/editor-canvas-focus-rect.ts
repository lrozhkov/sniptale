import { DEFAULT_BORDER_PRESET } from '../../highlighter/style/public';
import type { ScenarioOverlay } from '../contracts/types/overlays';
import { SCENARIO_FOCUS_RECT_RADIUS } from './annotation-styles';
import { createCanvasBaseObject, type ScenarioEditorCanvasObject } from './editor-canvas-shared';

export function createFocusRectCanvasObject(
  overlay: Extract<ScenarioOverlay, { kind: 'focus-rect' }>
): ScenarioEditorCanvasObject {
  return {
    ...createCanvasBaseObject({
      type: 'Rect',
      originX: 'left',
      originY: 'top',
      left: overlay.rect.x,
      top: overlay.rect.y,
      width: overlay.rect.width,
      height: overlay.rect.height,
      fill: '#00000000',
      stroke: DEFAULT_BORDER_PRESET.color,
      strokeWidth: DEFAULT_BORDER_PRESET.width,
    }),
    rx: SCENARIO_FOCUS_RECT_RADIUS,
    ry: SCENARIO_FOCUS_RECT_RADIUS,
    sniptaleId: overlay.id,
    sniptaleType: 'rectangle',
    sniptaleRole: 'annotation',
    sniptaleLabel: 'Scenario frame',
    sniptaleBorderPresetId: DEFAULT_BORDER_PRESET.id,
    sniptaleShapeStrokeStyle: DEFAULT_BORDER_PRESET.style,
    sniptaleShapeRadius: SCENARIO_FOCUS_RECT_RADIUS,
    sniptaleShapeShadow: DEFAULT_BORDER_PRESET.shadow,
    sniptaleMetaKind: 'scenario-focus-rect',
    sniptaleAutoSource: overlay.autoSource ?? null,
  };
}
