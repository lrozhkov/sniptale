import type { EditorObjectType } from '../../../../../features/editor/document/types';
import {
  advanceEditorControllerStepValue,
  getNextEditorLabelIndex,
} from '../../../runtime/actions';
import type { EditorControllerInstance } from '../../types';

export function nextLabelIndexForController(
  controller: EditorControllerInstance,
  type: EditorObjectType
): number {
  return getNextEditorLabelIndex(controller.canvas, type);
}

export function advanceStepValueForController(): void {
  advanceEditorControllerStepValue();
}
