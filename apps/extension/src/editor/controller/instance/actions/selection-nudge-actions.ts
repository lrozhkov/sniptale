import { nudgeEditorControllerSelection } from '../../public-api';
import { hasMatchingNudgeSignature, type EditorSelectionNudge } from '../../tools/nudge';
import type { EditorControllerInstance } from '../types';

export function nudgeSelectionForController(
  controller: EditorControllerInstance,
  nudge: EditorSelectionNudge
): boolean {
  if (
    controller.selectionNudgeSession &&
    !hasMatchingNudgeSignature(controller.selectionNudgeSession, nudge)
  ) {
    finalizeSelectionNudgeForController(controller);
  }

  const moved = nudgeEditorControllerSelection(controller.getPublicApiAdapter(), nudge);
  if (!moved) {
    return false;
  }

  controller.selectionNudgeSession = {
    code: nudge.code,
    step: nudge.step,
  };
  return true;
}

export function finalizeSelectionNudgeForController(
  controller: EditorControllerInstance,
  code?: string
): void {
  if (!controller.selectionNudgeSession) {
    return;
  }

  if (code && controller.selectionNudgeSession.code !== code) {
    return;
  }

  controller.commitHistory();
  controller.selectionNudgeSession = null;
}
