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
    | 'deleteSelection'
    | 'duplicateSelection'
    | 'nudgeSelection'
    | 'redo'
    | 'syncRuntimeState'
    | 'undo'
  >;
