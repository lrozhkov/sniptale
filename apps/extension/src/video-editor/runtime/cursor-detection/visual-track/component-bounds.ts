export interface PixelComponentBounds {
  area: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

export function addPixelToComponentBounds(
  component: PixelComponentBounds,
  x: number,
  y: number
): void {
  component.area += 1;
  component.minX = Math.min(component.minX, x);
  component.minY = Math.min(component.minY, y);
  component.maxX = Math.max(component.maxX, x);
  component.maxY = Math.max(component.maxY, y);
}
