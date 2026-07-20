import { DEFAULT_BORDER_PRESET } from '../../highlighter/style/public';
import { translate } from '../../../platform/i18n';
import type { ScenarioOverlay } from '../contracts/types/overlays';
import {
  SCENARIO_CLICK_RING_FILL,
  SCENARIO_CLICK_RING_RADIUS,
  SCENARIO_CLICK_RING_STROKE,
  SCENARIO_CLICK_RING_STROKE_WIDTH,
} from './annotation-styles';
import { createCanvasBaseObject, type ScenarioEditorCanvasObject } from './editor-canvas-shared';

const CURSOR_FILL = '#111827';
const CURSOR_RADIUS_X = 10;
const CURSOR_RADIUS_Y = 10;

type ScenarioEditorPointMetaKind = 'scenario-click-ring' | 'scenario-cursor';

function createPointEllipseObject(args: {
  fill: string;
  label?: string;
  metaKind: ScenarioEditorPointMetaKind;
  overlay: Extract<ScenarioOverlay, { kind: 'click-ring' | 'cursor' }>;
  radiusX: number;
  radiusY: number;
  stroke: string | null;
  strokeWidth: number;
}) {
  return {
    ...createCanvasBaseObject({
      type: 'Ellipse',
      originX: 'center',
      originY: 'center',
      left: args.overlay.point.x,
      top: args.overlay.point.y,
      width: args.radiusX * 2,
      height: args.radiusY * 2,
      fill: args.fill,
      stroke: args.stroke,
      strokeWidth: args.strokeWidth,
    }),
    rx: args.radiusX,
    ry: args.radiusY,
    sniptaleId: args.overlay.id,
    sniptaleType: 'ellipse',
    sniptaleRole: 'annotation',
    ...(args.label ? { sniptaleLabel: args.label } : {}),
    sniptaleBorderPresetId: DEFAULT_BORDER_PRESET.id,
    sniptaleShapeStrokeStyle: DEFAULT_BORDER_PRESET.style,
    sniptaleShapeRadius: 0,
    sniptaleShapeShadow: DEFAULT_BORDER_PRESET.shadow,
    sniptaleMetaKind: args.metaKind,
    sniptaleAutoSource: args.overlay.autoSource ?? null,
  };
}

export function createPointOverlayCanvasObject(
  overlay: Extract<ScenarioOverlay, { kind: 'click-ring' | 'cursor' }>
): ScenarioEditorCanvasObject {
  if (overlay.kind === 'click-ring') {
    return createPointEllipseObject({
      overlay,
      metaKind: 'scenario-click-ring',
      radiusX: SCENARIO_CLICK_RING_RADIUS,
      radiusY: SCENARIO_CLICK_RING_RADIUS,
      fill: SCENARIO_CLICK_RING_FILL,
      stroke: SCENARIO_CLICK_RING_STROKE,
      strokeWidth: SCENARIO_CLICK_RING_STROKE_WIDTH,
    });
  }

  return createPointEllipseObject({
    overlay,
    metaKind: 'scenario-cursor',
    radiusX: CURSOR_RADIUS_X,
    radiusY: CURSOR_RADIUS_Y,
    fill: CURSOR_FILL,
    label: translate('scenario.editor.overlayKinds.cursor'),
    stroke: '#ffffff',
    strokeWidth: 2,
  });
}
