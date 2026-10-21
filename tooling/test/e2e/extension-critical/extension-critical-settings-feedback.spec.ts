import type { Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { test, expect } from '../support/extension-fixture';
import { createSystemViewportPresetCatalog } from '../../../../apps/extension/src/features/viewport-presets/catalog';

const text = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
const ui = (page: Page, name: string) => page.locator(`[data-ui="${name}"]`);

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`settings eight follow-ups ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport.size);
      const base = await configure(page, extensionId, theme);
      await page.evaluate(async (presets) => {
        await chrome.storage.sync.set({
          sniptale_settings: {
            viewportPresets: presets,
            contextMenu: {
              enabled: true,
              layout: {
                version: 2,
                nodes: [
                  {
                    type: 'section',
                    id: 'recommended-window',
                    title: 'Window size',
                    enabled: false,
                    children: [],
                  },
                  {
                    type: 'command',
                    command: 'sniptale.gallery',
                    title: 'My library',
                    enabled: true,
                  },
                ],
              },
            },
          },
        });
      }, createSystemViewportPresetCatalog());
      const open = async (section: string, view?: string) => {
        await page.goto(`${base}?section=${section}${view ? `&view=${view}` : ''}`);
        await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
              .map((animation) => animation.finished.catch(() => undefined))
          );
        });
      };
      await open('interface-browser', 'context-menu');
      const windowSwitch = page.getByRole('switch', {
        name: text('settings.appearance.contextMenuGroupWindow'),
        exact: true,
      });
      await expect(windowSwitch).toHaveAttribute('aria-checked', 'false');
      await page.locator('[data-tree-key="section:recommended-window"]').click();
      await page
        .getByRole('button', {
          name: text('settings.appearance.contextMenuCreateSection'),
          exact: true,
        })
        .click();
      const sectionName = page.getByRole('textbox', {
        name: text('settings.appearance.contextMenuSectionName'),
        exact: true,
      });
      await expect(sectionName).toBeVisible();
      await expect(sectionName).toBeFocused();
      await expect(sectionName.locator('xpath=ancestor::*[@role="treeitem"]')).toHaveAttribute(
        'aria-level',
        '1'
      );
      await sectionName.press('Escape');
      await expect(windowSwitch).toHaveAttribute('aria-checked', 'false');
      await windowSwitch.click();
      await page
        .getByRole('button', {
          name: text('settings.appearance.contextMenuAddWindowSizes'),
          exact: true,
        })
        .click();
      await expect(
        page.locator('[data-tree-key^="command:sniptale.window-resize.preset."]')
      ).toHaveCount(4);
      await expect(page.locator('[data-tree-key="command:sniptale.gallery"]')).toContainText(
        'My library'
      );
      await page.screenshot({
        path: info.outputPath('window-sizes-restored.png'),
        fullPage: false,
      });
      await page.waitForFunction(
        () => document.querySelector('.context-menu-editor')?.getAttribute('aria-busy') === 'false'
      );
      await page.reload();
      await expect(windowSwitch).toHaveAttribute('aria-checked', 'true');
      await page
        .getByRole('button', {
          name: `${text('settings.appearance.contextMenuExpand')}: ${text('settings.appearance.contextMenuGroupWindow')}`,
          exact: true,
        })
        .click();
      await expect(
        page.locator('[data-tree-key^="command:sniptale.window-resize.preset."]')
      ).toHaveCount(4);

      await open('media-quality', 'video');
      await page
        .getByRole('button', { name: text('settings.videoQuality.addProfile'), exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      const codec = dialog.getByRole('button', {
        name: text('settings.videoQuality.codecLabel'),
        exact: true,
      });
      await codec.scrollIntoViewIfNeeded();
      await expect(codec).toBeVisible();
      await codec.click();
      await expect(page.getByRole('option').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await page.screenshot({
        path: info.outputPath('profile-codec-visible.png'),
        fullPage: false,
      });
      await dialog
        .getByRole('button', { name: text('settings.videoQuality.cancel'), exact: true })
        .click();

      await open('storage-drafts', 'drafts');
      await expect(
        page.getByRole('button', {
          name: text('settings.storageDrafts.destinationLabel'),
          exact: true,
        })
      ).toBeVisible();
      for (const key of [
        'destinationDescription',
        'cleanupEnabledDescription',
        'trashCleanupDescription',
      ] as const)
        await expect(
          page.getByText(text(`settings.storageDrafts.${key}`), { exact: true })
        ).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('drafts-compact.png'), fullPage: false });

      for (const view of ['borders', 'numbering']) {
        await open('annotations', view);
        const list = page.locator('[data-settings-collection-root]');
        await expect(list).toBeVisible();
        await expect(list).toHaveCSS('overflow-y', 'visible');
        await list.locator('[data-settings-collection-item]').last().scrollIntoViewIfNeeded();
        expect(await list.evaluate((element) => element.scrollTop)).toBe(0);
        const filter = page.getByRole('button', {
          name: text('highlighter.templateTags.filterLabel'),
          exact: true,
        });
        await filter.click();
        const options = page.getByRole('menuitemcheckbox');
        await options.nth(0).click();
        await options.nth(1).click();
        const gap = await options.evaluateAll((elements) => {
          const first = elements[0]!.getBoundingClientRect();
          const second = elements[1]!.getBoundingClientRect();
          return second.top - first.bottom;
        });
        expect(gap).toBeGreaterThanOrEqual(2);
        await page.screenshot({ path: info.outputPath(`${view}-filter-gap.png`), fullPage: false });
        await page.keyboard.press('Escape');
      }

      await open('video-effects');
      const categories = page.locator('.effect-catalog-category');
      await categories.nth(1).click();
      await expect(categories.nth(1)).toHaveAttribute('aria-pressed', 'true');
      const selected = categories.nth(1);
      await expect
        .poll(() =>
          selected.evaluate((element) => {
            const probe = document.createElement('span');
            probe.style.color = 'var(--sniptale-color-text-primary)';
            element.append(probe);
            const same = getComputedStyle(element).color === getComputedStyle(probe).color;
            probe.remove();
            return same;
          })
        )
        .toBe(true);
      await page.screenshot({ path: info.outputPath('effects-neutral.png'), fullPage: false });

      await open('voice-input');
      const start = page.getByRole('button', {
        name: text('settings.voiceInput.start'),
        exact: true,
      });
      await expect(start).toBeVisible();
      await expect(start).toHaveAttribute('data-command-tone', 'primary');
      await expect(start).toHaveCSS('height', '32px');
      await expect(start.locator('.sniptale-command-content')).toHaveCSS('align-items', 'center');
      await page.screenshot({ path: info.outputPath('voice-start-command.png'), fullPage: false });
      if (viewport.size.width === 1280) {
        await page.setViewportSize({ width: 960, height: 560 });
        expect(
          await page.evaluate(
            () => document.querySelector('.sniptale-settings-viewport')!.scrollWidth
          )
        ).toBeGreaterThanOrEqual(1280);
      }
    });
  }
}

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
