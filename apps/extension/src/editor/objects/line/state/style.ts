import { type Path } from 'fabric';
import type { EditorLineSettings } from '../../../../features/editor/document/line-types';
import { createFabricShadow } from '../../shadow';
import { hexToRgba } from '../../../document/model';
import {
  EDITOR_CANVAS_ACCENT,
  EDITOR_CANVAS_CONTROL_SURFACE,
} from '../../../color/palette/constants';
import { resolveLineDashArray } from '../path';
import type { LinePathInstance } from '../types';

export function applyLinePathStyle(
  line: LinePathInstance,
  draft: Path,
  settings: EditorLineSettings
): void {
  line.set({
    path: draft.path,
    fill: 'transparent',
    stroke: hexToRgba(settings.color, settings.opacity),
    strokeDashArray: resolveLineDashArray(settings),
    strokeLineCap: settings.corners === 'round' ? 'round' : 'butt',
    strokeLineJoin: settings.corners === 'round' ? 'round' : 'miter',
    strokeUniform: true,
    strokeWidth: settings.width,
    objectCaching: false,
    shadow: createFabricShadow(settings.shadow, settings.shadowColor ?? settings.color, {
      angle: settings.shadowAngle ?? 90,
      blur: settings.shadowBlur ?? 12,
      distance: settings.shadowDistance ?? 4,
    }),
  });
}

export function applyLineControlStyle(line: LinePathInstance): void {
  line.set({
    hasBorders: line.sniptaleLineDrawing === true ? false : !line.sniptaleLineEditMode,
    hasControls: line.sniptaleLineDrawing !== true,
    lockRotation: false,
    lockScalingX: line.sniptaleLineDrawing === true || line.sniptaleLineEditMode === true,
    lockScalingY: line.sniptaleLineDrawing === true || line.sniptaleLineEditMode === true,
    transparentCorners: false,
    cornerStyle: 'circle',
    cornerSize: 14,
    borderColor: EDITOR_CANVAS_ACCENT,
    cornerColor: EDITOR_CANVAS_CONTROL_SURFACE,
    cornerStrokeColor: EDITOR_CANVAS_ACCENT,
  });
}
