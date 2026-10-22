import { expect, test, type Page } from '@playwright/test';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

const ui = (page: Page, name: string) => page.locator(`[data-ui="content.toolbar.${name}"]`);
async function customize(page: Page) {
  await ui(page, 'settings-button').click();
  await ui(page, 'settings.customize-buttons').click();
  await expect(ui(page, 'customize-done')).toBeVisible();
}
async function hide(page: Page, control: string) {
  const button = ui(page, `visibility.${control}`);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  const indicator = button.locator('svg').last();
  const before = await indicator.boundingBox();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toBeEnabled();
  const after = await indicator.boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(0.5);
}
async function mode(page: Page, name: string) {
  await ui(page, 'mode-selector-button').click();
  await ui(page, `mode-option.${name}`).click();
  await expect(ui(page, `mode-option.${name}`)).toHaveCount(0);
}
async function expectSeparators(page: Page) {
  const adjacent = await ui(page, 'root').evaluate((root) => {
    const visible = [...root.children].filter(
      (child) => child.getBoundingClientRect().width > 0 && child.getBoundingClientRect().height > 0
    );
    return visible.some(
      (child, index) =>
        child.classList.contains('sniptale-divider') &&
        visible[index + 1]?.classList.contains('sniptale-divider')
    );
  });
  expect(adjacent).toBe(false);
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    test(`page toolbar visibility ${name} ${orientation}`, async ({}, info) => {
      test.setTimeout(120000);
      const host = await startHostServer();
      const launched = await launchExtensionBrowser({ viewport: size });
      const { context, extensionId } = launched;
      const hostOrigin = host.origin;
      try {
        const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
        await popup.evaluate(
          async (theme) =>
            chrome.storage.local.set({
              'sniptale-theme-preference': theme,
              'sniptale-locale-preference': theme === 'dark' ? 'ru' : 'en',
            }),
          size.width === 1920 ? 'dark' : 'light'
        );
        await page.bringToFront();
        if (orientation === 'vertical') {
          await ui(page, 'settings-button').click();
          const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
          if (!(await vertical.isVisible()))
            await page
              .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
              .click();
          await vertical.click();
        }
        await customize(page);
        await ui(page, 'settings-button').click();
        await ui(page, 'settings.show-hidden-buttons').focus();
        await page.keyboard.press('Enter');
        await expect(ui(page, 'customize-done')).toHaveCount(0);
        await expect(ui(page, 'settings.show-hidden-buttons')).toBeVisible();
        await page.keyboard.press('Escape');
        await customize(page);
        await page.setViewportSize({ width: 1000, height: size.height });
        await expect
          .poll(() =>
            ui(page, 'root').evaluate((element) => {
              const box = element.getBoundingClientRect();
              return (
                box.left >= -1 &&
                box.right <= innerWidth + 1 &&
                document.documentElement.scrollWidth <= innerWidth
              );
            })
          )
          .toBe(true);
        await page.setViewportSize(size);
        for (const control of [
          'auto-blur',
          'capture-visible',
          'capture-selection',
          'capture-full',
          'after-capture',
          'capture-delay',
          'capture-size',
        ]) {
          if (await ui(page, `visibility.${control}`).count()) await hide(page, control);
        }
        for (const control of [
          'review-panel',
          'review-measurements',
          'review-layout-guides',
          'review-export',
        ])
          await hide(page, control);
        await page.screenshot({ path: info.outputPath('customizing-review.png'), fullPage: false });
        await ui(page, 'customize-done').focus();
        await page.keyboard.press('Enter');
        await expect(ui(page, 'settings-button')).toBeFocused();
        await expect(ui(page, 'capture-visible-button')).toHaveCount(0);
        await expect(ui(page, 'timer-button')).toHaveCount(0);
        await expect(ui(page, 'design-review-panel-button')).toHaveCount(0);
        await expect(ui(page, 'reset-all-button')).toBeVisible();
        await expectSeparators(page);
        await mode(page, 'drawing');
        await expect(ui(page, 'drawing.select')).toBeVisible();
        await customize(page);
        await expect(ui(page, 'visibility.drawing-select')).toHaveCount(0);
        await hide(page, 'drawing-pencil');
        await ui(page, 'customize-done').click();
        await expect(ui(page, 'drawing.pencil')).toHaveCount(0);
        await expect(ui(page, 'drawing.select')).toBeVisible();
        await mode(page, 'highlighter');
        await customize(page);
        await expect(ui(page, 'future-frame-style')).toBeVisible();
        await hide(page, 'annotation-callout');
        await ui(page, 'customize-done').click();
        await expect(ui(page, 'future-frame-callout')).toHaveCount(0);
        await expect(ui(page, 'future-frame-style')).toBeVisible();
        await mode(page, 'quick-edit');
        await customize(page);
        await expect(ui(page, 'page-editing-mode.block-selection')).toBeVisible();
        await hide(page, 'editing-direct-text');
        await ui(page, 'customize-done').click();
        await expect(ui(page, 'page-editing-mode.direct-text')).toHaveCount(0);
        await expect(ui(page, 'page-editing-mode.block-selection')).toBeVisible();
        await mode(page, 'cursor');
        await expect(ui(page, 'navigation.pin-to-tab')).toBeVisible();
        await expect(ui(page, 'navigation.collapse')).toBeVisible();
        await expectSeparators(page);
        await ui(page, 'settings-button').click();
        await ui(page, 'settings.show-hidden-buttons').click();
        await page.keyboard.press('Escape');
        await expect(ui(page, 'timer-button')).toBeVisible();
        await ui(page, 'timer-button').click();
        await page
          .locator('[data-ui="content.toolbar.timer-menu"] .sniptale-toolbar-menu-item')
          .nth(1)
          .click();
        await expect(ui(page, 'timer-value')).toHaveText('3');
        await page.screenshot({
          path: info.outputPath('temporarily-revealed.png'),
          fullPage: false,
        });
        await ui(page, 'navigation.collapse').click();
        await page.locator('[data-ui="content.collapsed-panels.restore-toolbar"]').click();
        await expect(ui(page, 'timer-button')).toHaveCount(0);
        await expect(ui(page, 'customize-done')).toHaveCount(0);
        await customize(page);
        await expect(ui(page, 'visibility.capture-delay')).toHaveAttribute('aria-pressed', 'false');
        await page.keyboard.press('Escape');
        await expect(ui(page, 'customize-done')).toHaveCount(0);
        await expect(ui(page, 'settings-button')).toBeFocused();
        await page.screenshot({
          path: info.outputPath('hidden-after-reopen.png'),
          fullPage: false,
        });
        await ui(page, 'settings-button').click();
        await ui(page, 'settings.show-hidden-buttons').click();
        await page.keyboard.press('Escape');
        await expect(ui(page, 'timer-button')).toBeVisible();
        await page.reload();
        await expect
          .poll(() =>
            popup.evaluate(async (origin) => {
              const tabs = await chrome.tabs.query({});
              const target = tabs.find((tab) => tab.url === `${origin}/`);
              if (target?.id === undefined) return false;
              await chrome.runtime.sendMessage({
                type: 'PAGE_ACCESS',
                operation: 'register-granted-site',
                tabId: target.id,
                __sniptaleRuntimeFreshness: {
                  issuedAtEpochMs: Date.now(),
                  nonce: crypto.randomUUID(),
                },
              });
              const response = await chrome.tabs
                .sendMessage(target.id, { type: 'ENABLE_SCREENSHOT_MODE', workingMode: 'cursor' })
                .catch(() => null);
              return response?.success === true;
            }, hostOrigin)
          )
          .toBe(true);
        await expect(ui(page, 'settings-button')).toBeVisible();
        await expect(ui(page, 'timer-button')).toHaveCount(0);
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.sync.get('sniptale_settings')).sniptale_settings
                  ?.contentToolbar?.pageControls?.['drawing-pencil']
            )
          )
          .toBe(false);
        await mode(page, 'video-recording');
        await expect(ui(page, 'video-recording.customize')).toBeVisible();
        await expect(ui(page, 'customize-done')).toHaveCount(0);
      } finally {
        await closeExtensionBrowser(launched);
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}
