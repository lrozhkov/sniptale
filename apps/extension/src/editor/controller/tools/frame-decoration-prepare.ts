import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import { createBrowserFrameObjects } from '../../objects/browser-frame';

import type { SourceState } from '../../document/model/source-state';
import type {
  EmptyBrowserFrameDecorationObjects,
  PreparedEditorFrameDecorations,
} from './frame-decoration-types';

export async function prepareEditorFrameDecorations(options: {
  canvasSize: { width: number; height: number };
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
  source?: SourceState | null;
}): Promise<PreparedEditorFrameDecorations> {
  const frameObjects = await createBrowserFrameObjects({
    canvasWidth: options.canvasSize.width,
    canvasHeight: options.canvasSize.height,
    frame: options.frame,
  });
  const emptyBrowserFrameObjects: EmptyBrowserFrameDecorationObjects = {
    objects: [],
    sourceClipPath: null,
  };

  if (!options.source) {
    return {
      frameObjects,
      browserFrameObjects: emptyBrowserFrameObjects,
    };
  }

  return {
    frameObjects,
    browserFrameObjects: emptyBrowserFrameObjects,
  };
}
