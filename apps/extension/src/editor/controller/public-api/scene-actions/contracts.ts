import type { EditorControllerPublicApiAdapter } from '../types';

type EditorSceneViewportApi = Pick<
  EditorControllerPublicApiAdapter,
  'canvas' | 'canvasDocumentSize' | 'source' | 'viewportDevicePixelRatioBaseline' | 'zoomLevel'
>;

type EditorSceneRelayoutApi = Pick<EditorControllerPublicApiAdapter, 'relayoutScene'>;

type EditorSceneMutationLifecycleApi = Pick<
  EditorControllerPublicApiAdapter,
  'commitHistory' | 'ensureReachableObjects' | 'syncRuntimeState'
>;

type EditorSceneCommitApi = Pick<
  EditorControllerPublicApiAdapter,
  'commitHistory' | 'syncRuntimeState'
>;

type EditorSceneBackgroundSyncApi = Pick<
  EditorControllerPublicApiAdapter,
  | 'canvas'
  | 'canvasDocumentSize'
  | 'createLayerMutationToken'
  | 'isLayerMutationTokenCurrent'
  | 'prepareObject'
  | 'rebuildFrameDecorations'
>;

export type EditorSceneMutationCallbackApi = EditorSceneBackgroundSyncApi &
  EditorSceneMutationLifecycleApi;

export type EditorSceneResizeApi = EditorSceneViewportApi &
  EditorSceneRelayoutApi &
  EditorSceneMutationCallbackApi;

export type EditorSceneCanvasResizeApi = EditorSceneResizeApi &
  Pick<EditorControllerPublicApiAdapter, 'setCanvasDocumentSize'>;

export type EditorBrowserFrameApi = Pick<
  EditorControllerPublicApiAdapter,
  'ensureBrowserFrameOnTop' | 'nextLabelIndex' | 'prepareObject'
> &
  EditorSceneViewportApi &
  EditorSceneRelayoutApi &
  EditorSceneCommitApi;
