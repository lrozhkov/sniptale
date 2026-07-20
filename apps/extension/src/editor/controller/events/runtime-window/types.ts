import type {
  EditorControllerEventCommandBindings,
  EditorControllerEventCropBindings,
  EditorControllerEventObjectBindings,
  EditorControllerEventStateBindings,
} from '../types';

export type RuntimeWindowBindings = EditorControllerEventStateBindings &
  EditorControllerEventCropBindings &
  EditorControllerEventObjectBindings &
  EditorControllerEventCommandBindings;

export type RuntimeWindowKeyboardBindings = EditorControllerEventStateBindings &
  EditorControllerEventCropBindings &
  Pick<
    EditorControllerEventCommandBindings,
    | 'applyCropSelection'
    | 'applyTextSelectionStyle'
    | 'cancelTransientInteraction'
    | 'commitHistory'
    | 'copyRasterSelection'
    | 'cutRasterSelection'
    | 'deleteRasterSelectionPixels'
    | 'deleteSelection'
    | 'duplicateSelection'
    | 'nudgeSelection'
    | 'pasteRasterClipboard'
    | 'redo'
    | 'syncRuntimeState'
    | 'undo'
  >;
