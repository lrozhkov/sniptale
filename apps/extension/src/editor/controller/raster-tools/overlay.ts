import type { Canvas } from 'fabric';
import type { EditorRasterToolSessionState } from './types';
import { drawBrushDraft, drawEraserDraft, drawHoverCursor } from './overlay-paint-drafts';
import { drawGradientDraft, drawLassoDraft, drawMarqueeDraft } from './overlay-region-drafts';
import { drawSelectionMask } from './overlay-selection';
import { applySceneToOverlayTransform } from './overlay-transform';

export function renderEditorRasterOverlay(args: {
  canvas: Canvas | null;
  context: CanvasRenderingContext2D;
  session: EditorRasterToolSessionState;
  size: { width: number; height: number };
}): void {
  const { context, size } = args;
  context.clearRect(0, 0, size.width, size.height);
  context.save();
  applySceneToOverlayTransform(args);

  try {
    if (args.session.selection) {
      drawSelectionMask(args);
    }
    if (args.session.marqueeDraft) {
      drawMarqueeDraft(context, args.session.marqueeDraft);
    }
    if (args.session.lassoDraft) {
      drawLassoDraft(context, args.session.lassoDraft);
    }
    if (args.session.gradientDraft) {
      drawGradientDraft(context, args.session.gradientDraft);
    }
    if (args.session.eraserDraft) {
      drawEraserDraft(context, args.session.eraserDraft);
    }
    if (args.session.brushDraft) {
      drawBrushDraft(context, args.session.brushDraft);
    }
    if (args.session.hoverCursor) {
      drawHoverCursor(context, args.session.hoverCursor);
    }
  } finally {
    context.restore();
  }
}
