import type { Canvas } from 'fabric';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';

import type { SourceState } from '../../document/model/source-state';
import { applyEditorFrameDecorations } from './frame-decoration-apply';
import { prepareEditorFrameDecorations } from './frame-decoration-prepare';

export async function rebuildEditorFrameDecorations(options: {
  canvas: Canvas | null;
  canvasSize: { width: number; height: number };
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
  source?: SourceState | null;
  renderToken: number;
  isCurrentRenderToken: (token: number) => boolean;
}): Promise<{ aborted: boolean; frameObjectsCount: number }> {
  const { canvas, canvasSize, frame, browserFrame, renderToken, isCurrentRenderToken } = options;
  if (!canvas) {
    return { aborted: true, frameObjectsCount: 0 };
  }

  const prepared = await prepareEditorFrameDecorations({
    canvasSize,
    frame,
    browserFrame,
    source: options.source ?? null,
  });

  if (!isCurrentRenderToken(renderToken)) {
    return { aborted: true, frameObjectsCount: prepared.frameObjects.length };
  }

  applyEditorFrameDecorations({ canvas, frame, prepared });

  return { aborted: false, frameObjectsCount: prepared.frameObjects.length };
}
