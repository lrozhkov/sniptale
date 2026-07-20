export type RasterPoint = { x: number; y: number };

export function sampleRasterStrokePoints(points: ReadonlyArray<RasterPoint>): RasterPoint[] {
  const sampledPoints: RasterPoint[] = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (!previous) {
      sampledPoints.push(point);
      return;
    }

    pushInterpolatedRasterPoints(sampledPoints, previous, point);
  });
  return sampledPoints;
}

function pushInterpolatedRasterPoints(
  sampledPoints: RasterPoint[],
  start: RasterPoint,
  end: RasterPoint
): void {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const steps = Math.max(1, Math.ceil(distance));
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    sampledPoints.push({
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    });
  }
}
