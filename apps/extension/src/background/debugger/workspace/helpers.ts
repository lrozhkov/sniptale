export interface ViewportEmulationResult {
  cssWidth: number;
  cssHeight: number;
}

export function buildViewportEmulationResult(value: unknown): ViewportEmulationResult {
  if (!isRecord(value)) return unavailableViewportMetrics();
  if (isPositiveInteger(value['width']) && isPositiveInteger(value['height'])) {
    return {
      cssWidth: value['width'],
      cssHeight: value['height'],
    };
  }
  return unavailableViewportMetrics();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function unavailableViewportMetrics(): never {
  throw new Error(
    'Viewport verification failed: window.innerWidth/window.innerHeight are unavailable'
  );
}
