import type { Group } from 'fabric';
import type { EditorStepSettings as StepSettings } from '../../../../features/editor/document/step-types';
import {
  EDITOR_CANVAS_CONTROL_SURFACE as CONTROL_SURFACE,
  EDITOR_CANVAS_TEXT_INVERSE as TEXT_INVERSE,
} from '../../../color/palette/constants';
import { hexToRgba } from '../../../document/model';
import { resolveStepGroupGeometry } from './geometry';
import { assignStepMetadata } from './metadata';
import { resolveStepOpacity, resolveStepText } from './style';

export function updateStepGroup(group: Group, settings: StepSettings): void {
  const { radius, fontSize, strokeWidth, textTop, textWidth } = resolveStepGroupGeometry(
    settings.sizeLevel
  );
  const [circle, text] = group.getObjects();

  circle?.set({
    fill: hexToRgba(settings.color, resolveStepOpacity(settings.opacity)),
    radius,
    stroke: hexToRgba(
      settings.strokeColor ?? CONTROL_SURFACE,
      resolveStepOpacity(settings.strokeOpacity)
    ),
    strokeUniform: true,
    strokeWidth: Math.max(0, settings.strokeWidth ?? strokeWidth),
  });
  text?.set({
    fill: settings.textColor ?? TEXT_INVERSE,
    text: resolveStepText(settings),
    top: textTop,
    width: textWidth,
    fontSize,
  });
  assignStepMetadata(group, settings);
  (group as Group & { triggerLayout?: () => void }).triggerLayout?.();
  group.setCoords();
  group.dirty = true;
}
