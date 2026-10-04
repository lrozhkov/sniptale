import { expect, type Page, type ViewportSize } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import {
  applyHarnessBootstrap,
  SCENARIO_EDITOR_VISUAL_HARNESS_PATH,
} from '../extension-critical.helpers';

export const SCENARIO_VISUAL_THEMES = ['light', 'dark'] as const;
export const SCENARIO_VISUAL_LOCALES = ['ru', 'en'] as const;
export const SCENARIO_VISUAL_VIEWPORTS: Array<{ name: string; size: ViewportSize }> =
  PRIMARY_BROWSER_VIEWPORTS.map(({ name, size }) => ({ name, size: { ...size } }));

export function createPageIssueCollector(page: Page) {
  const issues: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(message.text());
  });
  page.on('pageerror', (error) => issues.push(error.message));
  return { assertClean: () => expect(issues.splice(0)).toEqual([]) };
}

export async function openVisualHarness(
  page: Page,
  hostOrigin: string,
  theme: 'light' | 'dark',
  locale: 'ru' | 'en',
  viewport?: ViewportSize,
  stepId = 'compare',
  extraParams?: Record<string, string>
) {
  const url = new URL(`${hostOrigin}${SCENARIO_EDITOR_VISUAL_HARNESS_PATH}`);
  url.searchParams.set('projectId', `guide-${crypto.randomUUID()}`);
  url.searchParams.set('theme', theme);
  url.searchParams.set('locale', locale);
  url.searchParams.set('stepId', stepId);
  for (const [key, value] of Object.entries(extraParams ?? {})) url.searchParams.set(key, value);
  if (viewport) await page.setViewportSize(viewport);
  await applyHarnessBootstrap(page, { preserveMediaLibrary: true });
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main article')).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page
        .locator('main img')
        .evaluateAll(
          (images) =>
            images.length === 2 &&
            images.every(
              (image) =>
                image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
            )
        )
    )
    .toBe(true);
}
