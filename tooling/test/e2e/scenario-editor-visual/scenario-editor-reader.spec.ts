import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`reader preserves guide content and returns to editing in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1920, height: 1080 });
    const title = await page.getByRole('textbox', { name: 'Scenario', exact: true }).inputValue();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const reader = page.locator('.guide-reader');
    await expect(reader.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(reader.locator('textarea, input')).toHaveCount(0);
    await expect(reader.locator('img')).toHaveCount(2);
    await expect(reader.getByRole('navigation', { name: 'Guide contents' })).toBeVisible();
    await reader.getByRole('button', { name: 'Step by step', exact: true }).click();
    await expect(reader.locator('.guide-read-document > *')).toHaveCount(1);
    await expect(reader.locator('article')).toHaveAttribute('id', 'compare');
    await reader.getByRole('button', { name: 'Previous step', exact: true }).click();
    await expect(reader.locator('section')).toHaveAttribute('id', 'intro');
    await expect(reader.getByRole('button', { name: 'Previous step', exact: true })).toBeDisabled();
    await page.keyboard.press('ArrowRight');
    await expect(reader.locator('article')).toHaveAttribute('id', 'compare');
    await expect(reader.locator('article')).toHaveCSS('outline-style', 'none');
    await expect
      .poll(() =>
        reader
          .getByRole('group', { name: 'Reading mode' })
          .locator('button span')
          .evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth))
      )
      .toBe(true);
    await testInfo.attach(`reader-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.setViewportSize({ width: 800, height: 640 });
    await expect(
      reader.getByRole('button', { name: 'Back to editing', exact: true })
    ).toBeInViewport();
    await expect(reader.getByRole('button', { name: 'Next step', exact: true })).toBeInViewport();
    await expect
      .poll(() => reader.evaluate((node) => node.scrollWidth <= node.clientWidth))
      .toBe(true);
    await testInfo.attach(`reader-narrow-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Scenario', exact: true })).toHaveValue(title);
    await expect(page.locator('main img')).toHaveCount(2);
  });
}
