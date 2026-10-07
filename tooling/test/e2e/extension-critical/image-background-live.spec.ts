import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  EDITOR_HARNESS_PATH,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  createExactBrowserFrameHarnessPayload,
} from '../extension-critical.helpers';

for (const width of [1280, 1920, 1100]) {
  const locale = width === 1280 ? 'ru' : 'en';
  const noneLabel = locale === 'ru' ? 'Нет' : 'None';
  const gradientLabel = locale === 'ru' ? 'Градиент' : 'Gradient';
  const resetLabel = locale === 'ru' ? 'Сбросить' : 'Reset';
  test(`image background completed edits and reset ${width}`, async ({ page }, info) => {
    const host = await startHostServer();
    try {
      await page.addInitScript(
        (locale) => localStorage.setItem('sniptale-locale-preference', locale),
        locale
      );
      await page.setViewportSize({ width, height: width === 1920 ? 900 : 560 });
      await applyHarnessBootstrap(page, {
        apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
        editorBootstrapPayload: createExactBrowserFrameHarnessPayload(),
        storage: {
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': width === 1280 ? 'dark' : 'light',
        },
      });
      await page.goto(`${host.origin}${EDITOR_HARNESS_PATH}`);
      await page.locator('[data-ui="editor.floating.layers.mode.frame"]').click();
      const kinds = page.locator('[data-ui="editor.frame.background-mode"]');
      await kinds.getByRole('button', { name: noneLabel, exact: true }).click();
      await expect(kinds.getByRole('button', { name: noneLabel, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await kinds.getByRole('button', { name: gradientLabel, exact: true }).click();
      await expect(page.locator('[data-ui="editor.frame.gradient-presets"]')).toBeVisible();
      await page.screenshot({ path: info.outputPath('background-controls.png'), fullPage: false });
      const padding = page
        .locator('[data-ui="editor.frame.padding-fields"] input[type="text"]')
        .first();
      const before = await page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects());
      await padding.fill('60');
      expect(await page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects())).toEqual(
        before
      );
      await padding.press('Enter');
      await expect(padding).toHaveValue('60');
      await expect
        .poll(() => page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects()))
        .not.toEqual(before);
      await padding.blur();
      await page.keyboard.press('Control+z');
      await expect(padding).toHaveValue('32');
      await page.keyboard.press('Control+Shift+z');
      await expect(padding).toHaveValue('60');
      await page.screenshot({ path: info.outputPath('background-gradient.png'), fullPage: false });
      const reset = page
        .locator('[data-ui="editor.frame.actions"]')
        .getByRole('button', { name: resetLabel, exact: true });
      await reset.click();
      await expect(kinds.getByRole('button', { name: noneLabel, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect(page.locator('[data-ui="editor.frame.padding-fields"]')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('background-none.png'), fullPage: false });
      await expect(page.getByRole('alert')).toHaveCount(0);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
