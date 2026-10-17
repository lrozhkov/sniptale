import { writeFile } from 'node:fs/promises';
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import {
  translate,
  type AppLocale,
  type TranslationKey,
} from '../../../../apps/extension/src/platform/i18n';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { startHostServer } from '../support/host-server';
import { openRealPopup, sendRuntimeMessage } from '../support/recording-action';

type Composition = { locale: AppLocale; theme: 'light' | 'dark' };
const sizes = [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
];
const presetName = 'Synthetic long reference folder preset for saved captures and exported images';
const presetPath = 'Synthetic reference captures/Long nested directory for utility composition';
const windowPreset = 'Synthetic reference window 640 × 480';
const filenameDraft = 'Synthetic long filename with a complete editable reference description.png';
const ui = (page: Page, id: string) => page.locator(`[data-ui="${id}"]`);
const tr = (c: Composition, key: TranslationKey) => translate(key, c.locale);
const button = (owner: Page | Locator, c: Composition, key: TranslationKey) =>
  owner.getByRole('button', { name: tr(c, key), exact: true });

test.use({ actionTimeout: 10_000 });
test.setTimeout(120_000);

async function capture(page: Page, info: TestInfo, name: string) {
  await expect(page.locator('.sniptale-toast')).toHaveCount(0);
  const root = page.getByRole('dialog');
  if (await root.count()) {
    await root.evaluate(async (element) => {
      await Promise.allSettled(
        element
          .getAnimations({ subtree: true })
          .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
          .map((animation) => animation.finished)
      );
    });
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: false,
    animations: 'disabled',
  });
}

async function inViewport(page: Page, target: Locator) {
  const bounds = await target.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error('Visible target or controlled viewport unavailable');
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.y).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function configure(context: BrowserContext, extensionId: string, c: Composition) {
  const settings = await context.newPage();
  await settings.setViewportSize(sizes[0]!);
  try {
    const path = `chrome-extension://${extensionId}/apps/extension/src/settings/index.html`;
    await settings.goto(`${path}?section=interface-browser&view=interface`);
    const language = settings.locator('#settings-interface-language');
    await expect(language).toBeEnabled();
    await language.click();
    await settings
      .getByRole('option', { name: c.locale === 'en' ? 'English' : /^(Russian|Русский)$/u })
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
      .toBe(c.locale);
    // Established native-suite preference setup; form drafts and preset persistence use actual UI below.
    await settings.evaluate(async (theme) => {
      localStorage.setItem('sniptale-theme-preference', theme);
      await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
    }, c.theme);
    await settings.goto(`${path}?section=saving&view=templates`);
    await expect(settings.locator('html')).toHaveAttribute('lang', c.locale);
    await expect
      .poll(() =>
        settings.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale-locale-preference'))[
              'sniptale-locale-preference'
            ]
        )
      )
      .toBe(c.locale);
    await button(settings, c, 'savePresets.section.addButton').click();
    const editor = settings.getByRole('dialog');
    await editor
      .getByRole('textbox', { name: tr(c, 'savePresets.editor.nameLabel'), exact: true })
      .fill(presetName);
    await editor.locator('#save-preset-path').fill(presetPath);
    await editor.locator('button[type="submit"]').click();
    await expect(editor).toHaveCount(0);
    await expect(settings.getByText(presetName, { exact: true })).toBeVisible();
    if (c.locale === 'en' && c.theme === 'light') {
      await settings.goto(`${path}?section=screen-sizes`);
      await button(settings, c, 'viewportPresets.section.addButton').click();
      const windowEditor = settings.getByRole('dialog');
      await windowEditor
        .getByRole('textbox', { name: tr(c, 'viewportPresets.editor.nameLabel'), exact: true })
        .fill(windowPreset);
      const dimensions = windowEditor.getByRole('spinbutton');
      await dimensions.nth(0).fill('640');
      await dimensions.nth(1).fill('480');
      await windowEditor.locator('button[type="submit"]').click();
      await expect(windowEditor).toHaveCount(0);
      await expect(settings.getByText(windowPreset, { exact: true })).toBeVisible();
    }
  } finally {
    await settings.close();
  }
}

async function admit(context: BrowserContext, extensionId: string, origin: string) {
  const page = await context.newPage();
  await page.setViewportSize(sizes[0]!);
  await page.goto(origin);
  const popup = await openRealPopup(context, extensionId);
  await popup.evaluate((host) => {
    const grant = document.createElement('button');
    grant.textContent = 'Grant synthetic utility host';
    grant.onclick = async () => {
      grant.dataset['granted'] = String(
        await chrome.permissions.request({ origins: [`${host}/*`] })
      );
    };
    document.body.append(grant);
  }, origin);
  const grant = popup.getByRole('button', { name: 'Grant synthetic utility host', exact: true });
  await grant.click();
  await expect(grant).toHaveAttribute('data-granted', 'true');
  const tabId = await popup.evaluate(
    async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id,
    page.url()
  );
  if (tabId === undefined) throw new Error('Synthetic host tab unavailable');
  await page.reload();
  expect(
    await sendRuntimeMessage(popup, {
      type: 'PAGE_ACCESS',
      operation: 'register-granted-site',
      tabId,
    })
  ).toMatchObject({ success: true, result: 'registered' });
  expect(
    await popup.evaluate(
      (id) =>
        chrome.tabs.sendMessage(id, { type: 'ENABLE_SCREENSHOT_MODE', workingMode: 'highlighter' }),
      tabId
    )
  ).toMatchObject({ success: true });
  const browser = context.browser();
  if (!browser) throw new Error('Native browser unavailable');
  const session = await browser.newBrowserCDPSession();
  try {
    const targets = await session.send('Target.getTargets', {
      filter: [{ type: 'tab', exclude: false }, { exclude: true }],
    });
    const target = targets.targetInfos.find((candidate) => candidate.url === page.url());
    if (!target) throw new Error('Native action host unavailable');
    await session.send('Extensions.triggerAction', { id: extensionId, targetId: target.targetId });
  } finally {
    await session.detach();
  }
  await page.bringToFront();
  return { page, popup, tabId };
}

async function viewportMenu(page: Page, c: Composition, info: TestInfo, suffix: string) {
  const trigger = ui(page, 'content.toolbar.viewport-button');
  await trigger.click();
  const menu = page.locator('.sniptale-toolbar-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveClass(/sniptale-content-menu-adopted/u);
  await expect(menu.locator('.sniptale-toolbar-menu-title')).toHaveCSS('font-size', '12px');
  await inViewport(page, menu);
  const native = button(menu, c, 'content.toolbar.viewportNativeLabel');
  await expect(native).toBeVisible();
  await expect.soft(native).toHaveCSS('font-weight', '400', { timeout: 500 });
  const last = button(menu, c, 'content.toolbar.viewportContinuously');
  await last.scrollIntoViewIfNeeded();
  await inViewport(page, last);
  await capture(page, info, `viewport-menu-${suffix}`);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

async function saveComposition(page: Page, c: Composition, info: TestInfo) {
  await ui(page, 'content.toolbar.capture-action-button').click();
  await ui(page, 'content.toolbar.capture-action-option.ask_preset').click();
  await ui(page, 'content.toolbar.capture-visible-button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(
    dialog.getByRole('heading', { name: tr(c, 'content.saveDialog.title'), exact: true })
  ).toBeVisible();
  const filename = dialog.locator('#save-dialog-filename');
  await expect(dialog.getByRole('heading')).toHaveCSS('font-size', '14px');
  await expect.soft(dialog.getByRole('heading')).toHaveCSS('font-weight', '500', { timeout: 500 });
  await expect(filename).toHaveAccessibleName(tr(c, 'content.saveDialog.filenameLabel'));
  await expect(filename).toHaveCSS('border-radius', '4px');
  await expect(dialog.locator('label[for="save-dialog-filename"]')).toHaveCSS(
    'letter-spacing',
    'normal'
  );
  await expect
    .soft(dialog.locator('label[for="save-dialog-filename"]'))
    .toHaveCSS('font-weight', '400', { timeout: 500 });
  await filename.fill(filenameDraft);
  const clearLabel = tr(c, 'shared.ui.clearField').replace(
    '{field}',
    tr(c, 'content.saveDialog.filenameLabel')
  );
  const clear = dialog.getByRole('button', { name: clearLabel, exact: true });
  await clear.click();
  await expect(filename).toHaveValue('');
  await expect(filename).toBeFocused();
  await expect(clear).toHaveCount(0);
  await filename.fill(filenameDraft);
  await dialog.getByRole('heading').click();
  await page.mouse.move(0, 0);
  await expect(clear).toHaveCSS('opacity', '0');
  await dialog.locator('label[for="save-dialog-filename"]').hover();
  await expect(clear).toHaveCSS('opacity', '0');
  await filename.hover();
  await expect(clear).toHaveCSS('opacity', '1');
  await filename.focus();
  await page.keyboard.press('Tab');
  await expect(clear).toBeFocused();
  await page.mouse.move(0, 0);
  await expect(clear).toHaveCSS('opacity', '1');
  const clearBounds = await clear.boundingBox();
  expect(clearBounds?.width).toBe(24);
  expect(clearBounds?.height).toBe(24);
  await expect(dialog).toHaveCSS('border-radius', '8px');
  const preset = dialog.locator('.sniptale-save-dialog-item').filter({ hasText: presetName });
  await preset.scrollIntoViewIfNeeded();
  await expect(preset).toContainText(presetPath);
  await expect(preset.locator('.sniptale-save-dialog-item-title')).toHaveCSS('font-size', '13px');
  const remember = dialog.getByRole('checkbox', {
    name: tr(c, 'content.saveDialog.rememberPreset'),
    exact: true,
  });
  await expect.soft(remember).toHaveCSS('appearance', 'none', { timeout: 500 });
  await expect.soft(remember).toHaveClass(/sniptale-checkbox/u);
  await remember.check();
  await expect(remember).toBeChecked();
  const rememberLabel = remember.locator('..');
  await expect.soft(rememberLabel).toHaveCSS('font-weight', '400', { timeout: 500 });
  const rememberGeometry = await rememberLabel.evaluate((node) => {
    const input = node.querySelector('input')!.getBoundingClientRect();
    const text = node.querySelector('span')!.getBoundingClientRect();
    return { gap: input.left - text.right, height: node.getBoundingClientRect().height };
  });
  expect.soft(rememberGeometry.gap).toBeGreaterThanOrEqual(7);
  expect.soft(rememberGeometry.height).toBeGreaterThanOrEqual(32);
  for (const size of [...sizes, { width: 960, height: 560 }]) {
    await page.setViewportSize(size);
    await inViewport(page, dialog);
    await preset.scrollIntoViewIfNeeded();
    await inViewport(page, preset);
    const system = dialog.locator('.sniptale-save-dialog-system');
    await system.scrollIntoViewIfNeeded();
    await inViewport(page, system);
    await remember.scrollIntoViewIfNeeded();
    await inViewport(page, remember);
    await expect(filename).toHaveValue(filenameDraft);
    await capture(page, info, `save-dialog-${size.width}x${size.height}`);
  }
  // No destination is selected: this composition proof must not masquerade as native save success.
  await button(dialog, c, 'common.actions.close').click();
  await expect(dialog).toHaveCount(0);
}

async function actualResize(
  page: Page,
  popup: Page,
  tabId: number,
  c: Composition,
  info: TestInfo
) {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.clearDeviceMetricsOverride');
  const readBounds = () =>
    popup.evaluate(async (id) => {
      const tab = await chrome.tabs.get(id);
      const window = await chrome.windows.get(tab.windowId);
      return {
        left: window.left,
        top: window.top,
        width: window.width,
        height: window.height,
        state: window.state,
      };
    }, tabId);
  const before = await readBounds();
  try {
    const trigger = ui(page, 'content.toolbar.viewport-button');
    await trigger.click();
    let menu = page.locator('.sniptale-toolbar-menu');
    const continuous = button(menu, c, 'content.toolbar.viewportContinuously');
    await continuous.scrollIntoViewIfNeeded();
    await continuous.click();
    if (!(await menu.isVisible())) await trigger.click();
    menu = page.locator('.sniptale-toolbar-menu');
    const preset = menu.getByRole('button', { name: new RegExp(windowPreset) });
    await preset.scrollIntoViewIfNeeded();
    await expect(preset).not.toHaveAttribute('aria-disabled', 'true');
    await preset.click();
    await expect.poll(readBounds).toMatchObject({ width: 640, height: 480, state: 'normal' });
    await expect(trigger).toContainText('640');
    await expect(trigger).toContainText('480');
    await capture(page, info, 'actual-window-640x480');
    await trigger.click();
    await button(
      page.locator('.sniptale-toolbar-menu'),
      c,
      'content.toolbar.viewportNativeLabel'
    ).click();
    await expect.poll(readBounds).toEqual(before);
    await writeFile(
      info.outputPath('native-window-restoration.json'),
      JSON.stringify({ before, after: await readBounds() }, null, 2)
    );
  } finally {
    await session.detach();
    // Presentation viewport is explicit again only after the real native restoration assertion.
    await page.setViewportSize(sizes[0]!);
  }
}

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    const c: Composition = { locale, theme };
    test(`content utility ${locale} ${theme} native composition`, async ({}, info) => {
      const host = await startHostServer();
      let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | undefined;
      let page: Page | undefined;
      try {
        launched = await launchExtensionBrowser({ viewport: sizes[0]! });
        await configure(launched.context, launched.extensionId, c);
        const opened = await admit(launched.context, launched.extensionId, host.origin);
        page = opened.page;
        for (const size of sizes) {
          await page.setViewportSize(size);
          await viewportMenu(page, c, info, `${size.width}x${size.height}`);
        }
        await page.setViewportSize(sizes[0]!);
        await saveComposition(page, c, info);
        if (locale === 'en' && theme === 'light') {
          await actualResize(page, opened.popup, opened.tabId, c, info);
        }
      } catch (error) {
        if (page && !page.isClosed())
          await page.screenshot({
            path: info.outputPath('failure-ui.png'),
            fullPage: false,
            animations: 'disabled',
          });
        throw error;
      } finally {
        if (launched) await closeExtensionBrowser(launched, { removeUserDataDir: true });
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}
