import { type Canvas, type FabricObject } from 'fabric';

export function isManagedBackgroundObject(object: FabricObject): boolean {
  return object.sniptaleType === 'background' || object.sniptaleRole === 'background';
}

export function findBackgroundLayer(canvas: Canvas): FabricObject | undefined {
  return canvas.getObjects().find(isManagedBackgroundObject);
}
