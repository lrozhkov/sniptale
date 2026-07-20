import { reportEditorActionFailure } from '../../../runtime/async-actions';
import { applyEditorViewportZoom } from '../../viewport';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../features/editor/document/types';
import type { Canvas } from 'fabric';

export type RelayoutOptions = {
  canvasSize?: { width: number; height: number };
  sourceSize?: { width: number; height: number };
  preserveCanvasSize?: boolean;
  fitSourceToContent?: boolean;
  hasBrowserFrame?: boolean;
};

export type EditorSceneStoreBridge = {
  getBrowserFrame: () => BrowserFrameState;
  getFrame: () => EditorFrameSettings;
  setBrowserFrame: (nextBrowserFrame: BrowserFrameState) => void;
  updateFrame: (frame: EditorFrameSettings) => void;
};

type SceneFinalizeOptions = {
  canvas: Canvas;
  zoomLevel: number;
  viewportDevicePixelRatioBaseline?: number;
  getCanvasDocumentSize: () => { width: number; height: number };
  ensureReachableObjects: () => boolean | void;
  rebuildFrameDecorations: () => Promise<void>;
  commitHistory: () => void;
  syncRuntimeState: () => void;
};

/**
 * Runs the shared post-relayout scene side effects in a single place so scene
 * actions stay focused on ownership and relayout policy.
 */
export function finalizeEditorSceneMutation(options: SceneFinalizeOptions): void {
  applyEditorViewportZoom(
    options.canvas,
    options.getCanvasDocumentSize(),
    options.zoomLevel,
    options.viewportDevicePixelRatioBaseline
  );
  options.ensureReachableObjects();
  void options
    .rebuildFrameDecorations()
    .then(() => {
      options.commitHistory();
      options.syncRuntimeState();
    })
    .catch((error) => {
      reportEditorActionFailure('scene-mutation', error);
    });
}
