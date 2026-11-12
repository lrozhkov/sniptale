import type { Canvas } from 'fabric';
import { Group, type FabricObject } from 'fabric';
import type { EditorLayerChild, EditorLayerItem } from '../../../features/editor/document/types';
import {
  createObjectLabel,
  getEditorObjectTypeLabel,
  isSourceObject,
  isBrowserFrameObject,
  isTransparentColor,
  isUserObject,
} from '../../document/model';

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
  return (canvas?.getObjects?.() ?? []).filter(
    (object) => isUserObject(object) && !isBrowserFrameObject(object)
  );
}

export function getSourceObject(canvas: Canvas | null): FabricObject | undefined {
  return getLayerObjects(canvas).find(isSourceObject);
}

export function getObjectDimensions(object: FabricObject): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(object.getScaledWidth())),
    height: Math.max(1, Math.round(object.getScaledHeight())),
  };
}

export function collectLayers(canvas: Canvas | null): EditorLayerItem[] {
  const hasBrowserWindow = (canvas?.getObjects?.() ?? []).some(isBrowserFrameObject);
  const activeIds = new Set(
    (canvas?.getActiveObjects?.() ?? []).map((object) => object.sniptaleId)
  );
  const selectedCount = activeIds.size;
  const collectChildren = (group: Group): EditorLayerChild[] =>
    group
      .getObjects()
      .slice()
      .reverse()
      .map((child) => {
        const children =
          child instanceof Group && child.sniptaleType === 'group'
            ? collectChildren(child)
            : undefined;
        return {
          id: child.sniptaleId ?? crypto.randomUUID(),
          name: child.sniptaleLabel ?? getEditorObjectTypeLabel(child.sniptaleType ?? 'image'),
          type: child.sniptaleType ?? 'image',
          typeLabel: getEditorObjectTypeLabel(child.sniptaleType ?? 'image'),
          selected: Boolean(child.sniptaleId && activeIds.has(child.sniptaleId)),
          locked: Boolean(group.sniptaleLocked || child.sniptaleLocked),
          visible: group.visible !== false && child.visible !== false,
          containsSelection:
            children?.some((member) => member.selected || member.containsSelection) ?? false,
          ...(children ? { groupChildren: children } : {}),
        };
      });
  return getLayerObjects(canvas)
    .slice()
    .reverse()
    .map((object) => ({
      effectCount: object.sniptaleEffects?.length ?? 0,
      effects: (object.sniptaleEffects ?? []).map((effect) => ({ ...effect })),
      id: object.sniptaleId ?? crypto.randomUUID(),
      immutable: Boolean(object.sniptaleType === 'source-image'),
      reorderable: hasBrowserWindow && isSourceObject(object),
      type: object.sniptaleType ?? 'image',
      previewColor: resolveLayerPreviewColor(object),
      previewDataUrl: null,
      previewTransparent: isTransparentPreview(object),
      raster: object.sniptaleType === 'image' || object.sniptaleType === 'source-image',
      name:
        hasBrowserWindow && isSourceObject(object)
          ? getEditorObjectTypeLabel('browser-frame')
          : (object.sniptaleLabel ?? createObjectLabel(object.sniptaleType ?? 'image', 1)),
      locked: Boolean(object.sniptaleLocked),
      selected: Boolean(object.sniptaleId && activeIds.has(object.sniptaleId)),
      selectedCount,
      typeLabel:
        hasBrowserWindow && isSourceObject(object)
          ? getEditorObjectTypeLabel('browser-frame')
          : getEditorObjectTypeLabel(object.sniptaleType ?? 'image'),
      ...(object instanceof Group && object.sniptaleType === 'group'
        ? {
            groupSize: object.getObjects().length,
            containsSelection: collectChildren(object).some(
              (child) => child.selected || child.containsSelection
            ),
            groupChildren: collectChildren(object),
          }
        : {}),
      visible: object.visible !== false,
    }));
}
