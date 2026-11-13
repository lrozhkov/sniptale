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
  renderEditorRasterEffects(image, nextEffects);
  image.sniptaleEffects = nextEffects;
}

function renderEditorRasterEffects(image: FabricImage, effects: EditorRasterEffect[]): void {
  const filters = effects
    .map((effect) => createEditorRasterFilter(effect))
    .filter((filter) => filter !== null);
  const previous = {
    filters: image.filters,
    element: image._element,
    filteredElement: image._filteredEl,
    dirty: image.dirty,
  };
  // Fabric clears an existing filtered canvas before its backend can fail.
  // Start from the full original so that failed work cannot clear accepted pixels.
  image._element = image._originalElement;
  delete image._filteredEl;
  image.filters = filters;
  try {
    image.applyFilters();
  } catch (error) {
    image.filters = previous.filters;
    image._element = previous.element;
    if (previous.filteredElement) image._filteredEl = previous.filteredElement;
    else delete image._filteredEl;
    image.dirty = previous.dirty;
    throw error;
  }
}

export function previewEditorRasterEffects(
  image: FabricImage,
  effects: EditorRasterEffect[] | null | undefined
): void {
  const committedEffects = cloneEditorRasterEffects(image.sniptaleEffects);
  const nextEffects = cloneEditorRasterEffects(effects);

  renderEditorRasterEffects(image, nextEffects);
  image.sniptaleEffects = committedEffects;
}

export function syncEditorRasterEffects(object: FabricObject): void {
  if (object.sniptaleRole === 'background' || !isEditorRasterObject(object)) {
    return;
  }

  applyEditorRasterEffects(object, object.sniptaleEffects);
}
