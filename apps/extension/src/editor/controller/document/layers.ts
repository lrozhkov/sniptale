import type { Canvas } from 'fabric';
import { FabricImage, type FabricObject } from 'fabric';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { getTextCalloutDimensions } from '../../objects/annotation/text/callout/dimensions';
import { isTextbox } from '../core/helpers';
import {
  createObjectLabel,
  getEditorObjectTypeLabel,
  isSourceObject,
  isTransparentColor,
  isUserObject,
} from '../../document/model';

function resolveLayerPreviewDataUrl(object: FabricObject): string | null {
  if (object.sniptaleBackgroundImageData) {
    return object.sniptaleBackgroundImageData;
  }

  if (!(object instanceof FabricImage)) {
    return null;
  }

  const imageElement = object.getElement();
  if (imageElement instanceof HTMLImageElement) {
    return imageElement.currentSrc || imageElement.src || null;
  }

  return imageElement instanceof HTMLCanvasElement ? imageElement.toDataURL() : null;
}

function resolveLayerPreviewColor(object: FabricObject): string | null {
  if (object.sniptaleBackgroundMode === 'color' && object.sniptaleBackgroundColor) {
    return object.sniptaleBackgroundColor;
  }

  if (typeof object.fill === 'string' && object.fill.trim().length > 0) {
    return object.fill;
  }

  return typeof object.stroke === 'string' && object.stroke.trim().length > 0
    ? object.stroke
    : null;
}

function isTransparentPreview(object: FabricObject): boolean {
  const color = resolveLayerPreviewColor(object);
  return isSourceObject(object) || object.sniptaleType === 'image' || isTransparentColor(color);
}

export function findObjectById(canvas: Canvas | null, id: string): FabricObject | undefined {
  return canvas?.getObjects?.().find((object) => object.sniptaleId === id);
}

export function getLayerObjects(canvas: Canvas | null): FabricObject[] {
  return (canvas?.getObjects?.() ?? []).filter(isUserObject);
}

export function getSourceObject(canvas: Canvas | null): FabricObject | undefined {
  return getLayerObjects(canvas).find(isSourceObject);
}

export function getObjectDimensions(object: FabricObject): { width: number; height: number } {
  if (
    isTextbox(object) &&
    (object.sniptaleType === 'text' || object.sniptaleType === 'meta-stamp')
  ) {
    const dimensions = getTextCalloutDimensions(object);
    return {
      width: Math.max(1, Math.round(dimensions.width)),
      height: Math.max(1, Math.round(dimensions.height)),
    };
  }

  return {
    width: Math.max(1, Math.round(object.getScaledWidth())),
    height: Math.max(1, Math.round(object.getScaledHeight())),
  };
}

export function collectLayers(canvas: Canvas | null): EditorLayerItem[] {
  const activeIds = new Set(
    (canvas?.getActiveObjects?.() ?? []).map((object) => object.sniptaleId)
  );
  const selectedCount = activeIds.size;
  return getLayerObjects(canvas)
    .slice()
    .reverse()
    .map((object) => ({
      effectCount: object.sniptaleEffects?.length ?? 0,
      effects: (object.sniptaleEffects ?? []).map((effect) => ({ ...effect })),
      id: object.sniptaleId ?? crypto.randomUUID(),
      immutable: Boolean(object.sniptaleType === 'source-image'),
      type: object.sniptaleType ?? 'image',
      previewColor: resolveLayerPreviewColor(object),
      previewDataUrl: resolveLayerPreviewDataUrl(object),
      previewTransparent: isTransparentPreview(object),
      raster: object.sniptaleType === 'image' || object.sniptaleType === 'source-image',
      name: object.sniptaleLabel ?? createObjectLabel(object.sniptaleType ?? 'image', 1),
      locked: Boolean(object.sniptaleLocked),
      selected: Boolean(object.sniptaleId && activeIds.has(object.sniptaleId)),
      selectedCount,
      typeLabel: getEditorObjectTypeLabel(object.sniptaleType ?? 'image'),
      visible: object.visible !== false,
    }));
}
