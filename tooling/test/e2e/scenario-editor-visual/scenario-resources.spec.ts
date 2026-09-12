import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`compact resources preview and footer remain usable in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1280, height: 720 });
    await page.getByRole('button', { name: 'Ресурсы', exact: true }).click();
    const panel = page.locator('#guide-library-panel');
    const rows = panel.locator('.guide-resource-row');
    await expect(rows).toHaveCount(1);
    expect(
      await rows.first().evaluate((node) => node.getBoundingClientRect().height)
    ).toBeLessThanOrEqual(48);
    const preview = rows
      .first()
      .getByRole('button', { name: 'Посмотреть изображение', exact: true });
    await preview.click();
    const viewer = page.locator('#guide-resource-preview');
    await expect(viewer.locator('[data-ui="library-media-player"] img')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    await expect(preview).toBeFocused();
    await rows
      .first()
      .getByRole('button', { name: 'Места использования (2)', exact: true })
      .click();
    await page.getByRole('button', { name: 'Compare two images · 1', exact: true }).click();
    await expect(page.locator('article#compare')).toHaveAttribute('data-selected', 'true');
    await page.setViewportSize({ width: 1024, height: 640 });
    const footer = panel.locator('.guide-resource-footer');
    await expect(footer).toBeInViewport();
    await testInfo.attach(`resources-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await footer.getByRole('button', { name: 'Библиотека изображений', exact: true }).click();
    const drawer = page.locator('#guide-resource-drawer');
    await expect(drawer.locator('.guide-resource-drawer-close')).toBeInViewport();
    await expect(
      drawer.getByRole('button', { name: 'Обновить библиотеку', exact: true })
    ).toHaveCount(0);
    const search = drawer.locator('.guide-library-search input');
    await search.fill('does-not-exist');
    await expect(drawer.locator('.guide-library-card')).toHaveCount(0);
    await search.fill('');
    await expect(drawer.locator('.guide-library-card')).toHaveCount(1);
    await drawer.locator('.guide-library-card').click();
    await expect(drawer.locator('.guide-library-preview img')).toBeVisible();
    await testInfo.attach(`library-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await drawer.locator('.guide-resource-drawer-close button').click();
    await expect(drawer).toHaveCount(0);
    await expect(
      footer.getByRole('button', { name: 'Библиотека изображений', exact: true })
    ).toBeFocused();
  });
}
