import type { Page, TestInfo } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { test, expect } from '../support/extension-fixture';

type Locale = 'ru' | 'en';
type Theme = 'light' | 'dark';
const galleryPath = '/apps/extension/src/gallery/index.html';

async function openLibrary(page: Page, extensionId: string, locale: Locale, theme: Theme) {
  await page.goto(`chrome-extension://${extensionId}${galleryPath}`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
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
  await page.evaluate(
    async ({ locale, theme }) => {
      localStorage.clear();
      localStorage.setItem('sniptale-locale-preference', locale);
      await chrome.storage.local.set({
        'sniptale-locale-preference': locale,
        'sniptale-theme-preference': theme,
      });
    },
    { locale, theme }
  );
  await page.reload();
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await page.evaluate(() => document.fonts.ready);
}

async function seedImages(page: Page, prefix: string) {
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#336699';
    context.fillRect(0, 0, 640, 360);
    context.fillStyle = '#e5b76b';
    context.fillRect(100, 80, 440, 200);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  const names = [`${prefix}-first.png`, `${prefix}-second.png`] as const;
  await page.locator('input[type="file"][multiple]').setInputFiles(
    names.map((name) => ({
      name,
      mimeType: 'image/png',
      buffer: Buffer.from(bytes, 'base64'),
    }))
  );
  await searchLibrary(page, prefix);
  await expect(page.locator('[data-gallery-keyboard-id]')).toHaveCount(2);
  const progress = page.locator('[data-ui="gallery.import-progress"]');
  if (await progress.count()) {
    await expect(progress.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    await progress.getByRole('button').last().click();
  }
  return names;
}

async function searchLibrary(page: Page, text: string) {
  const input = page.locator('[data-ui="gallery.header.search"] input');
  await input.fill(text);
  await input.press('Enter');
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: false,
    animations: 'disabled',
  });
}

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
      test(`library complete composition ${locale} ${theme} ${viewport.name}`, async ({
        page,
        extensionId,
      }, info) => {
        test.setTimeout(120_000);
        await page.setViewportSize(viewport.size);
        await openLibrary(page, extensionId, locale, theme);
        const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
        const prefix = `library-design-${locale}-${theme}-${viewport.name}`;
        const names = await seedImages(page, prefix);
        const surface = page.locator('[data-ui="gallery.content.surface"]');
        const card = (name: string) =>
          surface.locator('[data-gallery-keyboard-id]').filter({
            has: page.getByRole('button', { name, exact: true }),
          });

        for (const mode of ['viewModeList', 'viewModeCompactGrid', 'viewModeLargeGrid'] as const) {
          await page
            .getByRole('button', { name: label(`gallery.app.${mode}`), exact: true })
            .click();
          await expect(
            page.getByRole('button', {
              name: label(`gallery.app.${mode}`),
              exact: true,
            })
          ).toHaveCSS('box-shadow', 'none');
          await expect(surface.locator('[data-gallery-keyboard-id]')).toHaveCount(2);
          await expect(
            surface.getByRole('button', { name: names[0], exact: true }).first()
          ).toBeInViewport();
          await screenshot(page, info, mode);
        }

        await page
          .getByRole('button', { name: label('gallery.app.viewModeCompactGrid'), exact: true })
          .click();
        for (const name of names) {
          await card(name).hover();
          await card(name)
            .getByRole('button', { name: label('gallery.app.selectItem'), exact: true })
            .click();
        }
        const summary = page.locator('[data-ui="gallery.selection.summary"]');
        await expect(summary).toContainText(`${label('gallery.app.selectedPrefix')} 2`);
        await page
          .getByRole('button', { name: label('gallery.app.viewModeList'), exact: true })
          .click();
        await screenshot(page, info, 'selected-list-rows');
        await page
          .getByRole('button', { name: label('gallery.app.viewModeCompactGrid'), exact: true })
          .click();

        await searchLibrary(page, names[0]!);
        await expect(surface.locator('[data-gallery-keyboard-id]')).toHaveCount(1);
        await expect(summary).toContainText(`${label('gallery.app.selectedPrefix')} 2`);
        await expect(
          card(names[0]!).getByRole('button', {
            name: label('gallery.app.selectItem'),
            exact: true,
          })
        ).toHaveAttribute('aria-pressed', 'true');
        await screenshot(page, info, 'hidden-selection');
        await searchLibrary(page, prefix);
        await expect(
          card(names[1]!).getByRole('button', {
            name: label('gallery.app.selectItem'),
            exact: true,
          })
        ).toHaveAttribute('aria-pressed', 'true');
        await page
          .getByRole('button', { name: label('gallery.app.clearSelection'), exact: true })
          .click();

        const facet = page.locator('[data-ui="gallery.sidebar.scroll"] details').filter({
          has: page.locator('summary').filter({ hasText: label('gallery.app.facetTitle.format') }),
        });
        if ((await facet.getAttribute('open')) === null) await facet.locator('summary').click();
        await expect(facet).toHaveAttribute('open', '');
        await screenshot(page, info, 'expanded-format-facet');

        await card(names[0]!).getByRole('button', { name: names[0], exact: true }).first().click();
        const inspector = page.locator('[data-ui="gallery.preview.inspector"]');
        const filename = inspector.getByRole('textbox', {
          name: label('gallery.preview.filename'),
          exact: true,
        });
        await expect(filename).toBeEnabled();
        await expect(inspector.getByText('image/png', { exact: true })).toBeVisible();
        for (const property of await inspector.locator('dl dt, dl dd').all()) {
          await expect(property).toHaveCSS('font-size', '13px');
          await expect(property).toHaveCSS('font-weight', '500');
          await expect(property).toHaveCSS('line-height', '18px');
        }
        await screenshot(page, info, 'preview-metadata');
        await filename.focus();
        const clearName = label('shared.ui.clearField').replace(
          '{field}',
          label('gallery.preview.filename')
        );
        const clear = inspector.getByRole('button', { name: clearName, exact: true });
        await expect(clear).toHaveAttribute('title', clearName);
        await clear.click();
        await expect(filename).toHaveValue('');
        await expect(filename).toBeFocused();
        await filename.fill(names[0]!);
        await inspector
          .getByRole('button', { name: label('gallery.app.addTags'), exact: true })
          .click();
        const tagDraft = inspector.getByRole('combobox');
        await tagDraft.fill('draft-tag');
        await inspector.locator('.sniptale-field-clear').last().click();
        await expect(tagDraft).toHaveValue('');
        await expect(tagDraft).toBeFocused();
        await screenshot(page, info, 'preview-tag-clear');

        await page
          .getByRole('button', { name: label('common.actions.close'), exact: true })
          .click();
        await expect(inspector).toBeHidden();

        await page.locator('[data-ui="gallery.header.storage"] > button').click();
        const menu = page.locator('[data-ui="gallery.header.storage-menu"]');
        await expect(menu).toBeInViewport();
        await screenshot(page, info, 'storage-menu');
        await menu
          .getByRole('menuitem', { name: label('gallery.app.exportBackup'), exact: true })
          .click();
        const dialog = page.getByRole('dialog');
        await expect(
          dialog.getByText(label('gallery.backupExportModal.title'), { exact: true })
        ).toBeVisible();
        await screenshot(page, info, 'backup-dialog');
        const cancel = dialog.getByRole('button', {
          name: label('common.actions.cancel'),
          exact: true,
        });
        await cancel.scrollIntoViewIfNeeded();
        await expect(cancel).toBeInViewport();
        await expect(
          dialog.getByRole('button', {
            name: label('gallery.backupExportModal.export'),
            exact: true,
          })
        ).toBeInViewport();
        await screenshot(page, info, 'backup-footer');
        await cancel.click();
        await expect(dialog).toBeHidden();
      });
    }
  }
}

for (const width of [1535, 1536, 1537, 1100]) {
  test(`library header and outer scrolling at ${width}`, async ({ page, extensionId }, info) => {
    await page.setViewportSize({ width, height: 700 });
    await openLibrary(page, extensionId, 'ru', 'dark');
    const names = await seedImages(page, `library-width-${width}`);
    const surface = page.locator('[data-ui="gallery.content.surface"]');
    const card = surface.locator('[data-gallery-keyboard-id]').filter({
      has: page.getByRole('button', { name: names[0], exact: true }),
    });
    await card.hover();
    await card
      .getByRole('button', { name: translate('gallery.app.selectItem', 'ru'), exact: true })
      .click();
    const search = page.locator('[data-ui="gallery.header.search"] input');
    await search.focus();
    if (width === 1100) {
      const scroll = await page.locator('[data-ui="gallery.page.root"]').evaluate((root) => {
        let owner: Element | null = root;
        while (owner && owner.scrollWidth <= owner.clientWidth) owner = owner.parentElement;
        if (!owner) return null;
        owner.scrollLeft = owner.scrollWidth;
        return { left: owner.scrollLeft, client: owner.clientWidth, total: owner.scrollWidth };
      });
      expect(
        scroll,
        'below minimum width the desktop workspace has an outer horizontal scroll owner'
      ).not.toBeNull();
      expect(scroll!.total).toBeGreaterThan(scroll!.client);
      expect(scroll!.left).toBeGreaterThan(0);
    }
    await expect(page.locator('[data-ui="gallery.header.storage"] > button')).toBeInViewport();
    await screenshot(page, info, `header-${width}`);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`library palette clear and pressure ${theme}`, async ({ page, extensionId }, info) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await openLibrary(page, extensionId, 'en', theme);
    await page.keyboard.press('Control+k');
    const palette = page.locator('[data-ui="gallery.command-palette"]');
    await expect(palette).toBeVisible();
    const query = palette.locator('input');
    await query.fill('gallery');
    await palette.locator('.sniptale-field-clear').click();
    await expect(query).toHaveValue('');
    await expect(query).toBeFocused();
    await expect(palette).toBeVisible();
    const close = palette.getByRole('button', {
      name: translate('shared.ui.commandPaletteCloseTitle', 'en'),
      exact: true,
    });
    await close.hover();
    await page.mouse.down();
    await expect(close).toHaveAttribute('data-pressing', 'true');
    await expect(close.locator(':scope > .sniptale-command-content')).toHaveCSS('opacity', '0.72');
    await screenshot(page, info, `palette-pressure-${theme}`);
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await expect(close).not.toHaveAttribute('data-pressing', 'true');
    await expect(palette).toBeVisible();
    await close.click();
    await expect(palette).toBeHidden();
  });
}
