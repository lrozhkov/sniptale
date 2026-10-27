import { mkdir, readdir, readFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
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
    test(`navigation pin chrome ${theme} ${name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      try {
        await popup.evaluate(async (theme) => {
          await chrome.storage.local.set({
            'sniptale-theme-preference': theme,
            'sniptale-locale-preference': theme === 'light' ? 'en' : 'ru',
          });
          const grant = document.createElement('button');
          grant.textContent = 'Grant pin proof';
          grant.onclick = async () => {
            grant.dataset['granted'] = String(
              await chrome.permissions.request({ origins: ['<all_urls>'] })
            );
          };
          document.body.append(grant);
        }, theme);
        const grant = popup.getByRole('button', { name: 'Grant pin proof' });
        await grant.click();
        await expect(grant).toHaveAttribute('data-granted', 'true');
        for (const orientation of ['horizontal', 'vertical'] as const) {
          await configureToolbar(popup, page, hostOrigin, orientation);
          const pin = page.locator('[data-ui="content.toolbar.navigation.pin-to-tab"]');
          await expect(pin).toBeEnabled();
          const readPinned = () =>
            popup.evaluate(async (origin) => {
              const tab = (await chrome.tabs.query({})).find((tab) => tab.url === `${origin}/`);
              const key = `sniptale.content.pin-to-tab:tab:${tab!.id}`;
              return (await chrome.storage.session.get(key))[key] === true;
            }, hostOrigin);
          await expect(pin).toHaveAttribute('aria-pressed', 'false');
          const inactiveColor = await pin
            .locator('svg')
            .evaluate((icon) => getComputedStyle(icon).stroke);
          const inactiveIcon = await pin.locator('svg').getAttribute('class');
          await page.mouse.move(10, 100);
          await expect(pin).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
          await pin.hover();
          await expect(pin).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
          await pin.click();
          await expect(pin).toHaveAttribute('aria-pressed', 'true');
          await expect.poll(readPinned).toBe(true);
          await page.mouse.move(10, 100);
          await expect(pin).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
          await expect(pin).toHaveCSS('box-shadow', 'none');
          await expect(pin.locator('svg')).not.toHaveAttribute('class', inactiveIcon!);
          await expect
            .poll(() => pin.locator('svg').evaluate((icon) => getComputedStyle(icon).stroke))
            .not.toBe(inactiveColor);
          await pin.hover();
          await expect(pin).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
          await page.mouse.down();
          await expect(pin).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
          await page.mouse.move(10, 100);
          await page.mouse.up();
          await expect(pin).toHaveAttribute('aria-pressed', 'true');
          await page.getByRole('button', { name: 'Host action', exact: true }).click();
          await page.screenshot({
            path: info.outputPath(`navigation-pin-${orientation}-rest.png`),
            fullPage: false,
            animations: 'disabled',
          });
          await pin.focus();
          await pin.press('Tab');
          await page.keyboard.press('Shift+Tab');
          await expect(pin).toBeFocused();
          await expect(pin).toHaveCSS('outline-style', 'solid');
          await page.screenshot({
            path: info.outputPath(`navigation-pin-${orientation}.png`),
            fullPage: false,
            animations: 'disabled',
          });
          await pin.press('Enter');
          await expect(pin).toHaveAttribute('aria-pressed', 'false');
          await expect.poll(readPinned).toBe(false);
        }
      } finally {
        await page.close();
        await popup.close();
      }
    });

    test(`collapsed toolbar pin lifecycle ${theme} ${name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      test.setTimeout(180_000);
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      page.setDefaultTimeout(10_000);
      try {
        await popup.evaluate(async (theme) => {
          await chrome.storage.local.set({
            'sniptale-theme-preference': theme,
            'sniptale-locale-preference': theme === 'light' ? 'en' : 'ru',
          });
          const grant = document.createElement('button');
          grant.textContent = 'Grant collapse proof';
          grant.onclick = async () => {
            grant.dataset['granted'] = String(
              await chrome.permissions.request({ origins: ['<all_urls>'] })
            );
          };
          document.body.append(grant);
        }, theme);
        const grant = popup.getByRole('button', { name: 'Grant collapse proof' });
        await grant.click();
        await expect(grant).toHaveAttribute('data-granted', 'true');
        await configureToolbar(
          popup,
          page,
          hostOrigin,
          theme === 'light' ? 'horizontal' : 'vertical'
        );
        const tabId = await popup.evaluate(
          async (origin) =>
            (await chrome.tabs.query({})).find((tab) => tab.url === `${origin}/`)!.id!,
          hostOrigin
        );
        const session = () =>
          popup.evaluate(async (id) => {
            const pin = `sniptale.content.pin-to-tab:tab:${id}`;
            const automatic = `sniptale.content.pin-to-tab-automatic:tab:${id}`;
            const visible = `sniptale.content.pin-to-tab-toolbar-visible:tab:${id}`;
            const stored = await chrome.storage.session.get([pin, automatic, visible]);
            return {
              pin: stored[pin] === true,
              automatic: stored[automatic] === true,
              visible: stored[visible] !== false,
            };
          }, tabId);
        const root = page.locator('[data-ui="content.toolbar.root"]');
        const restore = page.locator('[data-ui="content.collapsed-panels.restore-toolbar"]');
        const pin = page.locator('[data-ui="content.toolbar.navigation.pin-to-tab"]');
        await expect(pin).toHaveAttribute('aria-pressed', 'false');
        await page.locator('[data-ui="content.toolbar.navigation.collapse"]').click();
        await expect.poll(session).toEqual({ pin: true, automatic: true, visible: false });
        const crossSite = new URL(hostOrigin);
        crossSite.hostname = 'localhost';
        for (const destination of [page.url(), `${hostOrigin}/?collapsed=1`, crossSite.href]) {
          await page.goto(destination);
          await expect(restore).toBeVisible();
          await expect(root).toBeHidden();
          await expect.poll(session).toEqual({ pin: true, automatic: true, visible: false });
        }
        await page.screenshot({
          path: info.outputPath('automatic-pin-collapsed.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await restore.click();
        await expect(root).toBeVisible();
        await expect.poll(session).toEqual({ pin: false, automatic: false, visible: true });
        await expect(pin).toHaveAttribute('aria-pressed', 'false');
        await page.locator('[data-ui="content.toolbar.settings-button"]').click();
        await page
          .getByRole('button', {
            name: translate('content.toolbar.hideToolbar', theme === 'light' ? 'en' : 'ru'),
            exact: true,
          })
          .click();
        await expect.poll(session).toEqual({ pin: true, automatic: true, visible: false });
        await page.reload();
        await expect(restore).toBeVisible();
        await restore.press('Enter');
        await expect(root).toBeVisible();
        await expect.poll(session).toEqual({ pin: false, automatic: false, visible: true });
        await pin.click();
        await expect.poll(session).toEqual({ pin: true, automatic: false, visible: true });
        await page.locator('[data-ui="content.toolbar.navigation.collapse"]').click();
        await expect.poll(session).toEqual({ pin: true, automatic: false, visible: false });
        await page.reload();
        await expect(restore).toBeVisible();
        await restore.click();
        await expect(root).toBeVisible();
        await expect.poll(session).toEqual({ pin: true, automatic: false, visible: true });
        await expect(pin).toHaveAttribute('aria-pressed', 'true');
        await page.screenshot({
          path: info.outputPath('manual-pin-expanded.png'),
          fullPage: false,
          animations: 'disabled',
        });
        await pin.click();
        await expect.poll(session).toEqual({ pin: false, automatic: false, visible: true });
      } finally {
        await page.close();
        await popup.close();
      }
    });

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
            const disclosure = menu.locator(
              `[data-ui="content.toolbar.${mode}-capture-parameters"]`
            );
            const summary = disclosure.locator('summary');
            const savedBefore = await popup.evaluate(
              async () => (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
            );
            await expect(disclosure).not.toHaveAttribute('open');
            await expect(summary).toHaveText(/^(Options|Параметры)$/u);
            await expect(summary.locator('svg').last()).toHaveCSS(
              'transform',
              'matrix(0, -1, 1, 0, 0, 0)'
            );
            await expect(menu.getByRole('button', { name: 'JPEG', exact: true })).toBeHidden();
            await page.screenshot({
              path: info.outputPath(`${orientation}-${mode}-collapsed.png`),
              fullPage: false,
              animations: 'disabled',
            });
            await summary.focus();
            await summary.press('Enter');
            await expect(disclosure).toHaveAttribute('open');
            await expect(summary.locator('svg').last()).toHaveCSS(
              'transform',
              'matrix(1, 0, 0, 1, 0, 0)'
            );
            await summary.press('Space');
            await expect(disclosure).not.toHaveAttribute('open');
            expect(
              await popup.evaluate(
                async () =>
                  (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
              )
            ).toEqual(savedBefore);
            await page.emulateMedia({ reducedMotion: 'no-preference' });
            const expansion = await disclosure.evaluate((node) => {
              const style = getComputedStyle(node, '::details-content');
              return { properties: style.transitionProperty, duration: style.transitionDuration };
            });
            expect(expansion.properties).toContain('block-size');
            expect(expansion.duration).toBe('0.16s, 0.16s');
            await summary.click();
            await expect(disclosure).toHaveAttribute('open');
            await expect(menu.getByRole('button', { name: 'JPEG', exact: true })).toBeVisible();
            await page.emulateMedia({ reducedMotion: 'reduce' });
            expect(
              await disclosure.evaluate(
                (node) => getComputedStyle(node, '::details-content').transitionDuration
              )
            ).toBe('0s');
            await page.emulateMedia({ reducedMotion: 'no-preference' });
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
            await expect(summary).toHaveText(/^(Options|Параметры)$/u);
            const input = menu.getByRole('textbox', {
              name: /Image quality|Качество изображения/u,
            });
            const labels = await menu
              .locator('.sniptale-capture-image-parameters .sniptale-parameter-name')
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
            expect((await field.boundingBox())!.width).toBeLessThanOrEqual(100);
            const formatRow = menu
              .locator('.sniptale-capture-image-parameters .sniptale-parameter-row')
              .first();
            const formatLabel = (await formatRow
              .locator('.sniptale-parameter-name')
              .boundingBox())!;
            const jpeg = menu.getByRole('button', { name: 'JPEG', exact: true });
            const formatButton = (await jpeg.boundingBox())!;
            expect(
              Math.abs(
                formatLabel.y + formatLabel.height / 2 - formatButton.y - formatButton.height / 2
              )
            ).toBeLessThanOrEqual(1);
            const label = jpeg.locator('.sniptale-interface-label');
            const beforeHover = await label.evaluate((node) => ({
              font: getComputedStyle(node).font,
              transform: getComputedStyle(node).transform,
            }));
            await jpeg.hover();
            await expect
              .poll(() =>
                label.evaluate((node) => ({
                  font: getComputedStyle(node).font,
                  transform: getComputedStyle(node).transform,
                }))
              )
              .toEqual(beforeHover);
            await input.focus();
            await expect(field).toHaveCSS('outline-style', 'none');
            await page.screenshot({
              path: info.outputPath(`${orientation}-${mode}-quality-focus.png`),
              fullPage: false,
              animations: 'disabled',
            });
            const accepted = await input.inputValue();
            await input.fill('77');
            await input.press('Escape');
            await expect(input).toHaveValue(accepted);
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
            await expect(summary).toHaveText(/^(Options|Параметры)$/u);
            await summary.click();
            await expect(input).toBeHidden();
            await expect(summary).toHaveText(/^(Options|Параметры)$/u);
            await summary.press('Enter');
            await expect(input).toHaveValue('76');
            await page.screenshot({
              path: info.outputPath(`${orientation}-${mode}-quality.png`),
              fullPage: false,
              animations: 'disabled',
            });
            await menu.getByRole('button', { name: 'PNG', exact: true }).click();
            await expect(input).toHaveCount(0);
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
              animations: 'disabled',
            });
            await icons.first().focus();
            await page.keyboard.press('Escape');
            await expect(menu).toHaveCount(0);
            await expect(trigger).toBeFocused();
            await trigger.click();
            await expect(disclosure).toHaveAttribute('open');
            await summary.click();
            await expect(disclosure).not.toHaveAttribute('open');
            if (mode === 'full') {
              const value = summary.locator('h4');
              const original = await value.textContent();
              await value.evaluate((node, text) => {
                node.textContent = `${text} · ${text}`;
                node.style.fontSize = '16.25px';
              }, original);
              await expect(value).toHaveCSS('font-size', '16.25px');
              expect(await value.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
                true
              );
              const expandedBox = (await summary.boundingBox())!;
              expect(expandedBox.x + expandedBox.width).toBeLessThanOrEqual(size.width);
              await page.screenshot({
                path: info.outputPath(`${orientation}-parameters-expanded-text.png`),
                fullPage: false,
                animations: 'disabled',
              });
              await value.evaluate((node, text) => {
                node.textContent = text;
                node.style.fontSize = '';
              }, original);
            }
            await page.keyboard.press('Escape');
            await expect(menu).toHaveCount(0);
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
            animations: 'disabled',
          });
          await defaults.locator('[data-ui="content.toolbar.capture-action-option.copy"]').click();
          await page.setViewportSize({ width: 1000, height: size.height });
          await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
            .toBeLessThanOrEqual(1);
          await page.setViewportSize(size);
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
      const restore = page.locator('[data-ui="content.scenario.sidebar.restore"]');
      await expect(restore).toHaveCount(0);
      await toggle.click();
      await expect(sidebar).toBeVisible();
      await page.locator('[data-ui="content.scenario.sidebar.project-button"]').click();
      const picker = page.locator('[data-ui="content.scenario.sidebar.project-picker"]');
      const projectName = `Close and reopen ${name}`;
      await picker.getByRole('textbox').fill(projectName);
      await picker.getByRole('button', { name: /Create project|Создать проект/u }).click();
      await expect(sidebar).toContainText(projectName);
      await page.locator('[data-ui="content.scenario.sidebar.capture-visible"]').click();
      const steps = sidebar.locator('[data-ui="content.scenario.sidebar.step"]');
      await expect(steps).toHaveCount(1);
      await page.locator('[data-ui="content.scenario.sidebar.collapse"]').click();
      await expect(restore).toBeVisible();
      await restore.click();
      await expect(steps).toHaveCount(1);
      const close = page.locator('[data-ui="content.scenario.sidebar.close"]');
      await close.focus();
      await page.keyboard.press('Enter');
      await expect(sidebar).toBeHidden();
      await expect(restore).toHaveCount(0);
      await expect(toggle).toBeFocused();
      await toggle.click();
      await expect(sidebar).toContainText(projectName);
      await expect(steps).toHaveCount(1);
      await page.screenshot({
        path: info.outputPath('scenario-close-reopened.png'),
        fullPage: false,
      });
      await toggle.click();
      await expect(sidebar).toBeHidden();
      await expect(restore).toHaveCount(0);
      await toggle.click();
      await expect(steps).toHaveCount(1);
      await page.setViewportSize({ width: 1024, height: 560 });
      const bounds = await close.boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1024);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(560);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await page.screenshot({ path: info.outputPath('scenario-close-short.png'), fullPage: false });
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

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`collapsed screenshot parameters retain real capture output ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
    launchedExtension,
  }, info) => {
    test.setTimeout(120000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    page.setDefaultTimeout(10000);
    const locale = size.width === 1280 ? 'en' : 'ru';
    const directory = info.outputPath('parameter-downloads');
    await mkdir(directory, { recursive: true });
    const session = await launchedExtension.browser.newBrowserCDPSession();
    await session.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: directory,
    });
    try {
      await popup.evaluate(async (locale) => {
        const current = (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings'];
        await chrome.storage.sync.set({
          sniptale_settings: {
            ...current,
            imageFormat: 'png',
            imageQuality: 83,
            pageLaunch: {
              enabled: true,
              hoverOnly: false,
              corner: 'bottom-right',
              quickActionsCorner: true,
              quickActionsToolbar: true,
            },
            fullPageCapture: {
              preloadLazyContent: true,
              freezeMotion: true,
              floatingElements: 'once',
            },
          },
        });
        await chrome.storage.local.set({
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': locale === 'ru' ? 'dark' : 'light',
        });
      }, locale);
      await page.reload();
      await page.bringToFront();
      await page
        .locator('#sniptale-page-launcher')
        .getByRole('button', { name: /Open page toolbar|Открыть панель страницы/u })
        .click();
      await page.evaluate(() => {
        document.body.style.minHeight = '1200px';
        const marker = document.createElement('div');
        marker.id = 'capture-floating-proof';
        marker.style.cssText =
          'position:fixed;right:20px;top:20px;width:50px;height:50px;background:#ff00ff;z-index:1000000';
        document.body.append(marker);
      });
      for (const [mode, format] of [
        ['visible', 'webp'],
        ['full', 'jpeg'],
      ] as const) {
        const root = page.locator('[data-ui="content.toolbar.root"]');
        await expect(root).toBeVisible();
        await page.locator(`[data-ui="content.toolbar.capture-${mode}-settings-button"]`).click();
        const menu = page.locator(
          `[data-ui="content.toolbar.${mode === 'full' ? 'full' : 'visible'}-page-menu"]`
        );
        const details = menu.locator('details');
        const summary = details.locator('summary');
        await expect(details).not.toHaveAttribute('open');
        await summary.click();
        await menu
          .getByRole('button', { name: format === 'webp' ? 'WebP' : 'JPEG', exact: true })
          .click();
        const input = menu.getByRole('textbox', { name: /Image quality|Качество изображения/u });
        await input.fill('76');
        await input.press('Enter');
        if (mode === 'full') {
          for (const key of ['fullPageLazyContent', 'fullPageFreezeMotion'] as const)
            await menu
              .getByRole('button')
              .filter({ hasText: translate(`content.toolbar.${key}`, locale) })
              .click();
          await menu.locator('[data-ui="content.toolbar.full-page-floating.hide"]').click();
        }
        await expect
          .poll(() =>
            popup.evaluate(async () => {
              const value = (await chrome.storage.sync.get('sniptale_settings'))[
                'sniptale_settings'
              ];
              return {
                format: value.imageFormat,
                quality: value.imageQuality,
                full: value.fullPageCapture,
              };
            })
          )
          .toEqual({
            format,
            quality: 76,
            full: {
              preloadLazyContent: mode !== 'full',
              freezeMotion: mode !== 'full',
              floatingElements: mode === 'full' ? 'hide' : 'once',
            },
          });
        await summary.click();
        await expect(details).not.toHaveAttribute('open');
        await expect(summary).toHaveText(/^(Options|Параметры)$/u);
        await page.screenshot({
          path: info.outputPath(`${mode}-accepted-collapsed.png`),
          fullPage: false,
          animations: 'disabled',
        });
        const previous = new Set(await readdir(directory));
        await menu
          .locator(`[data-ui="content.toolbar.capture-${mode}-action.download_default"]`)
          .click();
        let downloaded: string | undefined;
        await expect
          .poll(
            async () => {
              downloaded = (await readdir(directory)).find(
                (file) =>
                  !previous.has(file) &&
                  (file.endsWith(`.${format}`) || (format === 'jpeg' && file.endsWith('.jpg')))
              );
              return Boolean(downloaded);
            },
            { timeout: 30000 }
          )
          .toBe(true);
        const bytes = await readFile(`${directory}/${downloaded!}`);
        if (format === 'webp') {
          expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
          expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
        } else expect(Array.from(bytes.subarray(0, 3))).toEqual([255, 216, 255]);
        const result = await page.evaluate(
          async ({ data, mime }) => {
            const bitmap = await createImageBitmap(
              new Blob([new Uint8Array(data)], { type: mime })
            );
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(bitmap, 0, 0);
            const pixel = Array.from(ctx.getImageData(bitmap.width - 45, 45, 1, 1).data);
            const dimensions = { width: bitmap.width, height: bitmap.height };
            bitmap.close();
            return { ...dimensions, pixel };
          },
          { data: Array.from(bytes), mime: `image/${format}` }
        );
        expect(result.width).toBe(size.width);
        expect(result.height).toBeGreaterThanOrEqual(size.height);
        if (mode === 'visible') {
          expect(result.pixel[0]).toBeGreaterThan(230);
          expect(result.pixel[1]).toBeLessThan(30);
          expect(result.pixel[2]).toBeGreaterThan(230);
        } else expect(result.pixel[1]).toBeGreaterThan(200);
        await expect(page.locator('#capture-floating-proof')).toBeVisible();
      }
    } finally {
      await session.detach();
      await popup.close();
      await page.close();
    }
  });
}
