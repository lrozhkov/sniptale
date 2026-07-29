import { browserScripting } from '@sniptale/platform/browser/scripting';

type ViewportCapacity = { width: number; height: number };

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function parseViewportCapacity(value: unknown): ViewportCapacity {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('width' in value) ||
    !('height' in value) ||
    !isPositiveFiniteNumber(value.width) ||
    !isPositiveFiniteNumber(value.height)
  ) {
    throw new Error('Content viewport metrics are unavailable');
  }
  return { width: Math.floor(value.width), height: Math.floor(value.height) };
}

export async function readViewportCapacity(tabId: number): Promise<ViewportCapacity> {
  const results = await browserScripting.executeScript({
    target: { tabId },
    func: () => ({ width: window.innerWidth, height: window.innerHeight }),
  });
  return parseViewportCapacity(results?.[0]?.result);
}
