import type { EditorControllerInstanceDocumentActions } from './document-actions';
import type { EditorControllerInstanceLayerActions } from './layer-actions';
import type { EditorControllerInstanceLifecycleActions } from './lifecycle-actions';
import type { EditorControllerInstanceObjectCapabilities } from './object-capabilities';
import type { EditorControllerInstanceSceneActions } from './scene-actions';
import type { EditorControllerInstanceSelectionActions } from './selection-actions';
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
