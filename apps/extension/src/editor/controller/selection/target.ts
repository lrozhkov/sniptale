import type { FabricObject } from 'fabric';

type SelectionCanvas = {
  getActiveObject?: () => FabricObject | null | undefined;
  getActiveObjects?: () => FabricObject[];
};

type SelectionTarget = FabricObject & {
  sniptaleId?: string;
};

export function isTargetInCurrentSelection(
  canvas: SelectionCanvas,
  target?: SelectionTarget | null
): boolean {
  if (!target) {
    return false;
  }

  const activeObject = canvas.getActiveObject?.() ?? null;
  const activeObjects = canvas.getActiveObjects?.() ?? [];
  if (target === activeObject || activeObjects.some((object) => object === target)) {
    return true;
  }

  if (!target.sniptaleId) {
    return false;
  }

  return [activeObject, ...activeObjects].some(
    (object) => object?.sniptaleId === target.sniptaleId
  );
}
