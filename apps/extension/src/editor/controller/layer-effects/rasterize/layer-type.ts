import type { FabricObject } from 'fabric';

export function isEditorRasterLayerType(
  type: FabricObject['sniptaleType'] | null | undefined
): boolean {
  return type === 'image' || type === 'source-image';
}
