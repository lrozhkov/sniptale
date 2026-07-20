type ExcalidrawPointBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
};

export function measureExcalidrawPoints(
  points: readonly (readonly [number, number])[]
): ExcalidrawPointBounds {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}
