import type { Rect } from 'fabric';
import {
  type Canvas,
  type FabricObject,
  type ObjectEvents,
  type Point,
  type RectProps,
  type SerializedRectProps,
  type TOptions,
} from 'fabric';
import type { CropSelection, DrawSession } from '../core/types';

type RectInstance = Rect<TOptions<RectProps>, SerializedRectProps, ObjectEvents>;

export function clearEditorCropGuide(options: { canvas: Canvas; cropGuide: RectInstance | null }): {
  changed: boolean;
  cropGuide: null;
  cropSelection: null;
} {
  if (!options.cropGuide) {
    return {
      changed: false,
      cropGuide: null,
      cropSelection: null,
    };
  }

  if (options.canvas.getActiveObject() === options.cropGuide) {
    options.canvas.discardActiveObject();
  }
  options.canvas.remove(options.cropGuide);
  return {
    changed: true,
    cropGuide: null,
    cropSelection: null,
  };
}

export function cancelEditorCropDrawSession(options: {
  canvas: Canvas;
  drawSession: DrawSession | null;
}): {
  changed: boolean;
  drawSession: null;
  cropSelection: null;
} {
  if (options.drawSession?.tool !== 'crop' || !options.drawSession.object) {
    return {
      changed: false,
      drawSession: null,
      cropSelection: null,
    };
  }

  options.canvas.remove(options.drawSession.object);
  return {
    changed: true,
    drawSession: null,
    cropSelection: null,
  };
}

export function startEditorDrawSession(options: {
  canvas: Canvas;
  tool: DrawSession['tool'];
  start: Point;
  object: FabricObject;
  cropGuide: RectInstance | null;
}): {
  drawSession: DrawSession;
  cropGuide: RectInstance | null;
  cropSelection: CropSelection | null;
  clearedExistingCropGuide: boolean;
} {
  let cropGuide = options.cropGuide;
  let clearedExistingCropGuide = false;

  if (options.tool === 'crop' && cropGuide) {
    if (options.canvas.getActiveObject() === cropGuide) {
      options.canvas.discardActiveObject();
    }
    options.canvas.remove(cropGuide);
    cropGuide = null;
    clearedExistingCropGuide = true;
  }

  return {
    drawSession: {
      tool: options.tool,
      start: options.start,
      lastPoint: options.start,
      objectId: options.object.sniptaleId ?? crypto.randomUUID(),
      object: options.object,
    },
    cropGuide,
    cropSelection: null,
    clearedExistingCropGuide,
  };
}
