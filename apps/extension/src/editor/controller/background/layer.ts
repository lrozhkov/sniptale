import { type Canvas, type FabricObject } from 'fabric';

export function replaceBackgroundLayer(
  canvas: Canvas,
  previous: FabricObject | undefined,
  next: FabricObject
): void {
  const previousIndex = previous ? canvas.getObjects().indexOf(previous) : -1;
  if (previous) {
    canvas.remove(previous);
  }

  canvas.add(next);
  if (previousIndex >= 0) {
    canvas.moveObjectTo(next, previousIndex);
    return;
  }

  canvas.sendObjectToBack(next);
}
