import type { ViewportSize } from 'playwright';

/** Primary application viewports in CSS pixels; additional sizes are opt-in focused checks. */
export const PRIMARY_BROWSER_VIEWPORTS = [
  { name: '1280x560', size: { width: 1280, height: 560 } },
  { name: '1920x900', size: { width: 1920, height: 900 } },
] as const;

/** Extra desktop coverage selected for focused runs rather than multiplying the default suite. */
export const ADDITIONAL_BROWSER_VIEWPORTS = [
  { name: '1366x600', size: { width: 1366, height: 600 } },
  { name: '1536x700', size: { width: 1536, height: 700 } },
  { name: '2560x1280', size: { width: 2560, height: 1280 } },
] as const;

/** Resolves one run default without replacing explicit test or page viewport choices. */
export function resolveBrowserViewport(
  requested = process.env.SNIPTALE_E2E_VIEWPORT
): ViewportSize {
  const presets = [...PRIMARY_BROWSER_VIEWPORTS, ...ADDITIONAL_BROWSER_VIEWPORTS];
  const preset = presets.find((entry) => entry.name === (requested ?? '1920x900'));
  if (!preset)
    throw new Error(
      `SNIPTALE_E2E_VIEWPORT must be one of: ${presets.map((entry) => entry.name).join(', ')}.`
    );
  return { ...preset.size };
}
