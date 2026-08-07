import type { Canvas } from 'fabric';

export function createFabricCanvasFixture(value: object): Canvas {
  return value as unknown as Canvas;
}

export function createTypedTestFixture<T>(value: object): T {
  return value as T;
}
