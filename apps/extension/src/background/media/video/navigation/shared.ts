import { createLogger } from '@sniptale/platform/observability/logger';

export const VIEWPORT_NAVIGATION_SETTLE_MS = 150;
export const VIEWPORT_NAVIGATION_REFRESH_RETRY_LIMIT = 1;

export const logger = createLogger({ namespace: 'BackgroundVideoManagerNavigation' });

export function resolveViewportPixelBounds(emulation: { cssWidth: number; cssHeight: number }) {
  return {
    width: Math.max(1, Math.round(emulation.cssWidth)),
    height: Math.max(1, Math.round(emulation.cssHeight)),
  };
}

export async function waitForViewportSettle(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
