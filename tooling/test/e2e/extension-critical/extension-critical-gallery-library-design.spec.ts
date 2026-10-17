import type { Page, TestInfo } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { test, expect } from '../support/extension-fixture';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { createVideoProjectEntry } from '../../../../apps/extension/src/composition/persistence/projects/index.test-support';
import { withVideoProjectUsage } from '../../../../apps/extension/src/composition/persistence/media-library/usage-index-keys';

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

async function inspectTagSuggestions(
  page: Page,
  info: TestInfo,
  locale: Locale,
  openSecond: () => Promise<void>
) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const inspector = page.locator('[data-ui="gallery.preview.inspector"]');
  const tags = [
    'probe-alpha',
    'probe-bravo',
    'probe-charlie — Long multilingual project category / Длинная категория проекта для проверки полного названия',
    'probe-delta',
    'probe-echo',
    'probe-foxtrot',
    'probe-golf',
    'probe-hotel',
  ];
  for (const tag of tags) {
    if (!(await inspector.getByRole('combobox').count())) {
      await inspector
        .getByRole('button', { name: label('gallery.app.addTags'), exact: true })
        .click();
    }
    const input = inspector.getByRole('combobox');
    await input.fill(tag);
    await input.press('Enter');
    await expect(input).toHaveCount(0);
  }
  await page.getByRole('button', { name: label('common.actions.close'), exact: true }).click();
  await openSecond();
  await inspector.getByRole('button', { name: label('gallery.app.addTags'), exact: true }).click();
  const input = inspector.getByRole('combobox');
  await input.fill('probe');
  await input.press('ArrowDown');
  const list = page.getByRole('listbox', {
    name: label('gallery.app.tagOptionsLabel'),
    exact: true,
  });
  const options = list.getByRole('option');
  await expect(options).toHaveCount(9);
  await expect(options.nth(2)).toHaveAttribute('title', tags[2]!);
  await expect(list).toBeInViewport({ ratio: 1 });
  await expect(input).toBeFocused();
  const hitOwned = async () => {
    const active = list.locator('[aria-selected="true"]');
    await expect(active).toBeInViewport({ ratio: 1 });
    expect(
      await active.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return hit !== null && element.contains(hit);
      })
    ).toBe(true);
  };
  await hitOwned();
  await options.nth(1).hover();
  const gap = await options.evaluateAll(
    (items) => items[1]!.getBoundingClientRect().top - items[0]!.getBoundingClientRect().bottom
  );
  expect(gap).toBeGreaterThanOrEqual(2);
  await screenshot(page, info, 'tag-suggestions-neighbor');
  await input.press('Escape');
  await expect(list).toBeHidden();
  await expect(inspector).toBeVisible();
  await expect(input).toHaveValue('probe');
  await input.press('ArrowDown');
  await input.press('ArrowUp');
  await expect(options.last()).toHaveAttribute('aria-selected', 'true');
  await hitOwned();
  await screenshot(page, info, 'tag-suggestions-create');
  await input.press('ArrowUp');
  await expect(options.nth(7)).toHaveAttribute('aria-selected', 'true');
  await hitOwned();
  await options.nth(7).click();
  await expect(input).toHaveCount(0);
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText('probe-hotel', { exact: true })).toBeVisible();
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
          await page.mouse.move(0, 0);
          const modeGroup = page.getByRole('group', {
            name: label('gallery.app.viewModeLabel'),
            exact: true,
          });
          await expect.soft(modeGroup).toHaveCSS('border-top-style', 'solid');
          await expect
            .soft(modeGroup.locator('button[aria-pressed="true"]'))
            .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)', { timeout: 500 });
          const selectedMode = modeGroup.locator('button[aria-pressed="true"]');
          const selectedColor = await selectedMode.evaluate((node) => {
            const sample = document.createElement('span');
            sample.style.color = 'var(--sniptale-color-accent)';
            node.append(sample);
            const color = getComputedStyle(sample).color;
            sample.remove();
            return color;
          });
          await expect(selectedMode).toHaveCSS('color', selectedColor);
          if (mode !== 'viewModeList') {
            const item = card(names[0]!);
            const previewBounds = (await item
              .locator('[data-ui="gallery.grid.thumbnail-viewport"]')
              .boundingBox())!;
            const kindBounds = (await item.locator('svg.lucide-image').last().boundingBox())!;
            expect
              .soft(kindBounds.y)
              .toBeGreaterThanOrEqual(previewBounds.y + previewBounds.height);
          }

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
          const mark = card(name)
            .getByRole('button', { name: label('gallery.app.selectItem'), exact: true })
            .locator('[data-ui="gallery.selection.mark"]');
          const markBox = (await mark.boundingBox())!;
          expect(markBox.width).toBe(24);
          expect(markBox.height).toBe(24);
          expect(
            await mark.evaluate((node) => parseFloat(getComputedStyle(node).borderRadius))
          ).toBeGreaterThanOrEqual(markBox.width / 2);
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
        await facet.locator('label').first().click();
        const clearFacet = facet.getByRole('button', {
          name: `${label('gallery.app.facetClear')} ${label('gallery.app.facetTitle.format')}`,
          exact: true,
        });
        await clearFacet.hover();
        await expect(clearFacet).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await screenshot(page, info, 'facet-clear-hover');
        await clearFacet.click();

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
          await expect(property).toHaveCSS('font-weight', '400');
          await expect(property).toHaveCSS('line-height', '18px');
        }
        await expect(inspector.locator('.gallery-preview-property').first()).toHaveCSS(
          'min-height',
          '28px'
        );
        await screenshot(page, info, 'preview-metadata');
        const nextItem = page
          .getByRole('button', { name: label('gallery.preview.next'), exact: true })
          .first();
        const previousItem = page
          .getByRole('button', { name: label('gallery.preview.previous'), exact: true })
          .first();
        const forward = await nextItem.isEnabled();
        await (forward ? nextItem : previousItem).click();
        await expect(
          inspector.locator('details').filter({
            has: page.locator('summary').filter({ hasText: label('gallery.preview.properties') }),
          })
        ).toHaveCount(1);
        await expect(
          inspector.locator('[data-ui="gallery.preview.filenameExtension"]')
        ).toHaveCount(1);
        await (forward ? previousItem : nextItem).click();
        await expect(filename).toHaveValue(names[0]!.replace(/\.[^.]+$/u, ''));

        const filenameRow = inspector.locator('.gallery-preview-filename');
        const filenameName = filenameRow.getByText(label('gallery.preview.filename'), {
          exact: true,
        });
        const filenameFace = filenameRow.locator('.gallery-preview-filename-input');
        await filename.blur();
        await filenameName.click();
        await expect(filename).not.toBeFocused();
        await expect(filenameName).toHaveCSS('font-weight', '400');
        await expect(filenameFace).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(filename).toHaveCSS('padding-right', '8px');
        await screenshot(page, info, 'filename-idle');
        await filename.hover();
        await expect(filename).toHaveCSS('padding-right', '32px');
        await expect(filenameFace).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await filename.click();
        await expect(filename).toBeFocused();
        const clearName = label('shared.ui.clearField').replace(
          '{field}',
          label('gallery.preview.filename')
        );
        const clear = inspector.getByRole('button', { name: clearName, exact: true });
        await expect(clear).toHaveAttribute('title', clearName);
        await expect(clear).toHaveCSS('opacity', '1');
        await page.mouse.move(0, 0);
        await filename.blur();
        await expect(clear).toHaveCSS('opacity', '0');
        await filename.hover();
        await expect(clear).toHaveCSS('opacity', '1');
        await clear.click();
        await expect(filename).toHaveValue('');
        await expect(filename).toHaveAttribute('placeholder', label('gallery.preview.filename'));
        await expect(filename).toBeFocused();
        await filename.fill('   ');
        await filename.press('Escape');
        await expect(inspector).toBeHidden();
        await expect(card(names[0]!)).toBeVisible();
        await card(names[0]!).getByRole('button', { name: names[0], exact: true }).first().click();
        await expect(filename).toHaveValue(names[0]!.replace(/\.[^.]+$/u, ''));
        await filename.fill(names[0]!.replace(/\.[^.]+$/u, ''));
        await inspector
          .getByRole('button', { name: label('gallery.app.addTags'), exact: true })
          .click();
        const tagDraft = inspector.getByRole('combobox');
        await tagDraft.fill('draft-tag');
        await inspector.locator('.sniptale-field-clear').last().click();
        await expect(tagDraft).toHaveValue('');
        await expect(tagDraft).toBeFocused();
        await screenshot(page, info, 'preview-tag-clear');
        await inspectTagSuggestions(page, info, locale, async () => {
          await card(names[1]!)
            .getByRole('button', { name: names[1], exact: true })
            .first()
            .click();
        });

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

        for (const name of names) {
          await card(name).hover();
          const mark = card(name)
            .getByRole('button', { name: label('gallery.app.selectItem'), exact: true })
            .locator('[data-ui="gallery.selection.mark"]');
          const markBox = (await mark.boundingBox())!;
          expect(
            await mark.evaluate((node) => parseFloat(getComputedStyle(node).borderRadius))
          ).toBeGreaterThanOrEqual(markBox.width / 2);
          await card(name)
            .getByRole('button', { name: label('gallery.app.selectItem'), exact: true })
            .click();
        }
        const bulk = page.locator('[data-ui="gallery.selection.toolbar"]');
        await bulk.getByRole('button', { name: label('gallery.app.addTags'), exact: true }).click();
        const bulkInput = bulk.getByRole('combobox');
        await bulkInput.fill('probe');
        const queryRoom = await bulkInput.evaluate((input) => {
          const style = getComputedStyle(input);
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          context.font = style.font;
          return {
            available:
              input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
            minimum: context.measureText('0').width * 12,
            font: style.font,
            parentFont: getComputedStyle(input.parentElement!).font,
            parentWidth: input.parentElement!.getBoundingClientRect().width,
          };
        });
        expect(queryRoom.available, JSON.stringify(queryRoom)).toBeGreaterThanOrEqual(
          queryRoom.minimum - 1
        );
        await bulkInput.press('ArrowDown');
        const bulkOptions = page.getByRole('listbox', {
          name: label('gallery.app.tagOptionsLabel'),
          exact: true,
        });
        await expect(bulkOptions).toBeInViewport({ ratio: 1 });
        await screenshot(page, info, 'bulk-tag-suggestions');
        await bulkInput.press('Enter');
        await expect(bulkInput).toHaveValue('probe-alpha');
        await expect(bulkOptions).toBeHidden();
        await expect(summary).toContainText(`${label('gallery.app.selectedPrefix')} 2`);
        await bulk.getByRole('button', { name: label('gallery.app.apply'), exact: true }).click();
        await expect(bulkInput).toHaveCount(0);
        await page
          .getByRole('button', { name: label('gallery.app.clearSelection'), exact: true })
          .click();
        await card(names[1]!).getByRole('button', { name: names[1], exact: true }).first().click();
        await expect(inspector.getByText('probe-alpha', { exact: true })).toBeVisible();
        await page
          .getByRole('button', { name: label('common.actions.close'), exact: true })
          .click();
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

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`recording provenance and related project fit ${locale} ${theme}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(PRIMARY_BROWSER_VIEWPORTS[0]!.size);
      await openLibrary(page, extensionId, locale, theme);
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 1280,
        height: 720,
        duration: 12.01,
      });
      const longName =
        'Related recording project — подробное название связанного проекта с ' +
        'несколькими длинными словами для проверки переноса';
      const sourceTitle =
        'Recording source — длинное название страницы с подробным описанием исходного материала и выбранного окна';
      const sourceUrl =
        'https://example.test/recording/' + 'long-unbroken-source-segment-'.repeat(8);
      const project = withVideoProjectUsage(
        createVideoProjectEntry({
          id: 'preview-long-related',
          name: longName,
          baseRecordingId: 'beta-v1-recording',
        })
      );
      await page.evaluate(
        async ({ databaseName, project, sourceTitle, sourceUrl }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(databaseName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const tx = db.transaction(['media_library', 'video_projects'], 'readwrite');
          const done = new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
          });
          tx.objectStore('video_projects').put(project);
          const media = tx.objectStore('media_library');
          const request = media.get('recording:beta-v1-recording');
          request.onsuccess = () => media.put({ ...request.result, sourceTitle, sourceUrl });
          await done;
          db.close();
        },
        { databaseName: betaV1Fixture.databaseName, project, sourceTitle, sourceUrl }
      );
      const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
      for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
        await page.setViewportSize(viewport.size);
        await page.reload();
        await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
        await searchLibrary(page, 'beta-v1.webm');
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        const inspector = page.locator('[data-ui="gallery.preview.inspector"]');
        const usage = inspector.locator('[data-ui="gallery.preview.projectUsage"]');
        await expect(usage).not.toHaveAttribute('open');
        await usage.locator('summary').click();
        const related = inspector.getByRole('button', { name: longName, exact: true });
        await expect(related).toBeVisible();
        await related.scrollIntoViewIfNeeded();
        await expect(related).toBeInViewport({ ratio: 1 });
        await expect(related).toHaveAttribute('title', longName);
        const contentBounds = await related.evaluate((button) => {
          const bounds = button.getBoundingClientRect();
          const content = button
            .querySelector('.sniptale-command-content')!
            .getBoundingClientRect();
          return {
            top: content.top - bounds.top,
            bottom: bounds.bottom - content.bottom,
            targetHeight: bounds.height,
            contentHeight: content.height,
          };
        });
        expect(contentBounds.top, JSON.stringify(contentBounds)).toBeGreaterThanOrEqual(0);
        expect(contentBounds.bottom, JSON.stringify(contentBounds)).toBeGreaterThanOrEqual(0);
        await expect(related).toHaveCSS('font-weight', '400');
        await expect(related).toHaveCSS('height', '32px');
        const caption = related.locator('.sniptale-command-content > span');
        await expect(caption).toHaveCSS('white-space', 'nowrap');
        await expect(caption).toHaveCSS('text-overflow', 'ellipsis');
        expect(await caption.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        expect(await related.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
          true
        );
        await screenshot(page, info, `related-long-${viewport.name}`);
        const source = inspector.locator('[data-ui="gallery.preview.source"]');
        await expect(source.locator('summary')).toHaveCount(0);
        await expect(source.locator('xpath=ancestor::details')).toHaveCount(1);
        const link = inspector.getByRole('link', { name: sourceUrl, exact: true });
        await link.scrollIntoViewIfNeeded();
        await expect(link).toBeInViewport({ ratio: 1 });
        await expect(inspector.getByText(sourceTitle, { exact: true })).toBeVisible();
        expect(
          await inspector.evaluate((panel) => {
            const bounds = panel.getBoundingClientRect();
            return [...panel.querySelectorAll('dt,dd,a,.gallery-preview-related')].every((node) => {
              const rect = node.getBoundingClientRect();
              return (
                rect.left >= bounds.left - 1 &&
                rect.right <= bounds.right + 1 &&
                node.scrollWidth <= node.clientWidth + 1
              );
            });
          })
        ).toBe(true);
        await screenshot(page, info, `source-long-${viewport.name}`);
        const actions = inspector.getByRole('region', {
          name: label('gallery.preview.actions'),
          exact: true,
        });
        const action = actions.getByRole('button').last();
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport({ ratio: 1 });
        await screenshot(page, info, `preview-actions-${viewport.name}`);
        await page
          .getByRole('button', { name: label('common.actions.close'), exact: true })
          .click();
      }
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`library saved views and trash composition ru ${theme}`, async ({
    page,
    extensionId,
  }, info) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await openLibrary(page, extensionId, 'ru', theme);
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
    await page.evaluate(async () => {
      const emptyFacets = {
        created: [],
        duration: [],
        format: [],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      };
      await chrome.storage.local.set({
        sniptale_gallery_saved_views: {
          version: 1,
          views: [
            {
              id: 'saved-one',
              name: 'Длинное пользовательское имя сохранённого представления',
              folderFilter: 'all',
              createdAt: 1,
              updatedAt: 1,
              filters: { activeTags: [], facetFilters: emptyFacets, scope: 'all' },
            },
            {
              id: 'saved-two',
              name: 'Второй вид',
              folderFilter: 'all',
              createdAt: 2,
              updatedAt: 2,
              filters: { activeTags: [], facetFilters: emptyFacets, scope: 'all' },
            },
          ],
        },
      });
    });
    await page.reload();
    const name = 'Длинное пользовательское имя сохранённого представления';
    const view = page.getByRole('button', { name, exact: true });
    await expect(view).toBeVisible();
    await view.hover();
    const remove = page.getByRole('button', {
      name: `${label('gallery.app.savedViewDelete')} ${name}`,
      exact: true,
    });
    await expect(remove).toBeVisible();
    await expect(remove).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const idle = await remove.evaluate((node) => getComputedStyle(node).color);
    await remove.hover();
    await expect(remove).not.toHaveCSS('color', idle);
    await expect(remove).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await screenshot(page, info, 'saved-view-hover');
    await remove.focus();
    await expect(remove).toBeFocused();
    await page.locator('[data-ui="gallery.sidebar.footer"] button').first().click();
    const summary = page.locator('[data-ui="gallery.trash.summary"]');
    await expect(summary).toContainText(label('gallery.app.trashSummaryCount'));
    await expect(summary.locator('details')).toHaveCount(0);
    await expect(summary.locator('[title]').first()).toHaveAttribute(
      'title',
      label('gallery.app.trashSizeExplanation')
    );
    const retention = page.locator('[data-ui="gallery.trash.retention"]');
    await expect(retention).toBeVisible();
    const toggle = retention.getByRole('switch', {
      name: label('gallery.app.trashRetentionEnabled'),
      exact: true,
    });
    if (!(await toggle.isChecked())) await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(toggle.locator('.sniptale-product-toggle-thumb')).toHaveCSS('width', '16px');
    await retention
      .getByRole('button', { name: label('gallery.app.trashRetentionDays'), exact: true })
      .click();
    const options = page.getByRole('listbox').getByRole('option');
    for (const option of await options.all()) {
      const text = option.locator('.sniptale-select-value-label-menu');
      expect(
        await text.evaluate(
          (node) =>
            node.getBoundingClientRect().height <= parseFloat(getComputedStyle(node).lineHeight) + 1
        )
      ).toBe(true);
    }
    await screenshot(page, info, 'trash-retention-menu');
    await page.keyboard.press('Escape');
    await screenshot(page, info, 'trash-summary');
    await page.getByRole('button', { name: label('gallery.keyboard.title'), exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await screenshot(page, info, 'keyboard-help');
  });
}
