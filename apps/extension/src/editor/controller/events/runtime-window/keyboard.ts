import { handleEditorWindowKeyDown, handleEditorWindowKeyUp } from '../../input';
import { completeDrawSessionOnEnterFromBindings } from '../draw-session-completion';
import type {
  EditorControllerEventCommandBindings,
  EditorControllerEventStateBindings,
} from '../types';
import type { RuntimeWindowKeyboardBindings } from './types';

export function createRuntimeWindowKeyDownHandler(bindings: RuntimeWindowKeyboardBindings) {
  return (event: KeyboardEvent) => {
    const hasDrawSession = Boolean(bindings.getDrawSession?.());
    const result = handleEditorWindowKeyDown({
      canvas: bindings.getCanvas(),
      target: event.target,
      code: event.code,
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      activeTool: bindings.getActiveTool(),
      hasRasterSelection: Boolean(bindings.getRasterToolSession().selection),
      hasCropGuide: Boolean(bindings.getCropGuide()),
      hasDrawSession,
      cancelTransientInteraction: bindings.cancelTransientInteraction,
      undo: bindings.undo,
      redo: bindings.redo,
      duplicateSelection: bindings.duplicateSelection,
      copyRasterSelection: bindings.copyRasterSelection,
      cutRasterSelection: bindings.cutRasterSelection,
      pasteRasterClipboard: bindings.pasteRasterClipboard,
      ...(bindings.nudgeSelection ? { nudgeSelection: bindings.nudgeSelection } : {}),
      deleteRasterSelectionPixels: bindings.deleteRasterSelectionPixels,
      deleteSelection: bindings.deleteSelection,
      applyCropSelection: bindings.applyCropSelection,
      ...(bindings.applyTextSelectionStyle
        ? { applyTextSelectionStyle: bindings.applyTextSelectionStyle }
        : {}),
      completeDrawSession: () => completeDrawSessionOnEnterFromBindings(bindings),
      syncRuntimeState: bindings.syncRuntimeState,
    });

    if (typeof result.nextSpacePressed === 'boolean') {
      bindings.setIsSpacePressed(result.nextSpacePressed);
    }
    if (result.preventDefault) {
      event.preventDefault();
    }
  };
}

export function createRuntimeWindowKeyUpHandler(
  bindings: Pick<EditorControllerEventStateBindings, 'setIsSpacePressed'> &
    Pick<EditorControllerEventCommandBindings, 'finalizeSelectionNudge'>
) {
  return (event: KeyboardEvent) => {
    const result = handleEditorWindowKeyUp({
      code: event.code,
      ...(bindings.finalizeSelectionNudge
        ? { finalizeSelectionNudge: bindings.finalizeSelectionNudge }
        : {}),
    });
    if (typeof result.nextSpacePressed === 'boolean') {
      bindings.setIsSpacePressed(result.nextSpacePressed);
    }
  };
}
