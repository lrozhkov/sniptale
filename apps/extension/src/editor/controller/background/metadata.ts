import { FabricImage, type FabricObject } from 'fabric';

import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { createObjectLabel } from '../../document/model';
import { isManagedBackgroundObject } from './identity';

export function assignBackgroundMetadata(object: FabricObject, frame: EditorFrameSettings): void {
  object.sniptaleRole = 'background';
  object.sniptaleType = 'background';
  object.sniptaleBackgroundMode = frame.backgroundMode;
  object.sniptaleBackgroundFit = frame.backgroundImageFit;
  object.sniptaleBackgroundImageData = frame.backgroundImageData;
  object.sniptaleBackgroundColor = frame.backgroundColor;
  object.sniptaleBackgroundGradientFrom = frame.backgroundGradientFrom;
  object.sniptaleBackgroundGradientTo = frame.backgroundGradientTo;
  object.sniptaleBackgroundGradientStops = frame.backgroundGradientStops;
  object.sniptaleBackgroundGradientColorStops = frame.backgroundGradientColorStops;
  object.sniptaleBackgroundGradientAngle = frame.backgroundGradientAngle;
}

export function preserveBackgroundLayerState(
  next: FabricObject,
  previous: FabricObject | undefined
): void {
  next.sniptaleId = previous?.sniptaleId ?? crypto.randomUUID();
  next.sniptaleLabel = previous?.sniptaleLabel ?? createObjectLabel('background', 1);
  next.sniptaleLocked = previous?.sniptaleLocked ?? true;
  next.visible = previous?.visible ?? true;
}

export function convertBackgroundDuplicateToAnnotation(object: FabricObject): void {
  if (!isManagedBackgroundObject(object)) {
    return;
  }

  object.sniptaleRole = 'annotation';
  object.sniptaleType = object instanceof FabricImage ? 'image' : 'rectangle';
  Reflect.deleteProperty(object, 'sniptaleBackgroundMode');
  Reflect.deleteProperty(object, 'sniptaleBackgroundFit');
  Reflect.deleteProperty(object, 'sniptaleBackgroundImageData');
  Reflect.deleteProperty(object, 'sniptaleBackgroundColor');
  Reflect.deleteProperty(object, 'sniptaleBackgroundGradientFrom');
  Reflect.deleteProperty(object, 'sniptaleBackgroundGradientTo');
  Reflect.deleteProperty(object, 'sniptaleBackgroundGradientStops');
  Reflect.deleteProperty(object, 'sniptaleBackgroundGradientColorStops');
  Reflect.deleteProperty(object, 'sniptaleBackgroundGradientAngle');
}
