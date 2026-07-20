import { expect, type Page, type ViewportSize } from '@playwright/test';
import { translate } from '../../../apps/extension/src/platform/i18n';
import { SCENARIO_VISUAL_BASELINE_SLIDE_IDS } from '../../../apps/extension/src/scenario-editor/workspace/visual-baseline/fixtures';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from './extension-critical.helpers';

export { assertVisualAcceptance } from './scenario-editor-visual.assertions';

export type ThemeName = 'dark' | 'light';
export type SurfaceName = 'editor' | 'overview' | 'play' | 'presenter';

export type VisualSurfaceCase = {
  name: SurfaceName;
  screenshotName: string;
  slideId: string;
};

function createSurfaceCase(
  name: SurfaceName,
  screenshotName: string,
  slideId: string
): VisualSurfaceCase {
  return { name, screenshotName, slideId };
}

export const SCENARIO_VISUAL_THEMES: ThemeName[] = ['light', 'dark'];
export const SCENARIO_VISUAL_VIEWPORTS: Array<{ name: string; size: ViewportSize }> = [
  { name: 'qhd', size: { height: 1440, width: 2560 } },
  { name: 'desktop', size: { height: 1080, width: 1920 } },
  { name: 'hd', size: { height: 720, width: 1280 } },
];

export const SCENARIO_VISUAL_SURFACES: VisualSurfaceCase[] = [
  createSurfaceCase(
    'editor',
    'editor-captured-app',
    SCENARIO_VISUAL_BASELINE_SLIDE_IDS.capturedApp
  ),
  createSurfaceCase('play', 'play-build-step', SCENARIO_VISUAL_BASELINE_SLIDE_IDS.stepTwoBuild),
  createSurfaceCase(
    'presenter',
    'presenter-build-step',
    SCENARIO_VISUAL_BASELINE_SLIDE_IDS.stepTwoBuild
  ),
  createSurfaceCase('overview', 'overview-deck', SCENARIO_VISUAL_BASELINE_SLIDE_IDS.capturedApp),
];

const MODE_LABELS: Record<SurfaceName, string> = {
  editor: translate('scenario.editor.modeEdit', 'ru'),
  overview: translate('scenario.editor.modeOverview', 'ru'),
  play: translate('scenario.editor.modePlay', 'ru'),
  presenter: translate('scenario.editor.modePresenter', 'ru'),
};

export function createPageIssueCollector(page: Page) {
  const issues: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    issues.push(`pageerror: ${error.message}`);
  });

  return {
    assertClean() {
      const nextIssues = issues.splice(0);
      expect(nextIssues).toEqual([]);
    },
  };
}

export async function openVisualHarness(
  page: Page,
  hostOrigin: string,
  theme: ThemeName,
  viewport: ViewportSize,
  slideId: string
): Promise<void> {
  const url = new URL(`${hostOrigin}${SCENARIO_EDITOR_VISUAL_HARNESS_PATH}`);
  url.searchParams.set('theme', theme);
  url.searchParams.set('slide', slideId);

  await page.setViewportSize(viewport);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="scenario.v3-shell.root"]').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
}

export async function selectSurfaceMode(page: Page, surface: SurfaceName): Promise<void> {
  await page.getByRole('button', { name: MODE_LABELS[surface], exact: true }).click();
  await page.locator(getSurfaceSelector(surface)).waitFor({ state: 'visible' });
}

function getSurfaceSelector(surface: SurfaceName): string {
  switch (surface) {
    case 'editor':
      return '[data-ui="scenario.canvas.stage"]';
    case 'overview':
      return '[data-ui="scenario.editor.v3.overview"]';
    case 'play':
      return '[data-ui="scenario.editor.v3.play"]';
    case 'presenter':
      return '[data-ui="scenario.editor.v3.presenter"]';
  }
}

export async function waitForScenarioVisualStability(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(hasMissingImagePlaceholder)).toBe(false);
  await expect.poll(() => countVisibleCanvasImages(page)).toBeGreaterThan(0);
}

function hasMissingImagePlaceholder(): boolean {
  const bodyText = document.body.textContent ?? '';
  return (
    bodyText.includes('Missing image') ||
    bodyText.includes('Missing asset') ||
    bodyText.includes('изображений недоступна')
  );
}

async function countVisibleCanvasImages(page: Page): Promise<number> {
  return page.evaluate(() => {
    const getVisibleCanvasImages = () => {
      return Array.from(document.images).filter((image) => {
        const rect = image.getBoundingClientRect();
        return rect.width >= 200 && rect.height >= 100 && image.src.startsWith('data:image/svg');
      });
    };

    return getVisibleCanvasImages().length;
  });
}
