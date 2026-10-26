import { expect, test } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import { evaluateInTarget, triggerExtensionAction } from '../support/recording-action';
import { startHostServer } from '../support/host-server';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const variant of [
    { locale: 'ru', theme: 'light' },
    { locale: 'ru', theme: 'dark' },
    { locale: 'en', theme: 'light' },
    { locale: 'en', theme: 'dark' },
  ]) {
    test(
      `popup hints preserve names without duplicate native titles ${viewport.name} ` +
        `${variant.locale}-${variant.theme}`,
      async ({}, info) => {
        const server = await startHostServer();
        const launched = await launchExtensionBrowser({ viewport: viewport.size });
        try {
          const { context, extensionId } = launched;
          const host = await context.newPage();
          await host.goto(`${server.origin}/fixtures/host-page.html`);
          const target = await triggerExtensionAction(context, extensionId, host);
          await expect
            .poll(() =>
              evaluateInTarget(
                context,
                target,
                `Boolean(document.querySelector('[data-ui="popup.app.tabs"] button[aria-label]'))`
              )
            )
            .toBe(true);
          expect(
            await evaluateInTarget(context, target, 'document.querySelectorAll("[title]").length')
          ).toBe(0);

          const popup = await context.newPage();
          await popup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
          await popup.evaluate(async ({ locale, theme }) => {
            localStorage.setItem('sniptale-theme-preference', theme);
            await chrome.storage.local.set({
              'sniptale-locale-preference': locale,
              'sniptale-theme-preference': theme,
            });
          }, variant);
          await popup.reload();
          await popup.locator('[data-ui="popup.app.tabs"]').waitFor();
          const languageToggle = popup.locator('button[data-locale-preference]');
          const languageHint = variant.locale === 'ru' ? 'Русский → English' : 'English → Russian';
          const switchedHint = variant.locale === 'ru' ? 'English → Russian' : 'Русский → English';
          await languageToggle.hover();
          await expect(languageToggle).toHaveAttribute('title', languageHint);
          await expect(languageToggle).toHaveAccessibleName(/\S/);
          await languageToggle.click();
          await expect(languageToggle).toHaveAttribute('data-popup-hint', switchedHint);
          await languageToggle.hover();
          await expect(languageToggle).toHaveAttribute('title', switchedHint);
          await languageToggle.click();
          await expect(languageToggle).toHaveAttribute('data-popup-hint', languageHint);
          for (const page of ['menu', 'screenshots', 'video', 'tools', 'export']) {
            await popup.locator(`[data-ui="popup.app.tabs"] button[data-page="${page}"]`).click();
            await expect(popup.locator('[data-ui="popup.app.content"]')).not.toHaveAttribute(
              'aria-busy',
              'true'
            );
            await expect(
              popup.locator('[data-ui="popup.app.content"] button').first()
            ).toBeVisible();
            await expect(popup.getByRole('tooltip')).toHaveCount(0);
            await expect(async () => {
              for (const button of await popup.getByRole('button').all()) {
                await expect(button).toHaveAccessibleName(/\S/, { timeout: 100 });
              }
            }).toPass();
            await popup.screenshot({
              path: info.outputPath(`${page}.png`),
              fullPage: false,
              clip: { x: 0, y: 0, width: 392, height: 560 },
            });
          }
          await popup.evaluate(() => {
            const fixture = document.createElement('section');
            fixture.dataset['ui'] = 'hint-proof';
            fixture.style.cssText =
              'position:fixed;inset:70px 12px auto;z-index:9999;' +
              'background:var(--sniptale-color-surface-panel);padding:16px';
            for (const [label, hint, width] of [
              ['Download', 'Download', 180],
              [
                'A long selected microphone device name',
                'A long selected microphone device name',
                100,
              ],
              ['Export', 'Includes images and page content', 180],
              ['', 'Settings', 32],
            ] as const) {
              const button = document.createElement('button');
              button.textContent = label || '+';
              button.setAttribute('aria-label', label || hint);
              button.dataset['popupHint'] = hint;
              button.style.cssText =
                `display:block;overflow:hidden;white-space:nowrap;` +
                `text-overflow:ellipsis;width:${width}px;height:32px`;
              fixture.append(button);
            }
            document.querySelector('[data-ui="popup.app.root"]')?.append(fixture);
          });
          const tooltip = popup.getByRole('tooltip');
          await popup.mouse.move(700, 400);
          await expect(tooltip).toHaveCount(0);
          const fixture = popup.locator('[data-ui="hint-proof"]');
          const visible = fixture.getByRole('button', { name: 'Download', exact: true });
          await visible.hover();
          await expect(tooltip).toHaveCount(0);
          await expect(visible).not.toHaveAttribute('title');
          await visible.focus();
          await expect(tooltip).toHaveCount(0);
          const clipped = fixture.getByRole('button', {
            name: 'A long selected microphone device name',
            exact: true,
          });
          await clipped.hover();
          await expect(clipped).toHaveAttribute('title', 'A long selected microphone device name');
          await expect(tooltip).toHaveCount(0);
          await popup.mouse.move(0, 0);
          await visible.focus();
          const bounds = await clipped.boundingBox();
          await popup.keyboard.press('Tab');
          await expect(clipped).toBeFocused();
          await expect(clipped).toHaveAccessibleName('A long selected microphone device name');
          expect(await clipped.boundingBox()).toEqual(bounds);
          await expect(clipped).toHaveAttribute('title', 'A long selected microphone device name');
          await expect(tooltip).toHaveCount(0);
          await popup.keyboard.press('Tab');
          await expect(
            fixture.getByRole('button', { name: 'Export', exact: true })
          ).toHaveAttribute('title', 'Includes images and page content');
          await popup.keyboard.press('Tab');
          await expect(
            fixture.getByRole('button', { name: 'Settings', exact: true })
          ).toHaveAttribute('title', 'Settings');
          await expect(tooltip).toHaveCount(0);
          await popup.goto(
            `chrome-extension://${extensionId}/apps/extension/src/design-system/index.html`
          );
          for (const component of ['popup-action-button', 'popup-footer-action']) {
            await popup.getByRole('searchbox').fill(`shared.ui.${component}`);
            const compact = popup
              .locator(`[data-ui="shared.ui.${component}"]`)
              .filter({
                has: popup.locator('.sr-only'),
              })
              .first();
            await compact.hover();
            const hint = (await compact.getAttribute('data-popup-hint')) ?? '';
            expect(hint).toBeTruthy();
            await expect(compact).toHaveAttribute('title', hint);
            await expect(compact).toHaveAccessibleName(hint);
            await expect(popup.getByRole('tooltip')).toHaveCount(0);
          }
        } finally {
          await closeExtensionBrowser(launched);
          server.server.closeAllConnections();
          await new Promise<void>((resolve) => server.server.close(() => resolve()));
        }
      }
    );
  }
}
