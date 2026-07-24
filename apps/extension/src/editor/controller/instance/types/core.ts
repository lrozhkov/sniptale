import type {
  EditorControllerInstanceDocumentActions,
  EditorControllerInstanceLayerActions,
  EditorControllerInstanceLifecycleActions,
  EditorControllerInstanceObjectCapabilities,
  EditorControllerInstanceSceneActions,
  EditorControllerInstanceSelectionActions,
} from './actions';
import type { EditorControllerInstanceState } from './state';

export interface EditorControllerInstance
  extends
    EditorControllerInstanceState,
    EditorControllerInstanceObjectCapabilities,
    EditorControllerInstanceLifecycleActions,
    EditorControllerInstanceDocumentActions,
    EditorControllerInstanceSelectionActions,
    EditorControllerInstanceLayerActions,
    EditorControllerInstanceSceneActions {}
