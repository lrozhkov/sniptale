import type { FabricObject } from 'fabric';
import type { EditorRichShapeDocumentObject } from '../../../features/editor/document/rich-shape';
import { createRoughPathObjects, createRoughPolylineObjects } from './rough-primitives';
import type { CanvasPoint } from './rough-types';
import type { RichShapeRenderableStyle } from './style/renderable';

function tryCreateRoughPathObjects(
  options: Parameters<typeof createRoughPathObjects>[0]
): FabricObject[] | null {
  if (!options.shape.rough.enabled) {
    return null;
  }
  try {
    const objects = createRoughPathObjects(options);
    return objects.length > 0 ? objects : null;
  } catch {
    return null;
  }
}

export function tryCreateRoughPath(
  shape: EditorRichShapeDocumentObject,
  style: RichShapeRenderableStyle,
  path: string,
  seedOffset: number
): FabricObject[] | null {
  return tryCreateRoughPathObjects({ path, seedOffset, shape, style });
}

function tryCreateRoughPolylineObjects(
  options: Parameters<typeof createRoughPolylineObjects>[0]
): FabricObject[] | null {
  if (!options.shape.rough.enabled) {
    return null;
  }
  try {
    const objects = createRoughPolylineObjects(options);
    return objects.length > 0 ? objects : null;
  } catch {
    return null;
  }
}

export function tryCreateRoughPolyline(
  shape: EditorRichShapeDocumentObject,
  style: RichShapeRenderableStyle,
  points: CanvasPoint[],
  closed: boolean
): FabricObject[] | null {
  return tryCreateRoughPolylineObjects({
    closed,
    points: points.map((point) => [point.x, point.y]),
    seedOffset: 0,
    shape,
    style,
  });
}
