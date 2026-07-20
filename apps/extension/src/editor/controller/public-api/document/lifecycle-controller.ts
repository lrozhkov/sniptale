import type { EditorControllerPublicApiAdapter } from '../types';

export type EditorDocumentOpenLifecycleController = Pick<
  EditorControllerPublicApiAdapter,
  'applyDocument' | 'scheduleZoomToFit'
>;

export type EditorDocumentCloseLifecycleController = Pick<
  EditorControllerPublicApiAdapter,
  | 'canvas'
  | 'setActiveTool'
  | 'setCanvasDocumentSize'
  | 'setCropState'
  | 'setDrawSession'
  | 'setHistory'
  | 'setOriginalDocument'
  | 'setPanSession'
  | 'setSource'
  | 'setZoomLevel'
  | 'viewportDevicePixelRatioBaseline'
  | 'zoomLevel'
>;
