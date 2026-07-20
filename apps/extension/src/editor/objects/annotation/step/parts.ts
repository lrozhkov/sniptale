import { Circle, Textbox } from 'fabric';
import type { EditorStepSettings as StepSettings } from '../../../../features/editor/document/step-types';
import {
  EDITOR_CANVAS_CONTROL_SURFACE as CONTROL_SURFACE,
  EDITOR_CANVAS_TEXT_INVERSE as TEXT_INVERSE,
} from '../../../color/palette/constants';
import { hexToRgba } from '../../../document/model';
import type { StepGroupGeometry } from './geometry';
import { resolveStepOpacity, resolveStepText } from './style';

export function createStepCircle(settings: StepSettings, radius: number) {
  return new Circle({
    radius,
    fill: hexToRgba(settings.color, resolveStepOpacity(settings.opacity)),
    stroke: hexToRgba(
      settings.strokeColor ?? CONTROL_SURFACE,
      resolveStepOpacity(settings.strokeOpacity)
    ),
    strokeUniform: true,
    strokeWidth: Math.max(0, settings.strokeWidth ?? 2),
    originX: 'center',
    originY: 'center',
    left: 0,
    top: 0,
    selectable: false,
    evented: false,
  });
}

export function createStepText(settings: StepSettings, geometry: StepGroupGeometry) {
  return new Textbox(resolveStepText(settings), {
    left: 0,
    top: geometry.textTop,
    originX: 'center',
    originY: 'center',
    width: geometry.textWidth,
    fontSize: geometry.fontSize,
    fill: settings.textColor ?? TEXT_INVERSE,
    fontWeight: 'bold',
    textAlign: 'center',
    editable: false,
    selectable: false,
    evented: false,
  });
}
