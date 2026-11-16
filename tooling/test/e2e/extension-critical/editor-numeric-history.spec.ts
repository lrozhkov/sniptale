import { expect, test } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test.use({ actionTimeout: 10_000 });
  test(`numeric hold creates one Image history action ${viewport.name}`, async ({ page }, info) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize(viewport.size);
      await applyHarnessBootstrap(page, {
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(`${host.origin}${EDITOR_HARNESS_PATH}`);
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyReady)
        )
        .toBe(true);
      await page.locator('[data-ui="editor.floating.layers.mode.frame"]').click();
      await page
        .locator('[data-ui="editor.frame.background-mode"]')
        .getByRole('button', { name: 'Color', exact: true })
        .click();
      const row = page.locator('[data-ui="editor.frame.source-basics"]');
      const input = row.locator('input[type="text"]');
      const increase = row.getByRole('button', { name: /increase$/ });
      await expect(input).toBeVisible();
      const original = Number(await input.inputValue());
      const historyIndex = () =>
        page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex);
      const before = await historyIndex();
      await input.hover();
      await increase.hover();
      await page.mouse.down();
      await expect
        .poll(async () => Number(await input.inputValue()))
        .toBeGreaterThanOrEqual(original + 3);
      expect(await historyIndex()).toBe(before);
      await page.mouse.move(20, 100);
      await page.mouse.up();
      await expect.poll(historyIndex).toBe(before + 1);
      const accepted = Number(await input.inputValue());
      expect(accepted).toBeGreaterThanOrEqual(original + 3);
      await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
      await expect.poll(historyIndex).toBe(before);
      await expect(input).toHaveValue(String(original));
      await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
      await expect.poll(historyIndex).toBe(before + 1);
      await expect(input).toHaveValue(String(accepted));
      await input.hover();
      await increase.hover();
      await page.mouse.down();
      await page.mouse.up();
      await expect.poll(historyIndex).toBe(before + 2);
      await expect(input).toHaveValue(String(accepted + 1));
      await input.hover();
      await increase.hover();
      await page.mouse.down();
      await expect
        .poll(async () => Number(await input.inputValue()))
        .toBeGreaterThanOrEqual(accepted + 3);
      await page.keyboard.press('Control+z');
      await page.mouse.up();
      expect(await historyIndex()).toBe(before + 2);
      await expect(input).toHaveValue(String(accepted + 1));
      await expect
        .poll(() =>
          page.evaluate(
            () => window.__sniptaleEditorHarness!.getInteractionState().framePreviewActive
          )
        )
        .toBe(false);
      await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
      await expect.poll(historyIndex).toBe(before + 1);
      await expect(input).toHaveValue(String(accepted));
      await input.fill(String(accepted + 1));
      await input.press('Enter');
      await expect.poll(historyIndex).toBe(before + 2);
      await expect(input).toHaveValue(String(accepted + 1));
      await expect(
        page.locator('[data-ui="editor.floating.tool-rail.history.redo"]')
      ).toBeDisabled();
      await page.screenshot({ path: info.outputPath('numeric-hold-history.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
