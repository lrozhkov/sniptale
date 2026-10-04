import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { translate, type AppLocale } from '../../../../apps/extension/src/platform/i18n';
import type { ContextMenuTree } from '../../../../apps/extension/src/contracts/settings/context-menu-layout';
import { POPUP_STARTUP_TARGETS } from '../../../../apps/extension/src/composition/persistence/capture-settings/popup-startup-contracts';

const pages: Page[] = [];
test.afterEach(async () => {
  await Promise.all(pages.splice(0).map((page) => page.close()));
});
const fixture: ContextMenuTree = {
  version: 2,
  nodes: [
    { type: 'command', command: 'sniptale.settings', enabled: true },
    {
      type: 'section',
      id: 'a',
      title: 'A',
      enabled: true,
      children: [{ type: 'command', command: 'sniptale.gallery', enabled: true }],
    },
    { type: 'section', id: 'b', title: 'B', enabled: true, children: [] },
    { type: 'command', command: 'sniptale.screenshots.quick-action.removedfixture', enabled: true },
    ...Array.from({ length: 24 }, (_, index) => ({
      type: 'section' as const,
      id: `long-${index}`,
      enabled: true,
      children: [],
      title: `Длинное название раздела меню ${index + 1}`,
    })),
  ],
};
async function openSettings(
  context: BrowserContext,
  extensionId: string,
  view: string,
  locale: AppLocale
) {
  const page = await context.newPage();
  pages.push(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(
    `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=interface-browser&view=interface`
  );
  await expect(page.locator('#settings-interface-language')).toBeVisible();
  await page.locator('#settings-interface-language').click();
  await page
    .getByRole('option', { name: locale === 'en' ? 'English' : /^(Russian|Русский)$/ })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ]
      )
    )
    .toBe(locale);
  await page.evaluate(
    async ({ tree, language }) => {
      localStorage.setItem('sniptale-locale-preference', language);
      localStorage.setItem('sniptale-theme-preference', 'light');
      await chrome.storage.local.set({
        'sniptale-locale-preference': language,
        'sniptale-theme-preference': 'light',
        sniptale_popup_startup: {
          selection: 'menu',
          lastPage: 'menu',
          lastExportDestination: 'export',
        },
      });
      await chrome.storage.sync.set({
        sniptale_settings: {
          contextMenu: {
            enabled: true,
            showScreenshots: true,
            showVideo: true,
            showExport: true,
            showImageEditor: true,
            showVideoEditor: true,
            showGallery: true,
            showPageLinkCopy: true,
            showWindowResize: true,
            showSettings: true,
            layout: tree,
          },
        },
      });
    },
    { tree: fixture, language: locale }
  );
  await page.goto(
    `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=interface-browser&view=${view}`
  );
  return page;
}
for (const locale of ['en', 'ru'] as const) {
  test(`settings structure aligns and persists native insertion at HD in ${locale}`, async ({
    context,
    extensionId,
  }, info) => {
    const page = await openSettings(context, extensionId, 'context-menu', locale);
    const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const tree = page.getByRole('tree', {
      name: t('settings.appearance.contextMenuTree'),
      exact: true,
    });
    const catalog = page.getByRole('region', {
      name: t('settings.appearance.contextMenuCatalog'),
      exact: true,
    });
    await expect(tree).toBeVisible();
    await expect(catalog).toBeVisible();
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined))
      );
    });
    const firstRow = tree.getByRole('treeitem').first();
    const firstAvailable = catalog.getByRole('button').first();
    const rowBox = await firstRow.boundingBox();
    const itemBox = await firstAvailable.boundingBox();
    if (!rowBox || !itemBox) throw new Error('Structure rows are not visible');
    expect(Math.abs(rowBox.height - itemBox.height)).toBeLessThan(1);
    expect(Math.abs(rowBox.y - itemBox.y)).toBeLessThan(1);
    const unavailable = tree.locator(
      '[data-tree-key="command:sniptale.screenshots.quick-action.removedfixture"]'
    );
    await expect(unavailable).toContainText(t('settings.appearance.contextMenuUnavailable'));
    expect((await unavailable.boundingBox())?.height).toBe(40);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(async (value) => {
        localStorage.setItem('sniptale-theme-preference', value);
        await chrome.storage.local.set({ 'sniptale-theme-preference': value });
      }, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const restore = page.getByRole('button', {
        name: t('settings.appearance.contextMenuRestore'),
        exact: true,
      });
      await restore.focus();
      await page.keyboard.press('Shift+Tab');
      const restingBackground = await restore.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      );
      await page.keyboard.press('Tab');
      await expect(restore).toBeFocused();
      expect(
        await restore.evaluate((element) => getComputedStyle(element).backgroundColor)
      ).not.toBe(restingBackground);
      expect(await restore.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
        'none'
      );
      await firstRow.click();
      await expect(firstRow).toHaveAttribute('aria-selected', 'true');
      const selection = await firstRow.evaluate((element) => {
        const style = getComputedStyle(element);
        const probe = document.createElement('span');
        probe.style.color = 'var(--sniptale-color-accent)';
        element.append(probe);
        const accent = getComputedStyle(probe).color;
        probe.remove();
        return { border: style.borderColor, accent };
      });
      expect(selection.border).not.toBe(selection.accent);
      await page.screenshot({ path: info.outputPath(`structure-${locale}-${theme}.png`) });
    }
    const a = tree.locator('[data-tree-key="section:a"]');
    const addExport = catalog.getByRole('button', {
      name: `${t('settings.appearance.contextMenuAddCommand')}: ${t('popup.export.exportButton')}`,
      exact: true,
    });
    await addExport.dragTo(a, { targetPosition: { x: 100, y: 2 } });
    const exportRow = tree.locator('[data-tree-key="command:sniptale.export.start"]');
    await expect(exportRow).toBeVisible();
    await expect
      .poll(async () => {
        const keys = await tree
          .locator('[data-tree-key]')
          .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute('data-tree-key'))
          );
        return keys.indexOf('command:sniptale.export.start') === keys.indexOf('section:a') - 1;
      })
      .toBe(true);
    await expect(page.locator('.context-menu-editor')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.reload();
    await expect(tree.locator('[data-tree-key="command:sniptale.export.start"]')).toBeVisible();
    await expect
      .poll(async () => {
        const keys = await tree
          .locator('[data-tree-key]')
          .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute('data-tree-key'))
          );
        return keys.indexOf('command:sniptale.export.start') === keys.indexOf('section:a') - 1;
      })
      .toBe(true);
    const bounds = await tree.boundingBox();
    if (!bounds) throw new Error('Tree bounds missing');
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, 700);
    await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const outerScroll = await page.evaluate(() => document.documentElement.scrollTop);
    await page.mouse.wheel(0, -100);
    expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(outerScroll);
    const moving = tree.locator('[data-tree-key="section:long-20"]');
    const target = tree.locator('[data-tree-key="section:long-18"]');
    await moving.scrollIntoViewIfNeeded();
    await moving.locator('[draggable]').dragTo(target, { targetPosition: { x: 100, y: 2 } });
    await expect
      .poll(async () => {
        const keys = await tree
          .locator('[data-tree-key]')
          .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute('data-tree-key'))
          );
        return keys.indexOf('section:long-20') === keys.indexOf('section:long-18') - 1;
      })
      .toBe(true);
    await expect(page.locator('.context-menu-editor')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.reload();
    await expect
      .poll(async () => {
        const keys = await tree
          .locator('[data-tree-key]')
          .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute('data-tree-key'))
          );
        return keys.indexOf('section:long-20') === keys.indexOf('section:long-18') - 1;
      })
      .toBe(true);
    await page.evaluate(async () => {
      const stored = await chrome.storage.sync.get('sniptale_settings');
      const settings = stored['sniptale_settings'];
      await chrome.storage.sync.set({
        sniptale_settings: {
          ...settings,
          contextMenu: { ...settings.contextMenu, layout: { version: 2, nodes: [] } },
        },
      });
    });
    await page.reload();
    await expect(tree.getByRole('treeitem')).toHaveCount(0);
    await expect(tree).toContainText(t('settings.appearance.contextMenuEmptyTree'));
    await addExport.dragTo(tree, { targetPosition: { x: 100, y: 80 } });
    await expect(tree.getByRole('treeitem')).toHaveCount(1);
    await firstAvailable.click();
    await expect(tree.getByRole('treeitem')).toHaveCount(2);
    await expect(tree.locator('[data-tree-key="command:sniptale.export.start"]')).toBeVisible();
    await expect(page.locator('.context-menu-editor')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
test('Start Screen offers every supported target and restores HTML on the next popup launch', async ({
  context,
  extensionId,
}) => {
  const page = await openSettings(context, extensionId, 'interface', 'en');
  const startup = page.getByRole('button', {
    name: translate('settings.appearance.popupStartupAriaLabel', 'en'),
    exact: true,
  });
  await startup.click();
  const options = page.getByRole('option');
  await expect(options).toHaveCount(POPUP_STARTUP_TARGETS.length + 1);
  for (const target of ['remember-last', ...POPUP_STARTUP_TARGETS] as const) {
    await expect(
      page.getByRole('option', {
        name: translate(`settings.appearance.popupStartupOptions.${target}` as const, 'en'),
        exact: true,
      })
    ).toHaveCount(1);
  }
  await page.getByRole('option', { name: 'Export to HTML', exact: true }).click();
  await expect(startup).toContainText('Export to HTML');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const result = await chrome.storage.local.get('sniptale_popup_startup');
        const value: unknown = result['sniptale_popup_startup'];
        return value && typeof value === 'object' && 'selection' in value ? value.selection : null;
      })
    )
    .toBe('export:html');
  await page.reload();
  await expect(startup).toContainText('Export to HTML');
  const popup = await context.newPage();
  pages.push(popup);
  await popup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
  await expect(popup.getByRole('button', { name: 'Download HTML', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});
