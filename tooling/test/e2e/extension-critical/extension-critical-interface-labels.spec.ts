import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const theme of ['dark', 'light'] as const) {
    test(`interface label roles ${theme} ${viewport.name}`, async ({
      context,
      extensionId,
    }, info) => {
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      });
      const page = await context.newPage();
      await page.setViewportSize(viewport.size);
      const base = `chrome-extension://${extensionId}/apps/extension/src`;
      await page.goto(`${base}/popup/index.html`);
      await page.evaluate(async (theme) => {
        await chrome.storage.local.set({
          'sniptale-theme-preference': theme,
          'sniptale-locale-preference': 'ru',
        });
      }, theme);
      for (const surface of ['popup', 'settings', 'editor', 'video-editor', 'scenario-editor']) {
        await page.goto(
          `${base}/${surface}/index.html${surface === 'settings' ? '?section=media-quality&view=image' : ''}`
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('html')).toHaveAttribute('data-ui-platform', 'windows');
        if (surface === 'popup') {
          await page.locator('button[data-page="menu"]').click();
        } else if (surface.endsWith('editor')) {
          await page.locator('[data-ui="editor.start.actions"] button').first().click();
          await expect(page.locator('[data-ui="editor.start"]')).toBeHidden();
        }
        if (surface === 'editor') {
          await page.locator('[data-ui="editor.floating.layers.mode.frame"]').click();
        }
        if (surface === 'scenario-editor') {
          await page
            .locator('.guide-page-header')
            .getByRole('button', { name: 'Оформление', exact: true })
            .click();
        }
        await page.evaluate(() => document.fonts.ready);
        const labels = page.locator(
          '.sniptale-interface-label, .sniptale-select-value-label, .sniptale-parameter-name'
        );
        await expect.poll(() => labels.count()).toBeGreaterThan(0);
        const fills = await labels.evaluateAll((elements) =>
          elements.map((element) => getComputedStyle(element).webkitTextFillColor)
        );
        expect(fills.some((fill) => fill.includes('/ 0.82)'))).toBe(theme === 'dark');
        const protectedFills = await page
          .locator('input, textarea, h1, h2, h3, [contenteditable="true"]')
          .evaluateAll((elements) =>
            elements.map((element) => getComputedStyle(element).webkitTextFillColor)
          );
        expect(protectedFills.every((fill) => !fill.includes('/ 0.82)'))).toBe(true);
        await page.screenshot({
          path: info.outputPath(`${surface}.png`),
          fullPage: false,
          animations: 'disabled',
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
      }
      await page.emulateMedia({ forcedColors: 'active' });
      const label = page.locator('.sniptale-parameter-name').first();
      if (await label.count())
        expect(
          await label.evaluate((element) => getComputedStyle(element).webkitTextFillColor)
        ).not.toContain('/ 0.82)');
      await page.close();
    });
  }
}
