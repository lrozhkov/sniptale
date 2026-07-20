import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../features/editor/document/types';

export interface EditorControllerInstanceSceneActions {
  resizeCanvas(width: number, height: number): void;
  resizeImage(width: number, height: number): void;
  applyFrameSettings(frame: EditorFrameSettings): void;
  applyBrowserFrame(browserFrame: BrowserFrameState): Promise<void>;
  previewBrowserFrame(browserFrame: BrowserFrameState): Promise<void>;
  removeBrowserFrame(): Promise<void>;
  previewRemoveBrowserFrame(): Promise<void>;
  zoomIn(): void;
  zoomOut(): void;
  zoomToFit(): void;
  resetZoom(): void;
  setZoom(value: number): void;
  setZoomAtViewportPoint(value: number, point: { clientX: number; clientY: number }): void;
  navigateViewportTo(relativeX: number, relativeY: number): void;
}
