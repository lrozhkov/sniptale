import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`scenario inspector shares color and section patterns in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1280, height: 720 });
    const panel = page.locator('#guide-inspector-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('h2')).toHaveText('Compare two images');
    await expect(panel.locator('.guide-inspector-scope')).toHaveCount(0);
    await panel
      .getByRole('navigation', { name: 'Настройки шага' })
      .getByRole('button', { name: 'Оформление', exact: true })
      .click();
    const accent = panel.locator('.guide-style-accent');
    await expect(accent.locator('input[type="color"]')).toHaveCount(0);
    await expect(accent.getByText('Акцентный цвет', { exact: true })).toBeVisible();
    await accent.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
    await expect(page.locator('[data-ui="shared.ui.color-selector.picker"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ui="shared.ui.color-selector.picker"]')).toHaveCount(0);
    await testInfo.attach(`inspector-narrow-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    expect(
      await panel.evaluate((node) =>
        [
          ...node.querySelectorAll(
            'button, [role="group"], .guide-style-fields, .guide-inspector-choice, .guide-style-accent'
          ),
        ]
          .filter((el) => el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1)
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            text: el.textContent?.slice(0, 40),
            width: el.getBoundingClientRect().width,
          }))
      )
    ).toEqual([]);
    expect(
      await panel
        .locator('.guide-inspector-choice [role="group"] button > span')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.scrollWidth > node.clientWidth)
            .map((node) => node.textContent)
        )
    ).toEqual([]);
    await page.setViewportSize({ width: 1024, height: 640 });
    await testInfo.attach(`inspector-minimum-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await panel.getByRole('button', { name: 'Показать все настройки', exact: true }).click();
    await expect(panel.getByRole('navigation', { name: 'Настройки шага' })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Показать разделы настроек', exact: true }).click();
    await expect(
      panel.getByRole('navigation').getByRole('button', { name: 'Оформление', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: 'Сценарий', exact: true })
      .click();
    await page.getByRole('button', { name: 'Оформление сценария', exact: true }).click();
    await expect(panel.locator('h2')).toHaveText('Весь сценарий');
    await expect(
      panel.getByRole('button', { name: 'Показать все настройки', exact: true })
    ).toHaveCount(0);
  });
}
