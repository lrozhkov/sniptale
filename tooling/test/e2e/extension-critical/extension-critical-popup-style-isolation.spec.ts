import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';

const viewport = { width: 392, height: 560 };
const routes = ['menu', 'screenshots', 'video', 'tools', 'export'] as const;

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`popup stylesheet isolation ${locale} ${theme}`, async ({}, info) => {
      test.setTimeout(60_000);
      const launched = await launchExtensionBrowser({ viewport });
      try {
        const settings = await launched.context.newPage();
        await settings.setViewportSize({ width: 1280, height: 560 });
        await settings.goto(
          `chrome-extension://${launched.extensionId}/apps/extension/src/settings/index.html?section=interface-browser&view=interface`
        );
        const language = settings.locator('#settings-interface-language');
        await expect(language).toBeEnabled();
        await language.click();
        await settings
          .getByRole('option', {
            name: locale === 'en' ? 'English' : /^(Russian|Русский)$/u,
          })
          .click();
        await expect
          .poll(() =>
            settings.evaluate(
              async () =>
                (await chrome.storage.local.get('sniptale-locale-preference'))[
                  'sniptale-locale-preference'
                ]
            )
          )
          .toBe(locale);
        await settings.evaluate(async (theme) => {
          localStorage.setItem('sniptale-theme-preference', theme);
          await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
        }, theme);
        await settings.close();
        const page = await launched.context.newPage();
        await page.setViewportSize(viewport);
        await page.goto(
          `chrome-extension://${launched.extensionId}/apps/extension/src/popup/index.html`
        );
        const root = page.locator('[data-ui="popup.app.root"]');
        await expect(root).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        for (const route of routes) {
          await page.locator(`[data-ui="popup.app.tabs"] button[data-page="${route}"]`).click();
          await expect(page.locator('[data-ui="popup.app.content"]')).not.toHaveAttribute(
            'aria-busy',
            'true'
          );
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.allSettled(
              document
                .getAnimations()
                .filter((animation) =>
                  Number.isFinite(animation.effect?.getComputedTiming().endTime)
                )
                .map((animation) => animation.finished)
            );
          });
          await expect(root).toHaveCSS('width', '392px');
          await expect(root).toHaveCSS('height', '560px');
          await expect(root.locator('[class~="p-3"]').first()).toHaveCSS('padding', '12px');
          await expect(root.locator('button[data-command-press]')).toHaveCount(0);
          if (route === 'menu') {
            await expect(root.locator('[class~="text-sm"]').first()).toHaveCSS('font-size', '14px');
            await expect(root.locator('h1')).toHaveText(translate('popup.home.menuTitle', locale));
          }
          await page.screenshot({ path: info.outputPath(`popup-${route}.png`), fullPage: false });
        }
      } finally {
        await closeExtensionBrowser(launched, { removeUserDataDir: true });
      }
    });
  }
}
