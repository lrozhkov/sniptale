import { FabricImage, type FabricObject } from 'fabric';
import type { EditorRasterEffect } from '../../../features/editor/document/effects';
import { createEditorRasterFilter } from './filter-catalog';

export function isEditorRasterObject(
  object: FabricObject | null | undefined
): object is FabricImage {
  return object instanceof FabricImage;
}

function cloneEditorRasterEffects(effects: EditorRasterEffect[] | null | undefined) {
  return (effects ?? []).map((effect) => ({ ...effect }));
}

export function applyEditorRasterEffects(
  image: FabricImage,
  effects: EditorRasterEffect[] | null | undefined
): void {
  const nextEffects = cloneEditorRasterEffects(effects);
  image.sniptaleEffects = nextEffects;
  image.filters = nextEffects
    .map((effect) => createEditorRasterFilter(effect))
    .filter((filter) => filter !== null);
  image.applyFilters();
}

export function previewEditorRasterEffects(
  image: FabricImage,
  effects: EditorRasterEffect[] | null | undefined
): void {
  const committedEffects = cloneEditorRasterEffects(image.sniptaleEffects);
  const nextEffects = cloneEditorRasterEffects(effects);

  image.filters = nextEffects
    .map((effect) => createEditorRasterFilter(effect))
    .filter((filter) => filter !== null);
  image.applyFilters();
  image.sniptaleEffects = committedEffects;
}

export function syncEditorRasterEffects(object: FabricObject): void {
  if (!isEditorRasterObject(object)) {
    return;
  }

  applyEditorRasterEffects(object, object.sniptaleEffects);
}
