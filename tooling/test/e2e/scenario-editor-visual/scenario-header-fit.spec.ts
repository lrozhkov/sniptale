import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

test('tour header collapses labels in priority order and restores them without wrapping', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const issues = createPageIssueCollector(page);
  await openVisualHarness(
    page,
    hostOrigin,
    'dark',
    'ru',
    { width: 1920, height: 1080 },
    'compare',
    { tourFixture: '1' }
  );
  await page.getByRole('button', { name: 'Интерактивный тур', exact: true }).click();
  await page
    .locator('.tour-header-controls')
    .getByRole('button', { name: 'Просмотр', exact: true })
    .click();
  const header = page.locator('.guide-page-header');
  for (const width of [1920, 1600, 1440, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    await expect
      .poll(() => header.evaluate((node) => node.scrollWidth <= node.clientWidth))
      .toBe(true);
    const metrics = await header.evaluate((node) => {
      const actions = [...node.querySelectorAll<HTMLElement>('[data-header-collapse]')].sort(
        (a, b) => Number(a.dataset['headerCollapse']) - Number(b.dataset['headerCollapse'])
      );
      return {
        hidden: actions.map((button) => button.hasAttribute('data-icon-only')),
        tops: [...node.querySelectorAll<HTMLElement>('.sniptale-glass-toolbar-button')]
          .filter((button) => !button.closest('.guide-project-name'))
          .map((button) => Math.round(button.getBoundingClientRect().top)),
      };
    });
    expect(new Set(metrics.tops).size).toBe(1);
    let visible = false;
    for (const hidden of metrics.hidden) {
      if (!hidden) visible = true;
      if (visible) expect(hidden).toBe(false);
    }
    if (width === 1280) {
      expect(metrics.hidden.some(Boolean)).toBe(true);
      await testInfo.attach('tour-header-one-row-minimum-center', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
  }
  await page
    .locator('#guide-inspector-panel')
    .getByRole('button', { name: 'Закрыть', exact: true })
    .click();
  await page
    .locator('#guide-library-panel')
    .getByRole('button', { name: 'Закрыть', exact: true })
    .click();
  await expect.poll(() => header.locator('[data-header-collapse][data-icon-only]').count()).toBe(0);
  issues.assertClean();
});
