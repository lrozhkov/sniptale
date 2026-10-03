import type { Page } from '@playwright/test';
import { test, expect } from '../support/extension-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';

async function countMediaLibraryEntries(page: Page, assetId?: string): Promise<number> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction('media_library').objectStore('media_library').count(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, assetId);
}

async function createDraft(
  page: Page,
  extensionId: string,
  locale: 'ru' | 'en',
  theme: 'light' | 'dark'
) {
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/editor/index.html`);
  await page.evaluate(
    ({ locale, theme }) =>
      chrome.storage.local.set({
        'sniptale-locale-preference': locale,
        'sniptale-theme-preference': theme,
      }),
    { locale, theme }
  );
  await page.reload();
  const start = page.locator('[data-ui="editor.page.start"]');
  await expect(start).toBeVisible();
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#2864c8';
    context.fillRect(0, 0, 160, 90);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await start.locator('input[type="file"]').setInputFiles({
    name: 'deletion-draft.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await expect(start).toBeHidden();
  await expect(page.locator('[data-ui="editor.page.open-loading"]')).toBeHidden();
  await expect(page).toHaveURL(/assetId=/);
  await expect(page.locator('[data-ui="autosave-control"] button')).toHaveAttribute(
    'aria-label',
    /Saved|Сохранено/
  );
  const assetId = new URL(page.url()).searchParams.get('assetId');
  if (!assetId) throw new Error('Editor draft identity missing');
  await expect.poll(() => countMediaLibraryEntries(page, assetId)).toBe(1);
  // Durable autosave precedes the deferred presentation; keep the editor alive until both agree.
  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('sniptale-db');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            const tx = db.transaction(['media_library', 'aggregate_presentations']);
            const read = (store: string, key: IDBValidKey) =>
              new Promise<
                | {
                    workspaceRevision?: number;
                    presentationRevision?: number;
                    previewBlob?: Blob;
                    thumbnailBlob?: Blob;
                  }
                | undefined
              >((resolve, reject) => {
                const request = tx.objectStore(store).get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              });
            const [media, presentation] = await Promise.all([
              read('media_library', id),
              read('aggregate_presentations', ['image', id]),
            ]);
            return Boolean(
              media &&
              presentation &&
              presentation.presentationRevision === (media.workspaceRevision ?? 0) &&
              presentation.previewBlob instanceof Blob &&
              presentation.thumbnailBlob instanceof Blob
            );
          } finally {
            db.close();
          }
        }, assetId),
      { timeout: 10000 }
    )
    .toBe(true);

  await page.evaluate(
    ({ locale, theme }) =>
      chrome.storage.local.set({
        'sniptale-locale-preference': locale,
        'sniptale-theme-preference': theme,
      }),
    { locale, theme }
  );
  return assetId;
}

for (const [locale, theme] of [
  ['ru', 'light'],
  ['en', 'dark'],
] as const) {
  test(`gallery compact saving and direct trash confirmation ${locale} ${theme}`, async ({
    page,
    extensionId,
  }, info) => {
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const assetId = await createDraft(page, extensionId, locale, theme);
    const initialCount = await countMediaLibraryEntries(page);
    await page.setViewportSize({ width: 1024, height: 640 });
    await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
    await page
      .locator(`[data-gallery-keyboard-id="${assetId}"]`)
      .getByRole('button', { name: 'deletion-draft.png', exact: true })
      .first()
      .focus();
    await page.keyboard.press('Enter');
    const preview = page.locator('[data-ui="gallery.preview.surface"]');
    const header = page.locator('[data-ui="gallery.preview.inspectorHeader"]');
    const save = header.getByRole('button', {
      name: label('gallery.preview.saveToLibrary'),
      exact: true,
    });
    await expect(save).toBeVisible();
    const saveBox = (await save.boundingBox())!;
    const expiry = header.locator('.whitespace-nowrap');
    const expiryBox = (await expiry.boundingBox())!;
    expect(saveBox.width).toBeLessThanOrEqual(36);
    expect(
      Math.abs(saveBox.y + saveBox.height / 2 - expiryBox.y - expiryBox.height / 2)
    ).toBeLessThanOrEqual(1);
    expect(expiryBox.x + expiryBox.width).toBeLessThanOrEqual(saveBox.x);
    const lifecycle = page.locator('[data-ui="gallery.preview.lifecycle-actions"]');
    const remove = lifecycle.getByRole('button', {
      name: label('common.actions.delete'),
      exact: true,
    });
    expect(
      Math.abs((await remove.boundingBox())!.width - (await lifecycle.boundingBox())!.width)
    ).toBeLessThanOrEqual(1);
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`draft-${locale}.png`) });
    const headingStyles = await preview
      .locator('#preview-actions-heading, h3, label[for]')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node);
          return `${style.fontSize}:${style.fontWeight}:${style.letterSpacing}`;
        })
      );
    expect(headingStyles.length).toBeGreaterThanOrEqual(3);
    expect(new Set(headingStyles).size).toBe(1);
    await save.click();
    await expect(save).toHaveCount(0);
    await page
      .locator(`[data-gallery-keyboard-id="${assetId}"]`)
      .getByRole('button', { name: 'deletion-draft.png', exact: true })
      .first()
      .focus();
    await page.keyboard.press('Enter');
    await remove.click();
    const menu = page.locator('[data-ui="gallery.deletion.menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveCount(2);
    await menu
      .getByRole('menuitem', { name: label('gallery.app.permanentDelete'), exact: true })
      .click();
    await expect(menu.getByRole('status')).toContainText(
      label('gallery.app.permanentDeleteConfirm')
    );
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`menu-${locale}.png`) });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(remove).toBeFocused();
    await remove.click();
    await menu
      .getByRole('menuitem', { name: label('gallery.app.moveToTrash'), exact: true })
      .click();
    await expect(preview).toHaveCount(0);
    await page.locator('[data-ui="gallery.sidebar.footer"] button').click();
    const selection = page.locator('[data-ui="gallery.trash.selection"]');
    const restoreSelected = selection.getByRole('button', {
      name: label('gallery.app.restoreTrash'),
      exact: true,
    });
    await expect(restoreSelected).toBeDisabled();
    await selection
      .getByRole('button', { name: label('gallery.app.trashSelectAll'), exact: true })
      .click();
    await expect(restoreSelected).toBeEnabled();
    await expect(
      selection.getByRole('button', { name: label('gallery.app.permanentDelete'), exact: true })
    ).toBeEnabled();
    const retention = page.locator('[data-ui="gallery.trash.retention"]');
    await expect(
      retention.getByRole('heading', {
        name: label('gallery.app.trashRetentionTitle'),
        exact: true,
      })
    ).toBeVisible();
    const selectionBox = (await selection.boundingBox())!;
    expect(selectionBox.y + selectionBox.height).toBeLessThanOrEqual(
      (await retention.boundingBox())!.y
    );
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`trash-sidebar-${locale}.png`),
    });
    await selection
      .getByRole('button', { name: label('gallery.app.trashDeselectAll'), exact: true })
      .click();
    await expect(restoreSelected).toBeDisabled();

    await page
      .locator(`[data-gallery-keyboard-id="${assetId}"]`)
      .getByRole('button', { name: 'deletion-draft.png', exact: true })
      .first()
      .focus();
    await page.keyboard.press('Enter');
    const permanent = preview.getByRole('button', {
      name: label('gallery.app.permanentDelete'),
      exact: true,
    });
    await permanent.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(menu).toHaveCount(0);
    await expect(dialog).toContainText(label('gallery.app.permanentDeleteConfirm'));
    const cancel = dialog.getByRole('button', {
      name: label('common.actions.cancel'),
      exact: true,
    });
    await expect(cancel).toBeFocused();
    await expect.poll(() => countMediaLibraryEntries(page, assetId)).toBe(1);
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`trash-confirm-${locale}.png`),
    });
    await cancel.click();
    await expect(dialog).toHaveCount(0);
    await expect(permanent).toBeFocused();
    await permanent.click();
    await dialog
      .getByRole('button', { name: label('gallery.app.permanentDelete'), exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => countMediaLibraryEntries(page, assetId)).toBe(0);
    await expect.poll(() => countMediaLibraryEntries(page)).toBe(initialCount - 1);
  });
}
