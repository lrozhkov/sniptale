import type { Canvas, Rect } from 'fabric';
import { createLogger } from '@sniptale/platform/observability/logger';
import { normalizeEditorCropSelection } from '../../tools/crop';
import type { CropSelection } from '../../core/types';
import type { SourceState } from '../../../document/model/source-state';

import {
  finalizeEditorCropSelection,
  hideCropGuideForApply,
  logCropApplyStart,
  type CropGuideState,
} from './guide';
import { runEditorCropSelection } from './scene';

const logger = createLogger({ namespace: 'EditorCrop' });

type ApplyCropSelectionContext = {
  canvas: Canvas | null;
  cropGuide: Rect | null;
  cropSelection: CropSelection | null;
  canvasDocumentSize: { width: number; height: number };
  source: SourceState | null;
  setCanvasDocumentSize: (size: { width: number; height: number }) => void;
  setCropState: (state: CropGuideState) => void;
  setSource: (source: SourceState | null) => void;
  syncViewportTransform: () => void;
  switchToSelectTool: () => void;
  rebuildFrameDecorations: () => Promise<void>;
  commitHistory: () => void;
  logCrop: (stage: string, payload?: Record<string, unknown>) => void;
};

export async function applyEditorControllerCropSelection(
  context: ApplyCropSelectionContext
): Promise<CropGuideState | null> {
  if (!context.canvas || !context.cropGuide || !context.cropSelection) {
    return null;
  }

  const crop = normalizeEditorCropSelection(context.cropSelection, context.canvasDocumentSize);
  const restoreCropGuide = hideCropGuideForApply(context.canvas, context.cropGuide);

  try {
    logCropApplyStart(context.logCrop, crop, context.canvasDocumentSize);
    await runEditorCropSelection({
      canvas: context.canvas,
      crop,
      rebuildFrameDecorations: context.rebuildFrameDecorations,
      setCanvasDocumentSize: context.setCanvasDocumentSize,
      setSource: context.setSource,
      source: context.source,
      syncViewportTransform: context.syncViewportTransform,
    });
    const nextState = finalizeEditorCropSelection(
      context.canvas,
      context.cropGuide,
      context.logCrop,
      crop
    );
    context.setCropState(nextState);
    context.switchToSelectTool();
    context.commitHistory();
    return nextState;
  } catch (error) {
    restoreCropGuide();
    logger.error('apply failed', error);
    throw error;
  }
}
