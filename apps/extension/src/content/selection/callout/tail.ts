export function getCalloutTailMetrics(tailSize: number) {
  return {
    baseSpan: Math.max(14, Math.round(tailSize * 2.2)),
    projection: Math.max(10, Math.round(tailSize * 1.15)),
  };
}
