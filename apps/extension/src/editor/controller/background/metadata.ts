import {
  EDITOR_RASTER_BINARY_FIELDS,
  parseEditorRasterMetadata,
} from '../../../features/editor/document/raster-state';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { FabricImage, util, type FabricObject } from 'fabric';

import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { applyImageSettings, readImageSettingsFromObject } from '../../objects/image-style';
import { createObjectLabel } from '../../document/model';
import { isManagedBackgroundObject } from './identity';

export function assignBackgroundMetadata(object: FabricObject, frame: EditorFrameSettings): void {
  object.sniptaleRole = 'background';
  object.sniptaleType = 'background';
  object.sniptaleBackgroundMode = frame.backgroundMode;
  object.sniptaleBackgroundBlurAmount = frame.backgroundBlurAmount;
  object.sniptaleBackgroundFit = frame.backgroundImageFit;
  object.sniptaleBackgroundImageData = frame.backgroundImageData;
  object.sniptaleBackgroundColor = frame.backgroundColor;
  object.sniptaleBackgroundGradientFrom = frame.backgroundGradientFrom;
  object.sniptaleBackgroundGradientTo = frame.backgroundGradientTo;
  object.sniptaleBackgroundGradientStops = frame.backgroundGradientStops;
  object.sniptaleBackgroundGradientColorStops = frame.backgroundGradientColorStops;
  object.sniptaleBackgroundGradient = frame.backgroundGradient;
  object.sniptaleBackgroundGradientAngle = frame.backgroundGradientAngle;
}

/** Retain accepted styling; pixel/correction publication also keeps the native pose. */
export function preserveBackgroundImageAppearance(
  next: FabricObject,
  previous: FabricObject,
  preservePose = false
): void {
  if (previous.sniptaleImageOpacity !== undefined)
    applyImageSettings(next, readImageSettingsFromObject(previous));
  next.set({
    opacity: previous.opacity,
    shadow: previous.shadow,
    stroke: previous.stroke,
    strokeWidth: previous.strokeWidth,
    strokeDashArray: previous.strokeDashArray,
    strokeDashOffset: previous.strokeDashOffset,
    strokeUniform: previous.strokeUniform,
    paintFirst: previous.paintFirst,
    globalCompositeOperation: previous.globalCompositeOperation,
    clipPath: previous.clipPath,
  });
  if (preservePose)
    next.set({
      ...util.saveObjectTransform(previous),
      originX: previous.originX,
      originY: previous.originY,
    });
}

export function preserveBackgroundLayerState(
  next: FabricObject,
  previous: FabricObject | undefined
): void {
  for (const field of [...EDITOR_RASTER_BINARY_FIELDS, 'sniptaleRasterState']) {
    Reflect.deleteProperty(next, field);
  }
  Reflect.deleteProperty(next, 'sniptaleEffects');
  next.set({ flipX: false, flipY: false });
  if (
    previous &&
    next.sniptaleBackgroundMode === 'image' &&
    previous.sniptaleBackgroundMode === 'image' &&
    next.sniptaleBackgroundImageData === previous.sniptaleBackgroundImageData
  ) {
    const metadata = parseEditorRasterMetadata(
      previous,
      (value, kind): value is string =>
        isImageDataUrl(value) && (kind === 'image' || value.startsWith('data:image/png;'))
    );
    if (metadata) Object.assign(next, metadata);
    preserveBackgroundImageAppearance(next, previous);
    if (previous.sniptaleEffects)
      next.sniptaleEffects = previous.sniptaleEffects.map((effect) => ({ ...effect }));
    next.set({ flipX: previous.flipX, flipY: previous.flipY });
  }
  next.sniptaleId = previous?.sniptaleId ?? crypto.randomUUID();
  next.sniptaleLabel = previous?.sniptaleLabel ?? createObjectLabel('background', 1);
  next.sniptaleLocked = previous?.sniptaleLocked ?? true;
  next.visible = previous?.visible ?? true;
  if (previous?.sniptaleContentLocked !== undefined)
    next.sniptaleContentLocked = previous.sniptaleContentLocked;
  else Reflect.deleteProperty(next, 'sniptaleContentLocked');
}

export function convertBackgroundDuplicateToAnnotation(object: FabricObject): void {
  if (!isManagedBackgroundObject(object)) {
    return;
  }

  object.sniptaleRole = 'annotation';
  object.sniptaleType = object instanceof FabricImage ? 'image' : 'shape';
  Reflect.deleteProperty(object, 'sniptaleBackgroundMode');
  Reflect.deleteProperty(object, 'sniptaleBackgroundBlurAmount');
  Reflect.deleteProperty(object, 'sniptaleBackgroundFit');
  Reflect.deleteProperty(object, 'sniptaleBackgroundImageData');
  Reflect.deleteProperty(object, 'sniptaleBackgroundColor');
  Reflect.deleteProperty(object, 'sniptaleBackgroundGradientFrom');
  Reflect.deleteProperty(object, 'sniptaleBackgroundGradientTo');
  Reflect.deleteProperty(object, 'sniptaleBackgroundGradientStops');
  Reflect.deleteProperty(object, 'sniptaleBackgroundGradientColorStops');
  Reflect.deleteProperty(object, 'sniptaleBackgroundGradientAngle');
  Reflect.deleteProperty(object, 'sniptaleBackgroundGradient');
}
