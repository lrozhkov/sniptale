import type { Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { test, expect } from '../support/extension-fixture';

const text = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
const ui = (page: Page, name: string) => page.locator(`[data-ui="${name}"]`);

async function configure(page: Page, extensionId: string, theme: 'light' | 'dark') {
  const base = `chrome-extension://${extensionId}/apps/extension/src/settings/index.html`;
  await page.goto(`${base}?section=interface-browser&view=interface`);
  await expect(page.locator('#settings-interface-language')).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ]
      )
    )
    .toMatch(/^(ru|en)$/);
  await page.evaluate(async (theme) => {
    localStorage.setItem('sniptale-locale-preference', 'ru');
    await chrome.storage.local.set({
      'sniptale-locale-preference': 'ru',
      'sniptale-theme-preference': theme,
    });
  }, theme);
  return base;
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`settings dependency tree composition ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      const base = await configure(page, extensionId, theme);
      await page.goto(`${base}?section=settings-transfer`);
      await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
      await page
        .getByRole('group', {
          name: text('settings.settingsTransfer.exportKindLabel'),
          exact: true,
        })
        .getByRole('button', {
          name: text('settings.settingsTransfer.selectivePackage'),
          exact: true,
        })
        .click();
      const tree = page.getByRole('tree', {
        name: text('settings.settingsTransfer.treeLabel'),
        exact: true,
      });
      await expect(tree).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const required = tree.locator('input:disabled').first();
      await expect(required).toBeChecked();
      await required.scrollIntoViewIfNeeded();
      await expect(required.locator('..')).toHaveCSS('opacity', '0.5');
      await expect(required).toHaveCSS('opacity', '1');
      expect(await required.boundingBox()).toMatchObject({ width: 18, height: 18 });
      const candidate = tree.locator('li:not([aria-expanded]) > div input:enabled').first();
      const name = await candidate.locator('..').locator('span[title]').getAttribute('title');
      const optional = tree.getByTitle(name!, { exact: true }).locator('..').getByRole('checkbox');
      await expect(optional).toBeChecked();
      await optional.locator('..').click();
      await expect(optional).not.toBeChecked();
      await optional.locator('..').click();
      await expect(optional).toBeChecked();
      const item = optional.locator('xpath=ancestor::li[1]');
      await item.focus();
      await item.press('Space');
      await expect(optional).not.toBeChecked();
      await item.press('Space');
      await expect(optional).toBeChecked();
      const row = required.locator('..').locator('..');
      await row.scrollIntoViewIfNeeded();
      expect((await row.boundingBox())!.height).toBeLessThanOrEqual(33);
      await page.screenshot({
        path: info.outputPath('transfer-tree-required.png'),
        fullPage: false,
      });
      const search = page.getByRole('textbox', {
        name: text('settings.settingsTransfer.searchLabel'),
        exact: true,
      });
      await search.fill('interface');
      await expect(tree.getByRole('treeitem').first()).toBeVisible();
      await search.fill('');
      await page
        .getByRole('button', { name: text('settings.settingsTransfer.collapseAll'), exact: true })
        .click();
      await expect(tree.locator('[aria-expanded="true"]')).toHaveCount(0);
      await page
        .getByRole('button', { name: text('settings.settingsTransfer.expandAll'), exact: true })
        .click();
      await expect(tree.locator('[aria-expanded="true"]').first()).toBeVisible();
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`settings journal browser text selection ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      const base = await configure(page, extensionId, theme);
      await page.evaluate(async () => {
        const time = new Date().toISOString();
        await chrome.storage.local.set({
          sniptale_runtime_diagnostic_log: {
            version: 1,
            entries: [
              {
                schemaVersion: 1,
                time,
                lastTime: time,
                level: 'info',
                source: 'media-preview',
                context: 'extension-page',
                message: 'Journal copy proof',
                repeats: 1,
                dropped: 0,
              },
            ],
          },
        });
      });
      await page.goto(`${base}?section=events-logs`);
      const table = ui(page, 'settings.events-log.table');
      const message = table.getByText('Journal copy proof', { exact: true });
      await expect(message).toBeVisible();
      await expect(message).toHaveCSS('user-select', 'text');
      await message.scrollIntoViewIfNeeded();
      const box = (await message.boundingBox())!;
      await page.mouse.move(box.x + 1, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 12 });
      await page.mouse.up();
      await expect
        .poll(() => page.evaluate(() => window.getSelection()?.toString()))
        .toContain('Journal copy proof');
      await page.screenshot({
        path: info.outputPath('journal-selected-text.png'),
        fullPage: false,
      });
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`settings permission content density ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      const base = await configure(page, extensionId, theme);
      await page.goto(`${base}?section=access-data&view=permissions`);
      const tabs = page.getByRole('navigation', {
        name: text('settings.permissions.permissionKindTabsLabel'),
        exact: true,
      });
      await expect(tabs).toBeVisible();
      const root = tabs.locator('..');
      const widths: number[] = [];
      for (const [name, view] of [
        ['settings.permissions.statusChecksTitle', 'optional'],
        ['settings.permissions.requiredGrantsTitle', 'required'],
      ] as const) {
        await tabs.getByRole('button', { name: text(name), exact: true }).click();
        await page.evaluate(() => document.fonts.ready);
        widths.push((await root.boundingBox())!.width);
        await page.screenshot({
          path: info.outputPath(`permissions-${view}.png`),
          fullPage: false,
        });
      }
      expect(Math.max(...widths)).toBeLessThanOrEqual(897);
      await expect(root.getByRole('heading').first()).toHaveCSS('text-transform', 'none');
      await expect(root.getByRole('heading', { level: 3 }).first()).toHaveCSS('font-size', '13px');
      await tabs
        .getByRole('button', { name: text('settings.permissions.statusChecksTitle'), exact: true })
        .click();
      const refresh = root.getByRole('button', {
        name: text('settings.permissions.refreshButton'),
        exact: true,
      });
      await refresh.click();
      await expect(refresh).toHaveCSS('height', '32px');
      await refresh.scrollIntoViewIfNeeded();
      await expect(refresh).toBeInViewport({ ratio: 1 });
    });
  }
}

test('settings permission grid breakpoint and horizontal scroll owners', async ({
  page,
  extensionId,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  const base = await configure(page, extensionId, 'light');
  await page.goto(`${base}?section=access-data&view=permissions`);
  const tabs = page.getByRole('navigation', {
    name: text('settings.permissions.permissionKindTabsLabel'),
    exact: true,
  });
  await tabs
    .getByRole('button', { name: text('settings.permissions.requiredGrantsTitle'), exact: true })
    .click();
  const root = tabs.locator('..');
  const grid = root
    .getByRole('heading', { level: 2 })
    .first()
    .locator('..')
    .locator(':scope > div');
  for (const width of [767, 768, 769, 1279, 1280, 1281, 1100]) {
    await page.setViewportSize({ width, height: 560 });
    const columns = await grid.evaluate(
      (node) => getComputedStyle(node).gridTemplateColumns.split(' ').length
    );
    expect(columns).toBe(width < 768 ? 1 : 2);
    const scrolling = await page.locator('.sniptale-settings-viewport').evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
      return { left: node.scrollLeft, width: node.scrollWidth };
    });
    if (width < 1280) expect(scrolling.left).toBeGreaterThan(0);
    await page.screenshot({
      path: info.outputPath(`permissions-width-${width}.png`),
      fullPage: false,
    });
  }
  await tabs
    .getByRole('button', { name: text('settings.permissions.statusChecksTitle'), exact: true })
    .click();
  const refresh = root.getByRole('button', {
    name: text('settings.permissions.refreshButton'),
    exact: true,
  });
  await refresh.click();
  await expect(refresh).toBeInViewport({ ratio: 1 });
});
