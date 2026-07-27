export function createCanvasContextStub(
  overrides: Partial<CanvasRenderingContext2D>
): CanvasRenderingContext2D {
  return overrides as CanvasRenderingContext2D;
}
