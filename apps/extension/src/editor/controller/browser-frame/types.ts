import type { Canvas, FabricObject } from 'fabric';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';

import type { SourceState } from '../../document/model/source-state';
import type { SceneRelayoutOptions } from '../document/scene/types';

type CanvasSize = {
  width: number;
  height: number;
};

type BrowserFrameLogger = (stage: string, payload?: Record<string, unknown>) => void;

type PreparedEditorFrameDecorations = {
  browserFrameObjects: { objects: FabricObject[]; sourceClipPath: FabricObject | null };
  frameObjects: FabricObject[];
};

interface BrowserFrameTransitionSharedContext {
  canvasDocumentSize: CanvasSize;
  currentBrowserFrame: BrowserFrameState;
  applyFrameDecorations: (prepared: PreparedEditorFrameDecorations, renderToken: number) => boolean;
  ensureBrowserFrameOnTop: () => void;
  ensureReachableObjects: () => void;
  frame: EditorFrameSettings;
  prepareFrameDecorations: (
    browserFrame: BrowserFrameState,
    canvasSize: CanvasSize,
    source: SourceState
  ) => Promise<{ prepared: PreparedEditorFrameDecorations; renderToken: number } | null>;
  relayoutScene: (browserFrame: BrowserFrameState, options: SceneRelayoutOptions) => void;
  rebuildFrameDecorations: () => Promise<void>;
  setBrowserFrame: (browserFrame: BrowserFrameState) => void;
  zoomLevel: number;
  viewportDevicePixelRatioBaseline?: number;
}

export interface BrowserFrameTransitionContext extends BrowserFrameTransitionSharedContext {
  canvas: Canvas;
  source: SourceState;
}

export interface EditorBrowserFrameContext extends BrowserFrameTransitionContext {
  logBrowserFrame: BrowserFrameLogger;
}

export interface BrowserFrameTransitionOwnerContext extends BrowserFrameTransitionSharedContext {
  canvas: Canvas | null;
  source: SourceState | null;
  logBrowserFrame: BrowserFrameLogger;
}

export interface ApplyBrowserFrameOptions extends BrowserFrameTransitionOwnerContext {
  browserFrame: BrowserFrameState;
}
