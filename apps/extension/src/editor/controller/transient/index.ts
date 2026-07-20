import {
  type FabricObject,
  type ObjectEvents,
  Rect,
  type RectProps,
  type SerializedRectProps,
  type TOptions,
} from 'fabric';
import { applyTextLayout } from '../../objects/annotation/text/layout';
import { isCompletedDrawSessionTooSmall } from '../drawing';
import { isEditorDrawSessionLifecycleClick } from '../drawing/tool-lifecycle';
import {
  configureCropGuideForEditing,
  createCropSelectionFromRect,
  normalizeEditorCropSelection,
} from '../tools/crop';
import {
  cancelEditorCropDrawSession,
  clearEditorCropGuide,
  startEditorDrawSession,
} from './draw-session';
import type { CropSelection, DrawSession } from '../core/types';

type RectInstance = Rect<TOptions<RectProps>, SerializedRectProps, ObjectEvents>;

type EditorDrawSessionCompletion =
  | {
      kind: 'discard';
      drawSession: null;
    }
  | {
      kind: 'crop';
      drawSession: null;
      cropGuide: RectInstance;
      cropSelection: CropSelection;
    }
  | {
      kind: 'complete';
      drawSession: null;
      completedTool: DrawSession['tool'];
      object: FabricObject;
    };

function completeTextDrawSession(
  drawSession: DrawSession,
  minDrawSize: number,
  object: FabricObject
): EditorDrawSessionCompletion {
  const isLifecycleClick =
    isEditorDrawSessionLifecycleClick(drawSession, minDrawSize) ??
    isCompletedDrawSessionTooSmall(drawSession, minDrawSize);

  applyTextLayout(object as import('fabric').Textbox, {
    layoutMode: isLifecycleClick ? 'auto' : 'fixed-width',
  });

  return {
    kind: 'complete',
    drawSession: null,
    completedTool: drawSession.tool,
    object,
  };
}

function completeCropDrawSession(
  canvasDocumentSize: { width: number; height: number },
  object: FabricObject
): EditorDrawSessionCompletion {
  const cropGuide = object as RectInstance;
  configureCropGuideForEditing(cropGuide);

  return {
    kind: 'crop',
    drawSession: null,
    cropGuide,
    cropSelection: normalizeEditorCropSelection(
      createCropSelectionFromRect(cropGuide),
      canvasDocumentSize
    ),
  };
}

export function completeEditorDrawSession(options: {
  drawSession: DrawSession;
  canvasDocumentSize: { width: number; height: number };
  minDrawSize: number;
}): EditorDrawSessionCompletion {
  const object = options.drawSession.object;
  if (!object) {
    return {
      kind: 'discard',
      drawSession: null,
    };
  }

  if (options.drawSession.tool === 'text' && object.type === 'textbox') {
    return completeTextDrawSession(options.drawSession, options.minDrawSize, object);
  }

  if (isCompletedDrawSessionTooSmall(options.drawSession, options.minDrawSize)) {
    return {
      kind: 'discard',
      drawSession: null,
    };
  }

  if (options.drawSession.tool === 'crop' && object instanceof Rect) {
    return completeCropDrawSession(options.canvasDocumentSize, object);
  }

  return {
    kind: 'complete',
    drawSession: null,
    completedTool: options.drawSession.tool,
    object,
  };
}

export { clearEditorCropGuide, cancelEditorCropDrawSession, startEditorDrawSession };
