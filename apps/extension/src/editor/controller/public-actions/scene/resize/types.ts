import type { Canvas } from 'fabric';

import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../../features/editor/document/types';

import type { SourceState } from '../../../../document/model/source-state';
import type { EditorSceneStoreBridge, RelayoutOptions } from '../helpers';

type RelayoutScene = (
  frame: EditorFrameSettings,
  browserFrame: BrowserFrameState,
  relayoutOptions: RelayoutOptions
) => void;

export type SceneResizeOptions = {
  canvas: Canvas | null;
  source: SourceState | null;
  store: Pick<EditorSceneStoreBridge, 'getBrowserFrame' | 'getFrame'>;
  width: number;
  height: number;
  zoomLevel: number;
  viewportDevicePixelRatioBaseline?: number;
  getCanvasDocumentSize: () => { width: number; height: number };
  ensureReachableObjects: () => boolean;
  rebuildFrameDecorations: () => Promise<void>;
  commitHistory: () => void;
  syncRuntimeState: () => void;
};

export type CanvasResizeSceneOptions = SceneResizeOptions & {
  setCanvasDocumentSize: (size: { width: number; height: number }) => void;
  relayoutScene: RelayoutScene;
};

export type SourceResizeSceneOptions = SceneResizeOptions & {
  relayoutScene: RelayoutScene;
};

export type FrameSceneSettingsOptions = Omit<SceneResizeOptions, 'store' | 'width' | 'height'> & {
  frame: EditorFrameSettings;
  store: Pick<EditorSceneStoreBridge, 'getBrowserFrame' | 'getFrame' | 'updateFrame'>;
  relayoutScene: RelayoutScene;
};
