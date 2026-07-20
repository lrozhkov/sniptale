import type { Canvas } from 'fabric';
import { isTextbox } from '../core/helpers';
import type { EditorTextInlineStyleCommand } from './commands';
import { getObjectStylePatch, getSelectionStylePatch } from './style-patch';

export function applyEditorTextSelectionStyle(
  options: {
    canvas: Canvas | null;
    commitHistory: () => void;
    syncRuntimeState: () => void;
    withHistoryMuted: <T>(callback: () => T) => T;
  },
  command: EditorTextInlineStyleCommand
): boolean {
  const object = options.canvas?.getActiveObject();
  if (
    !options.canvas ||
    !object ||
    !isTextbox(object) ||
    (object.sniptaleType !== 'text' && object.sniptaleType !== 'meta-stamp')
  ) {
    return false;
  }

  const start = object.selectionStart ?? 0;
  const end = object.selectionEnd ?? 0;
  if (start === end) {
    if (object.isEditing) {
      return false;
    }

    const patch = getObjectStylePatch(object, command);
    options.withHistoryMuted(() => {
      object.set(patch);
      object.dirty = true;
      options.canvas?.requestRenderAll();
    });
    options.commitHistory();
    options.syncRuntimeState();
    return true;
  }

  const patch = getSelectionStylePatch(object, command, start, end);
  options.withHistoryMuted(() => {
    object.setSelectionStyles(patch, start, end);
    object.dirty = true;
    options.canvas?.requestRenderAll();
  });
  options.commitHistory();
  options.syncRuntimeState();
  return true;
}
