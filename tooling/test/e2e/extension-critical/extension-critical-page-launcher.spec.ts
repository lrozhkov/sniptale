import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { triggerExtensionAction } from '../support/recording-action';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';

async function grantOrigin(popup: Page, origin: string) {
  await popup.evaluate((url) => {
    const button = document.createElement('button');
    button.textContent = 'Grant launcher proof';
    button.onclick = async () => {
      button.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${url}/*`] })
      );
    };
    document.body.append(button);
  }, origin);
  await popup.getByRole('button', { name: 'Grant launcher proof' }).click();
  await expect(popup.getByRole('button', { name: 'Grant launcher proof' })).toHaveAttribute(
    'data-granted',
    'true'
  );
}
async function checkCornerGrip(
  page: Page,
  popup: Page,
  group: Locator,
  grip: Locator,
  prefix: string,
  info: TestInfo
) {
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    await popup.evaluate(async (corner) => {
      const stored = await chrome.storage.sync.get('sniptale_settings');
      await chrome.storage.sync.set({
        sniptale_settings: {
          ...stored['sniptale_settings'],
          pageLaunch: { ...stored['sniptale_settings'].pageLaunch, corner },
        },
      });
    }, corner);
    await expect
      .poll(async () => {
        const box = await group.boundingBox();
        return Boolean(
          box &&
          (corner.endsWith('left') ? box.x < 100 : box.x > page.viewportSize()!.width / 2) &&
          (corner.startsWith('top') ? box.y < 100 : box.y > page.viewportSize()!.height / 2)
        );
      })
      .toBe(true);
    for (const background of ['#ffffff', '#111111']) {
      await page.evaluate((color) => {
        document.body.style.background = color;
      }, background);
      await group.hover();
      await expect(grip).toHaveCSS('opacity', '1');
      await grip.hover();
      if (background === '#ffffff') {
        const shell = (await group.boundingBox())!;
        const handle = (await grip.boundingBox())!;
        const x = Math.min(shell.x, handle.x) - 4;
        const y = Math.min(shell.y, handle.y) - 4;
        await page.screenshot({
          path: info.outputPath(`${prefix}-grip-${corner}.png`),
          fullPage: false,
          clip: {
            x,
            y,
            width: Math.max(shell.x + shell.width, handle.x + handle.width) - x + 4,
            height: Math.max(shell.y + shell.height, handle.y + handle.height) - y + 4,
          },
        });
      }
      const geometry = await grip.evaluate((button) => {
        const svg = button.querySelector('svg')!;
        const bounds = svg.getBoundingClientRect();
        const alpha = (color: string) =>
          color.startsWith('rgba')
            ? Number(color.slice(5, -1).split(',')[3])
            : color === 'transparent'
              ? 0
              : 1;
        const style = getComputedStyle(button);
        const before = getComputedStyle(button, '::before');
        return {
          width: bounds.width,
          height: bounds.height,
          backing: Math.max(
            alpha(style.backgroundColor),
            before.content !== 'none' ? alpha(before.backgroundColor) : 0
          ),
        };
      });
      expect(geometry.width).toBeGreaterThanOrEqual(12);
      expect(geometry.height).toBeGreaterThanOrEqual(12);
      expect
        .soft(geometry.backing, `${prefix} ${corner} ${background}`)
        .toBeGreaterThanOrEqual(0.9);
    }
  }
  await page.evaluate(() => {
    document.body.style.background = '';
  });
}

async function installLongQuickActionList(popup: Page) {
  await popup.evaluate(async () =>
    chrome.storage.local.set({
      sniptale_quick_actions: Array.from({ length: 48 }, (_, index) => ({
        id: `long-menu-${index}`,
        name: `Action ${index + 1}`,
        status: true,
        customized: true,
        hotkey: null,
        icon: 'Camera',
        screenshotMode: 'visible',
        afterCapture: 'download_default',
        exitAfterCapture: true,
        imageFormat: 'png',
        imageQuality: 100,
      })),
    })
  );
}

async function checkLongQuickActionMenu(
  page: Page,
  menu: Locator,
  items: Locator,
  native: boolean,
  prefix: string,
  info: TestInfo
) {
  await expect.poll(() => items.count()).toBeGreaterThanOrEqual(48);
  expect(await items.locator('svg[aria-hidden="true"]').count()).toBe(await items.count());
  const firstGlyph = items.first().locator('svg');
  const glyphSize = (await firstGlyph.boundingBox())!;
  expect(glyphSize.width).toBeGreaterThanOrEqual(16);
  expect(glyphSize.height).toBeGreaterThanOrEqual(16);
  const viewport = page.viewportSize()!;
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  await page.evaluate(() => {
    document.body.style.minHeight = '2000px';
  });
  const pageScroll = await page.evaluate(() => scrollY);
  await menu.hover();
  await page.mouse.wheel(0, 10000);
  await expect.poll(() => menu.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.mouse.wheel(0, 10000);
  expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
  await items.first().focus();
  if (native) await page.keyboard.press('End');
  else {
    const count = await items.count();
    for (let index = 1; index < count; index++) await page.keyboard.press('Tab');
  }
  await expect(items.last()).toBeFocused();
  const last = (await items.last().boundingBox())!;
  expect(last.y).toBeGreaterThanOrEqual(bounds.y);
  expect(last.y + last.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  await page.screenshot({ path: info.outputPath(`${prefix}-long-menu.png`), fullPage: false });
  await page.setViewportSize({ width: 1024, height: 480 });
  if (!native) {
    await expect(menu).toHaveCount(0);
    await page.locator('[data-ui="content.quick-actions.trigger"]:visible').click();
  }
  await expect
    .poll(async () => {
      const box = await menu.boundingBox();
      return Boolean(
        box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1024 && box.y + box.height <= 480
      );
    })
    .toBe(true);
  await page.screenshot({ path: info.outputPath(`${prefix}-narrow-menu.png`), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  await page.setViewportSize(viewport);
  if (!native) {
    await expect(menu).toHaveCount(0);
    await page.locator('[data-ui="content.quick-actions.trigger"]:visible').click();
    await expect(menu).toBeVisible();
  }
  await page.evaluate(() => {
    document.body.style.minHeight = '';
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`native page launcher handback, shared corner and quick actions ${name}`, async ({}, info) => {
    test.setTimeout(120000);
    const host = await startHostServer();
    const browser = await launchExtensionBrowser({ viewport: size });
    try {
      const page = await browser.context.newPage();
      await page.goto(host.origin);
      const popup = await browser.context.newPage();
      await popup.goto(
        `chrome-extension://${browser.extensionId}/apps/extension/src/popup/index.html`
      );
      await grantOrigin(popup, host.origin);
      await page.reload();
      const tabId = await popup.evaluate(async (url) => {
        const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
        if (tab?.id === undefined) throw new Error('Proof tab missing');
        return tab.id;
      }, page.url());
      const registration = await popup.evaluate(
        async (target) =>
          chrome.runtime.sendMessage({
            type: 'PAGE_ACCESS',
            operation: 'register-granted-site',
            tabId: target,
            __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
          }),
        tabId
      );
      expect(registration).toMatchObject({ success: true });
      await page.reload();
      const launcher = page.locator('#sniptale-page-launcher');
      await expect(launcher).toHaveCount(0);
      await popup.evaluate(async (wide) => {
        const result = await chrome.storage.sync.get('sniptale_settings');
        await chrome.storage.sync.set({
          sniptale_settings: {
            ...result['sniptale_settings'],
            pageLaunch: {
              enabled: true,
              hoverOnly: false,
              corner: 'bottom-right',
              quickActionsPopup: true,
              quickActionsCorner: true,
              quickActionsToolbar: true,
            },
          },
        });
        await chrome.storage.local.set({
          'sniptale-locale-preference': wide ? 'ru' : 'en',
          'sniptale-theme-preference': wide ? 'dark' : 'light',
        });
      }, size.width === 1920);
      await page.bringToFront();
      const open = launcher.getByRole('button', {
        name: /Open page toolbar|Открыть панель страницы/u,
      });
      await expect(open).toBeVisible();
      await expect(open).toHaveAttribute(
        'aria-label',
        size.width === 1920 ? 'Открыть панель страницы' : 'Open page toolbar'
      );
      await expect(page.locator('#sniptale-extension-root')).toHaveCount(0);
      await checkCornerGrip(
        page,
        popup,
        launcher.locator('.group'),
        launcher.getByRole('button', { name: /Move corner group|Переместить угловую группу/u }),
        'shim',
        info
      );
      const actions = launcher.getByRole('button', { name: /Quick actions|Быстрые действия/u });
      await actions.click();
      await expect(launcher.getByRole('menu')).toBeVisible();
      const shimExpandedIndicator = await actions.evaluate(
        (button) => getComputedStyle(button, '::before').borderTopColor
      );
      expect(
        await actions.evaluate((button) => getComputedStyle(button, '::before').content)
      ).not.toBe('none');
      await popup.evaluate(async () => {
        await chrome.storage.local.set({
          sniptale_quick_actions: [
            { id: 'default-visible-download', status: false, hotkey: null },
            {
              id: 'menu-refresh-proof',
              name: 'Updated menu',
              status: true,
              customized: true,
              hotkey: null,
              icon: 'Camera',
              screenshotMode: 'visible',
              afterCapture: 'download_default',
              exitAfterCapture: true,
              imageFormat: 'png',
              imageQuality: 100,
            },
          ],
        });
      });
      await expect(launcher.getByRole('menu')).toBeVisible();
      await expect(launcher.getByRole('menuitem', { name: 'Updated menu' })).toBeFocused();
      const updatedItem = launcher.getByRole('menuitem', { name: 'Updated menu' });
      const cameraGlyph = await updatedItem.locator('svg').innerHTML();
      await popup.evaluate(async () => {
        const stored = await chrome.storage.local.get('sniptale_quick_actions');
        await chrome.storage.local.set({
          sniptale_quick_actions: stored['sniptale_quick_actions'].map(
            (action: { id: string; icon?: string }) =>
              action.id === 'menu-refresh-proof' ? { ...action, icon: 'Zap' } : action
          ),
        });
      });
      await expect.poll(() => updatedItem.locator('svg').innerHTML()).not.toBe(cameraGlyph);
      await expect(updatedItem).toBeFocused();

      await popup.evaluate(async () => chrome.storage.local.remove('sniptale_quick_actions'));
      await expect(launcher.getByRole('menuitem', { name: 'Updated menu' })).toHaveCount(0);
      await expect(launcher.getByRole('menu')).toBeVisible();
      await installLongQuickActionList(popup);
      await checkLongQuickActionMenu(
        page,
        launcher.getByRole('menu'),
        launcher.getByRole('menuitem'),
        true,
        'shim',
        info
      );
      await popup.evaluate(async () => chrome.storage.local.remove('sniptale_quick_actions'));
      await page.keyboard.press('Escape');
      await expect(launcher.getByRole('menu')).toHaveCount(0);
      expect(
        await actions.evaluate((button) => getComputedStyle(button, '::before').borderTopColor)
      ).not.toBe(shimExpandedIndicator);
      // DOM-generated clicks cannot invoke the native opening capability.
      await open.evaluate((button: HTMLButtonElement) => button.click());
      await expect(page.locator('#sniptale-extension-root')).toHaveCount(0);
      await launcher.screenshot({ path: info.outputPath('launcher-corner.png') });
      await open.click();
      await expect(page.locator('[data-ui="content.toolbar.root"]')).toBeVisible();
      await expect(launcher).toHaveCount(0);
      const menu = page.locator('[data-ui="content.quick-actions.trigger"]');
      await expect(menu).toBeVisible();
      await page.mouse.move(size.width / 2, size.height / 2);
      const iconStyles = [];
      for (const dataUi of [
        'content.toolbar.timer-button',
        'content.toolbar.viewport-button',
        'content.quick-actions.trigger',
      ]) {
        iconStyles.push(
          await page.locator(`[data-ui="${dataUi}"] svg`).evaluate((svg) => {
            const style = getComputedStyle(svg);
            return {
              stroke: style.strokeWidth,
              color: style.color,
              width: style.width,
              height: style.height,
            };
          })
        );
      }
      expect(iconStyles[0]).toEqual(iconStyles[1]);
      expect(iconStyles[1]).toEqual(iconStyles[2]);
      await menu.click();
      await expect(
        page.locator('[data-ui="content.quick-actions.dropdown"] .sniptale-popover-menu')
      ).toBeVisible();
      const triggerBounds = (await menu.boundingBox())!;
      const menuBounds = (await page
        .locator('[data-ui="content.quick-actions.dropdown"] .sniptale-popover-menu')
        .boundingBox())!;
      expect(menuBounds.x).toBeCloseTo(Math.min(triggerBounds.x, size.width - 288), 0);
      expect(menuBounds.x + menuBounds.width).toBeGreaterThanOrEqual(triggerBounds.x);
      expect(menuBounds.y).toBeGreaterThanOrEqual(triggerBounds.y + triggerBounds.height);
      expect(menuBounds.y - triggerBounds.y - triggerBounds.height).toBeLessThan(20);
      await page.screenshot({ path: info.outputPath('toolbar-actions-menu.png'), fullPage: false });
      const indicator = () =>
        menu.evaluate((button) => {
          const style = getComputedStyle(button, '::before');
          return { content: style.content, opacity: style.opacity, color: style.borderTopColor };
        });
      const expandedIndicator = await indicator();
      expect(expandedIndicator.content).not.toBe('none');
      expect(expandedIndicator.opacity).toBe('1');
      await installLongQuickActionList(popup);
      await checkLongQuickActionMenu(
        page,
        page.locator('[data-ui="content.quick-actions.dropdown"] .sniptale-popover-menu'),
        page.locator('[data-ui="content.quick-actions.dropdown"] .sniptale-toolbar-menu-item'),
        false,
        'toolbar',
        info
      );
      await popup.evaluate(async () => chrome.storage.local.remove('sniptale_quick_actions'));

      await page.keyboard.press('Escape');
      expect((await indicator()).color).not.toBe(expandedIndicator.color);
      await page.locator('[data-ui="content.toolbar.navigation.collapse"]').click();
      const collapsed = page.locator('[data-ui="content.collapsed-panels"]');
      await expect(collapsed).toBeVisible();
      await expect(collapsed.locator('[data-ui="content.quick-actions.trigger"]')).toBeVisible();
      await collapsed.hover();
      const grip = collapsed.locator('[data-ui="content.collapsed-panels.drag-handle"]');
      await checkCornerGrip(page, popup, collapsed, grip, 'collapsed', info);
      const collapsedActions = collapsed.locator('[data-ui="content.quick-actions.trigger"]');
      await collapsedActions.click();
      await installLongQuickActionList(popup);
      await checkLongQuickActionMenu(
        page,
        page.locator('[data-ui="content.quick-actions.dropdown"] .sniptale-popover-menu'),
        page.locator('[data-ui="content.quick-actions.dropdown"] .sniptale-toolbar-menu-item'),
        false,
        'collapsed',
        info
      );
      await popup.evaluate(async () => chrome.storage.local.remove('sniptale_quick_actions'));
      await page.keyboard.press('Escape');

      await grip.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(collapsed).toHaveAttribute('data-corner', 'bottom-left');
      await collapsed.locator('[data-ui="content.collapsed-panels.restore-toolbar"]').click();
      await page.locator('[data-ui="content.toolbar.settings-button"]').click();
      await page.getByText(/^(Clear and close|Очистить и закрыть)$/u).click();
      await expect(page.locator('#sniptale-extension-root')).toHaveCount(0);
      await expect(open).toBeVisible();
      await expect(launcher.locator('.group')).toHaveCSS('left', '20px');
      const status = await popup.evaluate(
        async (target) =>
          chrome.scripting.executeScript({
            target: { tabId: target },
            func: async () =>
              chrome.runtime.sendMessage({
                type: 'SCREENSHOT_MODE_STATUS',
                __sniptaleRuntimeFreshness: {
                  issuedAtEpochMs: Date.now(),
                  nonce: crypto.randomUUID(),
                },
              }),
          }),
        tabId
      );
      expect(status[0]?.result).toMatchObject({ success: true });
      await expect(page.locator('#sniptale-extension-root')).toHaveCount(0);
      await expect(open).toBeVisible();
      await launcher.locator('.group').hover();
      const launcherGrip = launcher.getByRole('button', {
        name: /Move corner group|Переместить угловую группу/u,
      });
      const bounds = (await launcherGrip.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await expect(launcherGrip).toHaveCSS('cursor', 'grabbing');
      await page.mouse.move(size.width - 40, 40, { steps: 8 });
      await expect(launcher.locator('.guide-zone')).toHaveCount(4);
      await page.mouse.up();
      await expect(launcher.locator('.group')).toHaveCSS('right', '20px');
      await expect(launcher.locator('.group')).toHaveCSS('top', '20px');
      await page.reload();
      await expect(open).toBeVisible();
      await expect(launcher.locator('.group')).toHaveCSS('right', '20px');
      await expect(launcher.locator('.group')).toHaveCSS('top', '20px');
      await popup.evaluate(async () => {
        const stored = await chrome.storage.sync.get('sniptale_settings');
        await chrome.storage.sync.set({
          sniptale_settings: {
            ...stored['sniptale_settings'],
            pageLaunch: { ...stored['sniptale_settings'].pageLaunch, hoverOnly: true },
          },
        });
      });
      await page.mouse.move(size.width / 2, size.height / 2);
      await expect(launcher.locator('.group')).toHaveAttribute('data-hidden', 'true');
      await page.mouse.move(size.width - 20, 20);
      await expect(launcher.locator('.group')).toHaveAttribute('data-hidden', 'false');
      await page.screenshot({ path: info.outputPath('launcher-handback.png'), fullPage: false });
      await open.click();
      await page.locator('[data-ui="content.toolbar.navigation.collapse"]').click();
      await page.mouse.move(size.width / 2, size.height / 2);
      await expect(page.locator('[data-ui="content.collapsed-panels"]')).toBeVisible();
      await expect(launcher).toHaveCount(0);
      await page.setViewportSize({ width: 1000, height: 560 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false
      );
    } finally {
      await closeExtensionBrowser(browser);
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`page launcher and placement settings remain independent ${name}`, async ({}, info) => {
    const browser = await launchExtensionBrowser({ viewport: size });
    try {
      const page = await browser.context.newPage();
      const base = `chrome-extension://${browser.extensionId}/apps/extension/src/settings/index.html`;
      await page.goto(`${base}?section=interface-browser&view=interface`);
      await page.evaluate(async (wide) => {
        const locale = wide ? 'ru' : 'en';
        const theme = wide ? 'dark' : 'light';
        localStorage.setItem('sniptale-locale-preference', locale);
        localStorage.setItem('sniptale-theme-preference', theme);
        await chrome.storage.local.set({
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': theme,
        });
      }, size.width === 1920);
      await page.reload();
      const launcher = page.getByRole('switch', {
        name: /^(Page launcher|Кнопка запуска на странице)$/u,
      });
      const hover = page.getByRole('switch', {
        name: /Show only when hovering|Показывать только при наведении/u,
      });
      await expect(launcher).toHaveAttribute('aria-checked', 'false');
      await expect(hover).toBeDisabled();
      await launcher.click();
      await expect(launcher).toHaveAttribute('aria-checked', 'true');
      await expect(hover).toBeEnabled();
      await hover.click();
      await expect(hover).toHaveAttribute('aria-checked', 'true');
      await launcher.click();
      await expect(hover).toBeDisabled();
      await expect(hover).toHaveAttribute('aria-checked', 'true');
      await page.screenshot({ path: info.outputPath('launcher-settings.png'), fullPage: false });
      await page.goto(`${base}?section=quick-actions`);
      const popup = page.getByRole('switch', {
        name: /^(In the extension popup|В окне расширения)$/u,
      });
      const corner = page.getByRole('switch', {
        name: /^(In the page corner group|В угловой группе страницы)$/u,
      });
      const toolbar = page.getByRole('switch', {
        name: /^(In the page toolbar|На панели страницы)$/u,
      });
      await expect(popup).toHaveAttribute('aria-checked', 'true');
      await expect(corner).toHaveAttribute('aria-checked', 'false');
      await expect(toolbar).toHaveAttribute('aria-checked', 'false');
      await corner.click();
      await expect(corner).toHaveAttribute('aria-checked', 'true');
      await expect(toolbar).toHaveAttribute('aria-checked', 'false');
      await toolbar.click();
      await expect(toolbar).toHaveAttribute('aria-checked', 'true');
      await popup.click();
      await expect(popup).toHaveAttribute('aria-checked', 'false');
      await expect(corner).toHaveAttribute('aria-checked', 'true');
      await page.screenshot({ path: info.outputPath('placement-settings.png'), fullPage: false });
      await page.getByRole('button', { name: /^(Add action|Добавить действие)$/u }).click();
      const picker = page.locator('[data-ui="settings.quick-actions.icons"]');
      const camera = picker.getByRole('button', { name: 'Camera', exact: true });
      const download = picker.getByRole('button', { name: 'Download', exact: true });
      await expect(camera.locator('svg[aria-hidden="true"]')).toBeVisible();
      await download.click();
      await expect(download).toHaveAttribute('aria-pressed', 'true');
      const downloadGlyph = await download.locator('svg').innerHTML();
      await camera.click();
      await expect(camera).toHaveAttribute('aria-pressed', 'true');
      expect(await camera.locator('svg').innerHTML()).not.toBe(downloadGlyph);
      await page.screenshot({ path: info.outputPath('quick-action-picker.png'), fullPage: false });
      await page.getByRole('button', { name: /^(Cancel|Отмена)$/u, exact: true }).click();
      await popup.click();
      await expect(popup).toHaveAttribute('aria-checked', 'true');
      await page.evaluate(async () => {
        await chrome.storage.local.set({
          sniptale_quick_actions: [
            {
              id: 'popup-glyph-proof',
              name: 'Popup glyph proof',
              icon: 'Download',
              status: true,
              screenshotMode: 'visible',
              afterCapture: 'download_default',
              hotkey: null,
              exitAfterCapture: true,
              imageFormat: 'png',
              imageQuality: 100,
            },
          ],
        });
      });
      const popupPage = await browser.context.newPage();
      await popupPage.goto(
        `chrome-extension://${browser.extensionId}/apps/extension/src/popup/index.html`
      );
      await popupPage.getByRole('button', { name: /^(Screenshots|Снимки)$/u }).click();
      await popupPage.getByRole('button', { name: /^(Shortcuts|Действия)$/u }).click();
      const popupAction = popupPage.getByRole('button', { name: /Popup glyph proof/u });
      await expect(popupAction.locator('svg[aria-hidden="true"]')).toBeVisible();
      expect(await popupAction.locator('svg').first().innerHTML()).toBe(downloadGlyph);
      await popupPage.screenshot({
        path: info.outputPath('quick-action-popup.png'),
        fullPage: false,
      });
      await popupPage.close();

      await page.setViewportSize({ width: 1000, height: 560 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false
      );
    } finally {
      await closeExtensionBrowser(browser);
    }
  });
}

test('native corner quick action captures after its menu group is hidden', async ({}, info) => {
  const host = await startHostServer();
  const browser = await launchExtensionBrowser({ viewport: PRIMARY_BROWSER_VIEWPORTS[0].size });
  const directory = info.outputPath('downloads');
  await mkdir(directory, { recursive: true });
  const downloadSession = await browser.browser.newBrowserCDPSession();
  await downloadSession.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: directory,
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(host.origin);
    const settings = await browser.context.newPage();
    await settings.goto(
      `chrome-extension://${browser.extensionId}/apps/extension/src/settings/index.html?section=quick-actions`
    );
    await grantOrigin(settings, host.origin);
    await settings.evaluate(async (origin) => {
      const tab = (await chrome.tabs.query({})).find((entry) => entry.url === `${origin}/`);
      await chrome.runtime.sendMessage({
        type: 'PAGE_ACCESS',
        operation: 'register-granted-site',
        tabId: tab!.id,
        __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
      });
      const action = {
        id: 'native-menu-proof',
        icon: 'Camera',
        screenshotMode: 'visible',
        afterCapture: 'download_default',
        exitAfterCapture: true,
        imageFormat: 'png',
        imageQuality: 100,
      };
      await chrome.storage.local.set({
        sniptale_quick_actions: [
          { ...action, name: 'Native menu proof', customized: true, status: true, hotkey: null },
        ],
      });
      const saved = await chrome.storage.sync.get('sniptale_settings');
      await chrome.storage.sync.set({
        sniptale_settings: {
          ...saved['sniptale_settings'],
          pageLaunch: {
            enabled: true,
            corner: 'bottom-right',
            quickActionsCorner: true,
          },
        },
      });
    }, host.origin);
    await page.reload();
    await page.bringToFront();
    await triggerExtensionAction(browser.context, browser.extensionId, page);
    await page.bringToFront();
    await page.evaluate(() => {
      document.body.style.background = '#c8e4d9';
      for (const child of document.body.children)
        if (child instanceof HTMLElement && child.id !== 'sniptale-extension-root')
          child.style.visibility = 'hidden';
    });
    const launcher = page.locator('#sniptale-page-launcher');
    await launcher.getByRole('button', { name: /Quick actions|Быстрые действия/u }).click();
    await launcher.getByRole('menuitem', { name: 'Native menu proof' }).click();
    await expect
      .poll(async () => (await readdir(directory)).filter((name) => name.endsWith('.png')).length)
      .toBe(1);
    const filename = (await readdir(directory)).find((name) => name.endsWith('.png'))!;
    const bytes = await readFile(`${directory}/${filename}`);
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const result = await settings.evaluate(
      async (dataUrl) => {
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          group: [...context.getImageData(image.width - 40, image.height - 40, 1, 1).data],
          menu: [...context.getImageData(image.width - 70, image.height - 100, 1, 1).data],
        };
      },
      `data:image/png;base64,${bytes.toString('base64')}`
    );
    expect(result).toEqual({
      width: 1280,
      height: 560,
      group: [200, 228, 217, 255],
      menu: [200, 228, 217, 255],
    });
    await expect(
      launcher.getByRole('button', { name: /Open page toolbar|Открыть панель страницы/u })
    ).toBeVisible();
    await expect(page.locator('#sniptale-extension-root')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('corner-capture-completed.png'),
      fullPage: false,
    });
  } finally {
    await downloadSession.detach();
    await closeExtensionBrowser(browser);
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`quick action digit capture main collapsed shim ${name}`, async ({}, info) => {
    test.setTimeout(120000);
    const host = await startHostServer();
    const browser = await launchExtensionBrowser({ viewport: size });
    const logs: string[] = [];
    browser.context.on('console', (message) => logs.push(message.text()));
    const worker =
      browser.context.serviceWorkers()[0] ?? (await browser.context.waitForEvent('serviceworker'));
    await worker.evaluate(() => {
      const observed: string[] = [];
      Reflect.set(globalThis, '__digitQuickActionIds', observed);
      chrome.runtime.onMessage.addListener((message: unknown) => {
        if (
          message &&
          typeof message === 'object' &&
          'type' in message &&
          message.type === 'TRIGGER_QUICK_ACTION' &&
          'actionId' in message &&
          typeof message.actionId === 'string'
        )
          observed.push(message.actionId);
      });
    });
    const observedIds = () =>
      worker.evaluate(() => {
        const value: unknown = Reflect.get(globalThis, '__digitQuickActionIds');
        if (!Array.isArray(value)) throw new Error('Digit command observations missing');
        return value.map((entry: unknown) => {
          if (typeof entry !== 'string') throw new Error('Invalid digit command identity');
          return entry;
        });
      });
    const directory = info.outputPath('digit-downloads');
    await mkdir(directory, { recursive: true });
    const session = await browser.browser.newBrowserCDPSession();
    await session.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: directory,
    });
    try {
      const page = await browser.context.newPage();
      await page.goto(host.origin);
      const popup = await browser.context.newPage();
      await popup.goto(
        `chrome-extension://${browser.extensionId}/apps/extension/src/popup/index.html`
      );
      await grantOrigin(popup, host.origin);
      await page.reload();
      await popup.evaluate(async (origin) => {
        const tab = (await chrome.tabs.query({})).find((entry) => entry.url === `${origin}/`);
        if (tab?.id === undefined) throw new Error('Digit proof page missing');
        const registered = await chrome.runtime.sendMessage({
          type: 'PAGE_ACCESS',
          operation: 'register-granted-site',
          tabId: tab.id,
          __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
        });
        if (!registered?.success) throw new Error('Digit proof site registration failed');
      }, host.origin);
      await popup.evaluate(async (wide) => {
        const saved = (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings'];
        await chrome.storage.sync.set({
          sniptale_settings: {
            ...saved,
            pageLaunch: {
              enabled: true,
              hoverOnly: false,
              corner: 'bottom-right',
              quickActionsCorner: true,
              quickActionsToolbar: true,
            },
          },
        });
        const action = {
          icon: 'Camera',
          screenshotMode: 'visible',
          afterCapture: 'download_default',
          exitAfterCapture: true,
          imageQuality: 100,
          customized: true,
          hotkey: null,
        };
        await chrome.storage.local.set({
          'sniptale-locale-preference': wide ? 'ru' : 'en',
          'sniptale-theme-preference': wide ? 'dark' : 'light',
          sniptale_quick_actions: [
            {
              ...action,
              id: 'digit-disabled',
              name: 'Disabled choice',
              status: false,
              imageFormat: 'jpeg',
            },
            ...Array.from({ length: 11 }, (_, index) => ({
              ...action,
              id: `digit-choice-${index}`,
              name: `Choice ${index + 1}`,
              status: true,
              imageFormat: 'png',
            })),
          ],
        });
      }, size.width === 1920);
      await page.reload();
      await page.bringToFront();
      await page
        .locator('#sniptale-page-launcher')
        .getByRole('button', { name: /Open page toolbar|Открыть панель страницы/u })
        .click();
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.cursor"]').click();
      await page.evaluate(() => {
        document.body.style.background = '#c8e4d9';
        for (const child of document.body.children)
          if (child instanceof HTMLElement && child.id !== 'sniptale-extension-root')
            child.style.visibility = 'hidden';
      });
      const launcher = page.locator('#sniptale-page-launcher');
      for (const [surface, key, actionId] of [
        ['main', '0', 'digit-choice-9'],
        ['collapsed', '1', 'digit-choice-0'],
        ['shim', '0', 'digit-choice-9'],
      ] as const) {
        if (surface === 'collapsed') {
          await page.locator('[data-ui="content.toolbar.navigation.collapse"]').click();
        }
        const captureDirectory = `${directory}/${surface}`;
        await mkdir(captureDirectory, { recursive: true });
        await session.send('Browser.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: captureDirectory,
        });
        const trigger =
          surface === 'shim'
            ? launcher.getByRole('button', { name: /Quick actions|Быстрые действия/u })
            : page.locator('[data-ui="content.quick-actions.trigger"]:visible');
        await trigger.click();
        const menu =
          surface === 'shim'
            ? launcher.getByRole('menu')
            : page.locator('[data-ui="content.quick-actions.dropdown"] .sniptale-popover-menu');
        const rows =
          surface === 'shim'
            ? menu.getByRole('menuitem')
            : menu.locator('.sniptale-toolbar-menu-item');
        await expect(rows.first()).toContainText('Choice 1');
        await expect(menu.locator('kbd')).toHaveText([
          '1',
          '2',
          '3',
          '4',
          '5',
          '6',
          '7',
          '8',
          '9',
          '0',
        ]);
        await expect(rows.nth(10).locator('kbd')).toHaveCount(0);
        await expect(menu).not.toContainText('Disabled choice');
        const before = new Set(await readdir(captureDirectory));
        const previousIds = await observedIds();
        await rows.first().evaluate((element) =>
          element.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: '0',
              bubbles: true,
              composed: true,
              cancelable: true,
            })
          )
        );
        await expect(menu).toBeVisible();
        expect(await readdir(captureDirectory)).toEqual([...before]);
        await page.evaluate(() => {
          const host = document.createElement('section');
          host.id = 'quick-digit-field';
          host.style.cssText = 'position:fixed;left:8px;top:8px';
          const input = document.createElement('input');
          host.attachShadow({ mode: 'open' }).append(input);
          document.body.append(host);
          input.focus({ preventScroll: true });
        });
        await page.keyboard.type(key);
        await expect(page.locator('#quick-digit-field input')).toHaveValue(key);
        expect(await observedIds()).toEqual(previousIds);
        if (surface === 'shim') await expect(menu).toBeVisible();
        else {
          await expect(menu).toHaveCount(0);
          await trigger.click();
        }
        if (surface === 'shim') await rows.first().focus();
        await page.evaluate(() => document.querySelector('#quick-digit-field')?.remove());
        const menuBounds = (await menu.boundingBox())!;
        const menuPoint = {
          x: Math.floor(menuBounds.x + menuBounds.width / 2),
          y: Math.floor(menuBounds.y + menuBounds.height / 2),
        };
        await page.screenshot({
          path: info.outputPath(`digit-menu-${surface}.png`),
          fullPage: false,
        });
        if (surface !== 'shim') {
          await page.evaluate(() => {
            const seen: string[] = [];
            const guard = new AbortController();
            Reflect.set(window, '__quickMenuSiteDigits', seen);
            Reflect.set(window, '__quickMenuSiteAbort', guard);
            document.addEventListener(
              'keydown',
              (event) => {
                if (!/^[0-9]$/.test(event.key)) return;
                seen.push(event.key);
                event.preventDefault();
                event.stopImmediatePropagation();
              },
              { capture: true, signal: guard.signal }
            );
          });
        }
        await page.keyboard.press(key);
        if (surface !== 'shim') {
          const siteDigits = await page.evaluate(() => {
            const guard: unknown = Reflect.get(window, '__quickMenuSiteAbort');
            if (!(guard instanceof AbortController)) throw new Error('Site keyboard guard missing');
            guard.abort();
            return Reflect.get(window, '__quickMenuSiteDigits');
          });
          expect(siteDigits).toEqual([]);
        }
        await expect(menu).toHaveCount(0);
        await expect.poll(observedIds).toEqual([...previousIds, actionId]);
        await expect
          .poll(
            async () =>
              (await readdir(captureDirectory)).filter(
                (file) => !before.has(file) && file.endsWith('.png')
              ).length
          )
          .toBe(1);
        const file = (await readdir(captureDirectory)).find(
          (file) => !before.has(file) && file.endsWith('.png')
        )!;
        const bytes = await readFile(`${captureDirectory}/${file}`);
        const raster = await popup.evaluate(
          async ({ dataUrl, menuPoint }) => {
            const image = new Image();
            image.src = dataUrl;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d')!;
            context.drawImage(image, 0, 0);
            return {
              width: image.width,
              height: image.height,
              toolbar: [...context.getImageData(Math.floor(image.width / 2), 30, 1, 1).data],
              corner: [...context.getImageData(image.width - 40, image.height - 40, 1, 1).data],
              menu: [...context.getImageData(menuPoint.x, menuPoint.y, 1, 1).data],
            };
          },
          { dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, menuPoint }
        );
        expect(raster).toEqual({
          width: size.width,
          height: size.height,
          toolbar: [200, 228, 217, 255],
          corner: [200, 228, 217, 255],
          menu: [200, 228, 217, 255],
        });
        if (surface === 'main') {
          await expect(page.locator('[data-ui="content.toolbar.root"]')).toHaveAttribute(
            'data-page-mode',
            'cursor'
          );
        } else {
          if (surface === 'collapsed') {
            await page.locator('[data-ui="content.collapsed-panels.restore-toolbar"]').click();
            await page.locator('[data-ui="content.toolbar.settings-button"]').click();
            await page.getByText(/^(Clear and close|Очистить и закрыть)$/u).click();
          }
          await expect(page.locator('#sniptale-extension-root')).toHaveCount(0);
          await expect(
            launcher.getByRole('button', { name: /Open page toolbar|Открыть панель страницы/u })
          ).toBeVisible();
        }
      }
    } catch (error) {
      await writeFile(
        info.outputPath('digit-diagnostics.json'),
        JSON.stringify(
          {
            logs: logs.slice(-60),
            downloads: await worker.evaluate(async () =>
              (await chrome.downloads.search({})).map(({ id, state, mime, filename, error }) => ({
                id,
                state,
                mime,
                filename,
                error,
              }))
            ),
          },
          null,
          2
        )
      );
      throw error;
    } finally {
      await session.detach();
      await closeExtensionBrowser(browser);
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
