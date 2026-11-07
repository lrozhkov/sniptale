import type { Canvas } from 'fabric';
import type { PreparedBackgroundLayer } from '../../../background/sync';

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

/** Transient scene previews do not change accepted settings, history, or autosave. */
export type FrameSceneMutationOptions = {
  preview?: boolean;
  quality?: 'final' | 'preview';
  signal?: AbortSignal;
};

export type FrameSceneSettingsOptions = Omit<SceneResizeOptions, 'store' | 'width' | 'height'> &
  FrameSceneMutationOptions & {
    frame: EditorFrameSettings;
    isCurrent?: () => boolean;
    prepareBackground?: (size: {
      width: number;
      height: number;
    }) => Promise<PreparedBackgroundLayer>;
    store: Pick<EditorSceneStoreBridge, 'getBrowserFrame' | 'getFrame' | 'updateFrame'>;
    relayoutScene: RelayoutScene;
  };
