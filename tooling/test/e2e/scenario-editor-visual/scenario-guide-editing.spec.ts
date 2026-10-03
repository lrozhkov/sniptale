import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

for (const [theme, locale] of [
  ['light', 'en'],
  ['dark', 'ru'],
] as const) {
  test(`guide editing and insertion stay separate in ${theme}`, async ({ page, hostOrigin }) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, locale, { width: 1280, height: 720 });
    const insertion = page.locator('.guide-document > .guide-insertion-item').first();
    const plus = insertion.locator('button');
    const menu = page.locator('.guide-action-menu--insert');
    await plus.hover();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await plus.click();
    await expect(menu).toBeVisible();
    await menu.locator('button').first().click();
    await expect(page.locator('main article')).toHaveCount(3);
    await page.locator('.guide-history-controls button').first().click();
    await expect(page.locator('main article')).toHaveCount(2);
    const block = page.locator('[data-block-id="description"]');
    const field = block.locator('textarea');
    await field.click();
    await expect(block).toBeFocused();
    await expect(plus).toBeDisabled();
    await expect(insertion).toHaveAttribute('inert', '');
    await expect(insertion).toHaveCSS('pointer-events', 'none');
    await block.press('Enter');
    await expect(field).toBeFocused();
    await field.press('Shift+Enter');
    await expect(field).toBeFocused();
    await field.press('Enter');
    await expect(block).toBeFocused();
    await block.press('Enter');
    await field.press('Escape');
    await block.press('Escape');
    await expect(block).toBeFocused();
    await expect(block).toHaveAttribute('data-selected', 'true');
    await expect(block).toHaveCSS('outline-style', 'none');
    await expect(block).not.toHaveCSS('border-radius', '0px');
    const image = page.locator('[data-block-id="before"]');
    await image.locator('img').click();
    const placement = page.locator(
      '.guide-image-inspector [aria-label="' +
        (locale === 'en' ? 'Block width' : 'Ширина блока') +
        '"]'
    );
    await expect(placement).toBeVisible();
    await placement.locator('button').nth(1).click();
    await expect(placement.locator('button').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await image.locator('[data-frame-image]').click();
    await expect(image.locator('.guide-image-tools [aria-pressed="true"]')).toHaveCount(1);
    const inset = await image.evaluate((element) => {
      const outer = element.getBoundingClientRect();
      const action = element.querySelector('.guide-block-actions')!.getBoundingClientRect();
      return outer.right - action.right;
    });
    expect(inset).toBeGreaterThan(0);
    await image.locator('[data-frame-image]').click();
    await page.locator('article#compare > header').click({ position: { x: 5, y: 5 } });
    await expect(plus).toBeEnabled();
    await plus.hover();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    issues.assertClean();
  });
}
