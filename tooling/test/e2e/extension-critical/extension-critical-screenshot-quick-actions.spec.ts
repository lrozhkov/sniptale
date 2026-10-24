import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import type { Page } from '@playwright/test';

async function configureToolbar(
  popup: Page,
  page: Page,
  hostOrigin: string,
  displayMode: 'horizontal' | 'vertical'
) {
  await popup.evaluate(async (displayMode) => {
    const current = (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings'];
    await chrome.storage.sync.set({
      sniptale_settings: {
        ...current,
        captureAction: 'edit',
        imageFormat: 'png',
        imageQuality: 83,
        contentToolbar: {
          ...current?.contentToolbar,
          pageControls: { ...current?.contentToolbar?.pageControls, 'scenario-panel': true },
          displayMode,
          freePlacement: false,
          position: null,
          dockEdge: displayMode === 'horizontal' ? 'bottom' : 'right-bottom',
        },
      },
    });
  }, displayMode);
  await page.reload();
  await popup.evaluate(async (origin) => {
    const tab = (await chrome.tabs.query({})).find((tab) => tab.url === `${origin}/`);
    await chrome.runtime.sendMessage({
      type: 'PAGE_ACCESS',
      operation: 'register-granted-site',
      tabId: tab!.id!,
      __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
    });
    await chrome.tabs.sendMessage(tab!.id!, {
      type: 'ENABLE_SCREENSHOT_MODE',
      workingMode: 'cursor',
    });
  }, hostOrigin);
  await page.bringToFront();
  await expect(page.locator('[data-ui="content.toolbar.root"]')).toBeVisible();
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    test(`screenshot quick menus ${theme} ${name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      try {
        await popup.evaluate(
          async (theme) =>
            chrome.storage.local.set({
              'sniptale-theme-preference': theme,
              'sniptale-locale-preference': theme === 'light' ? 'en' : 'ru',
            }),
          theme
        );
        for (const orientation of ['horizontal', 'vertical'] as const) {
          await configureToolbar(popup, page, hostOrigin, orientation);
          const captureButtons = page
            .locator('[data-ui="content.toolbar.root"] button[data-ui^="content.toolbar.capture-"]')
            .filter({ has: page.locator('svg') });
          const order = await captureButtons.evaluateAll((buttons) =>
            buttons
              .map((button) => button.getAttribute('data-ui'))
              .filter((id) => id !== 'content.toolbar.capture-action-button')
          );
          expect(order).toEqual([
            'content.toolbar.capture-visible-button',
            'content.toolbar.capture-visible-settings-button',
            'content.toolbar.capture-full-button',
            'content.toolbar.capture-full-settings-button',
            'content.toolbar.capture-selection-button',
          ]);
          for (const mode of ['visible', 'full', 'selection']) {
            const command = page.locator(`[data-ui="content.toolbar.capture-${mode}-button"]`);
            const surface = mode === 'selection' ? command : command.locator('..');
            await page.mouse.move(10, 100);
            await expect(surface).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
            await command.hover();
            await expect(surface).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
            await page.mouse.move(10, 100);
            await expect(surface).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          }

          if (orientation === 'vertical') {
            for (const mode of ['visible', 'full'] as const) {
              const primary = await page
                .locator(`[data-ui="content.toolbar.capture-${mode}-button"]`)
                .boundingBox();
              const arrow = await page
                .locator(`[data-ui="content.toolbar.capture-${mode}-settings-button"]`)
                .boundingBox();
              expect(arrow!.y).toBeGreaterThanOrEqual(primary!.y + primary!.height - 1);
              expect(
                Math.abs(arrow!.x + arrow!.width / 2 - primary!.x - primary!.width / 2)
              ).toBeLessThanOrEqual(1);
            }
          }
          for (const mode of ['visible', 'full'] as const) {
            const trigger = page.locator(
              `[data-ui="content.toolbar.capture-${mode}-settings-button"]`
            );
            await trigger.click();
            const menu = page.locator(
              `[data-ui="content.toolbar.${mode === 'full' ? 'full' : 'visible'}-page-menu"]`
            );
            const icons = menu.locator('.sniptale-capture-action-icons button');
            await expect(icons).toHaveCount(6);
            await icons.first().hover();
            await expect(trigger.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
            expect(
              await icons.evaluateAll(
                (nodes) =>
                  new Set(nodes.map((node) => Math.round(node.getBoundingClientRect().y))).size
              )
            ).toBe(1);
            await expect(menu.locator('[data-ui$=".scenario"]')).toHaveCount(0);
            await expect(menu.getByRole('slider')).toHaveCount(0);
            await menu.getByRole('button', { name: 'WebP', exact: true }).click();
            await expect
              .poll(() =>
                popup.evaluate(
                  async () =>
                    (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
                      .imageFormat
                )
              )
              .toBe('webp');
            await menu.getByRole('button', { name: 'JPEG', exact: true }).click();
            await expect(menu.getByRole('slider')).toHaveCount(0);
            await expect
              .poll(() =>
                popup.evaluate(
                  async () =>
                    (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
                      .imageFormat
                )
              )
              .toBe('jpeg');
            const input = menu.getByRole('textbox', {
              name: /Image quality|Качество изображения/u,
            });
            const labels = await menu
              .locator('.sniptale-capture-parameter-label')
              .evaluateAll((nodes) =>
                nodes.map((node) => {
                  const css = getComputedStyle(node);
                  return { font: css.font, color: css.color, lineHeight: css.lineHeight };
                })
              );
            expect(labels).toHaveLength(2);
            expect(labels[0]).toEqual(labels[1]);
            const field = menu.locator('.sniptale-capture-quality-input');
            await expect(field).toHaveCSS('height', '32px');
            await input.fill('76');
            await input.press('Enter');
            await expect
              .poll(() =>
                popup.evaluate(
                  async () =>
                    (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
                      .imageQuality
                )
              )
              .toBe(76);
            await page.screenshot({
              path: info.outputPath(`${orientation}-${mode}-quality.png`),
              fullPage: false,
            });
            await menu.getByRole('button', { name: 'PNG', exact: true }).click();
            await expect(menu.getByRole('slider')).toHaveCount(0);
            const box = (await menu.locator('.sniptale-toolbar-menu').boundingBox())!;
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(size.width);
            expect(box.y + box.height).toBeLessThanOrEqual(size.height);
            if (mode === 'full') {
              await menu
                .locator('[data-ui="content.toolbar.full-page-floating.hide"]')
                .scrollIntoViewIfNeeded();
              await menu.locator('[data-ui="content.toolbar.full-page-floating.hide"]').click();
              await expect(
                menu.locator('[data-ui="content.toolbar.full-page-floating.hide"]')
              ).toHaveClass(/selected/u);
              await menu.locator('.sniptale-capture-action-icons').scrollIntoViewIfNeeded();
            }
            await page.screenshot({
              path: info.outputPath(`${orientation}-${mode}.png`),
              fullPage: false,
            });
            await icons.first().focus();
            await page.keyboard.press('Escape');
            await expect(menu).toHaveCount(0);
            await expect(trigger).toBeFocused();
          }
          await page.locator('[data-ui="content.toolbar.capture-action-button"]').click();
          const defaults = page.locator('[data-ui="content.toolbar.capture-action-menu"]');
          await expect(defaults.locator('.sniptale-capture-action-icons')).toHaveCount(0);
          await expect(defaults.locator('.sniptale-toolbar-menu-item')).toHaveCount(6);
          await expect(defaults.locator('.sniptale-toolbar-menu-item-label')).toHaveCount(6);
          await expect(defaults.locator('.sniptale-toolbar-menu-item-hint')).toHaveCount(6);
          await expect(defaults.locator('[data-ui$=".scenario"]')).toHaveCount(0);
          await expect
            .poll(async () =>
              defaults.locator('.sniptale-popover-menu').evaluate((element) => {
                const bounds = element.getBoundingClientRect();
                return bounds.top >= 7 && bounds.bottom <= innerHeight - 7;
              })
            )
            .toBe(true);
          await defaults.locator('.sniptale-toolbar-menu-item').last().scrollIntoViewIfNeeded();
          await expect(defaults.locator('.sniptale-toolbar-menu-item').last()).toBeInViewport();
          await page.screenshot({
            path: info.outputPath(`${orientation}-after-capture-list.png`),
            fullPage: false,
          });
          await defaults.locator('[data-ui="content.toolbar.capture-action-option.copy"]').click();
          await expect(defaults).toHaveCount(0);
          await expect
            .poll(() =>
              popup.evaluate(
                async () =>
                  (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
                    .captureAction
              )
            )
            .toBe('copy');
        }
        await page.setViewportSize({ width: 1000, height: 560 });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          .toBe(true);
      } finally {
        await page.close();
        await popup.close();
      }
    });
  }
}

test('quick capture overrides the default once for visible and full screenshots', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  try {
    await popup.evaluate(() => {
      const button = document.createElement('button');
      button.textContent = 'Grant capture proof';
      button.onclick = async () => {
        button.dataset['granted'] = String(
          await chrome.permissions.request({ origins: ['<all_urls>'] })
        );
      };
      document.body.append(button);
    });
    await popup.getByRole('button', { name: 'Grant capture proof', exact: true }).click();
    await expect(
      popup.getByRole('button', { name: 'Grant capture proof', exact: true })
    ).toHaveAttribute('data-granted', 'true');
    for (const mode of ['visible', 'full'] as const) {
      await configureToolbar(popup, page, hostOrigin, 'horizontal');
      await page.locator('[data-ui="content.toolbar.capture-action-button"]').click();
      await page.locator('[data-ui="content.toolbar.capture-action-option.edit"]').click();
      const before = await popup.evaluate(
        async () => (await chrome.downloads.search({ state: 'complete' })).length
      );
      await page.locator(`[data-ui="content.toolbar.capture-${mode}-settings-button"]`).click();
      const action = page.locator(
        `[data-ui="content.toolbar.capture-${mode}-action.download_default"]`
      );
      if (mode === 'visible') {
        await action.focus();
        await page.keyboard.press('Enter');
      } else await action.click();
      await expect(page.locator('.sniptale-screenshot-menu')).toHaveCount(0);
      await expect
        .poll(
          () =>
            popup.evaluate(
              async () => (await chrome.downloads.search({ state: 'complete' })).length
            ),
          { timeout: 45000 }
        )
        .toBe(before + 1);
      expect(
        await popup.evaluate(
          async () =>
            (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings'].captureAction
        )
      ).toBe('edit');
      const opened = context.waitForEvent('page');
      await page.locator(`[data-ui="content.toolbar.capture-${mode}-button"]`).click();
      const editor = await opened;
      await editor.waitForURL(/editor/);
      await editor.close();
      await page.bringToFront();
    }
  } finally {
    await page.close();
    await popup.close();
  }
});

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`independent scenario panel and ordinary captures ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await configureToolbar(popup, page, hostOrigin, 'horizontal');
      const toggle = page.locator('[data-ui="content.toolbar.scenario-panel-button"]');
      const sidebar = page.locator('[data-ui="content.scenario.sidebar"]');
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
      await expect(sidebar).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({
        path: info.outputPath('scenario-panel-toggle.png'),
        fullPage: false,
      });
      const editorPromise = context.waitForEvent('page');
      await page.locator('[data-ui="content.toolbar.capture-visible-button"]').click();
      const editor = await editorPromise;
      await expect(editor).toHaveURL(/\/editor\/index\.html/u);
      await editor.close();
      await page.bringToFront();
      await expect(sidebar.locator('[data-ui="content.scenario.sidebar.step"]')).toHaveCount(0);
      expect(
        await popup.evaluate(
          async () =>
            (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings'].captureAction
        )
      ).toBe('edit');
      await toggle.click();
      await expect(sidebar).toBeHidden();
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
      await expect(sidebar).toBeVisible();
      await page.locator('[data-ui="content.toolbar.settings-button"]').click();
      await page.locator('[data-ui="content.toolbar.settings.customize-buttons"]').click();
      const visibility = page.locator('[data-ui="content.toolbar.visibility.scenario-panel"]');
      await visibility.click();
      await expect(visibility).toHaveAttribute('aria-pressed', 'false');
      await expect(sidebar).toBeVisible();
      await page.locator('[data-ui="content.toolbar.customize-done"]').click();
      await expect(toggle).toHaveCount(0);
      expect(
        await popup.evaluate(
          async () =>
            (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings'].contentToolbar
              .pageControls['scenario-panel']
        )
      ).toBe(false);
    } finally {
      await page.close();
      await popup.close();
    }
  });
}
