import type { ArrowPathInstance } from '../controls.types';
import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import {
  EDITOR_CANVAS_ACCENT,
  EDITOR_CANVAS_CONTROL_SURFACE,
} from '../../../color/palette/constants';
import { resolveArrowInteractionAppearance } from '../variant';

export function applyArrowInteractionAppearance(
  arrow: ArrowPathInstance,
  settings: EditorArrowSettings
): void {
  const interactionAppearance = resolveArrowInteractionAppearance(settings);
  const drawingMode = arrow.sniptaleArrowDrawing === true;
  const pointEditMode = arrow.sniptaleArrowEditMode === true;
  arrow.set({
    hasBorders: drawingMode ? false : pointEditMode ? interactionAppearance.hasBorders : true,
    hasControls: !drawingMode,
    lockScalingX: drawingMode || pointEditMode ? interactionAppearance.lockScaling : false,
    lockScalingY: drawingMode || pointEditMode ? interactionAppearance.lockScaling : false,
    lockRotation: drawingMode || pointEditMode ? interactionAppearance.lockRotation : true,
    hoverCursor: pointEditMode ? interactionAppearance.hoverCursor : 'move',
    moveCursor: pointEditMode ? interactionAppearance.moveCursor : 'grab',
    transparentCorners: false,
    cornerStyle: interactionAppearance.cornerStyle,
    cornerSize: interactionAppearance.cornerSize,
    borderColor: EDITOR_CANVAS_ACCENT,
    cornerColor: EDITOR_CANVAS_CONTROL_SURFACE,
    cornerStrokeColor: EDITOR_CANVAS_ACCENT,
  });
}
