import {
  type FabricObject,
  type ObjectEvents,
  Rect,
  type RectProps,
  type SerializedRectProps,
  type TOptions,
} from 'fabric';
import {
  applyCropGuideSelection,
  createCropSelectionFromRect,
  normalizeEditorCropSelection,
  normalizeEditorFreeCanvasSelection,
} from '../tools/crop';
import {
  cancelEditorCropDrawSession,
  clearEditorCropGuide,
  startEditorDrawSession,
} from './draw-session';
import type { CropSelection, DrawSession } from '../core/types';
import type { EditorWorkspaceInsets } from '../../document/canvas-surface/workspace-extent';

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
  object: FabricObject
): EditorDrawSessionCompletion {
  return {
    kind: 'complete',
    drawSession: null,
    completedTool: drawSession.tool,
    object,
  };
}

function completeCropDrawSession(
  canvasDocumentSize: { width: number; height: number },
  object: FabricObject,
  mode: 'crop' | 'expand',
  zoom: number,
  workspaceInsets?: EditorWorkspaceInsets
): EditorDrawSessionCompletion {
  const cropGuide = object as RectInstance;
  const rawSelection = createCropSelectionFromRect(cropGuide);
  const cropSelection =
    mode === 'expand'
      ? normalizeEditorFreeCanvasSelection(rawSelection, canvasDocumentSize, zoom, workspaceInsets)
      : normalizeEditorCropSelection(rawSelection, canvasDocumentSize);
  applyCropGuideSelection(cropGuide, cropSelection, 'selection');
  cropGuide.hasBorders = false;

  return {
    kind: 'crop',
    drawSession: null,
    cropGuide,
    cropSelection,
  };
}

function isUndersizedPointerDraw(drawSession: DrawSession, minDrawSize: number): boolean {
  const { start, lastPoint, tool } = drawSession;
  return Boolean(
    lastPoint &&
    (tool === 'crop' || tool === 'shape' || tool === 'arrow' || tool === 'blur') &&
    Math.max(Math.abs(lastPoint.x - start.x), Math.abs(lastPoint.y - start.y)) < minDrawSize
  );
}

export function completeEditorDrawSession(options: {
  drawSession: DrawSession;
  canvasDocumentSize: { width: number; height: number };
  minDrawSize: number;
  cropMode?: 'crop' | 'expand';
  zoom?: number;
  workspaceInsets?: EditorWorkspaceInsets;
}): EditorDrawSessionCompletion {
  const object = options.drawSession.object;
  if (!object) {
    return {
      kind: 'discard',
      drawSession: null,
    };
  }

  if (options.drawSession.tool === 'text' && object.type === 'textbox') {
    return completeTextDrawSession(options.drawSession, object);
  }

  if (isUndersizedPointerDraw(options.drawSession, options.minDrawSize)) {
    return { kind: 'discard', drawSession: null };
  }

  if (
    options.drawSession.tool !== 'crop' &&
    options.drawSession.tool !== 'pencil' &&
    options.drawSession.tool !== 'marker' &&
    Math.max(object.getScaledWidth(), object.getScaledHeight()) < options.minDrawSize
  ) {
    return {
      kind: 'discard',
      drawSession: null,
    };
  }

  if (options.drawSession.tool === 'crop' && object instanceof Rect) {
    return completeCropDrawSession(
      options.canvasDocumentSize,
      object,
      options.cropMode ?? 'crop',
      options.zoom ?? 1,
      options.workspaceInsets
    );
  }

  return {
    kind: 'complete',
    drawSession: null,
    completedTool: options.drawSession.tool,
    object,
  };
}

export { clearEditorCropGuide, cancelEditorCropDrawSession, startEditorDrawSession };
