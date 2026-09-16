import { expect, type Page } from '@playwright/test';
import { test } from '../support/extension-fixture';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  SCENARIO_EDITOR_VISUAL_HARNESS_PATH,
} from '../extension-critical.helpers';

async function projectIds(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string[]>((resolve, reject) => {
        const request = database
          .transaction('scenario_projects')
          .objectStore('scenario_projects')
          .getAllKeys();
        request.onsuccess = () =>
          resolve(request.result.filter((key): key is string => typeof key === 'string'));
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

test('Gallery backup restores an editable guide with raster assets and saved undo history', async ({
  page,
  hostOrigin,
}) => {
  await applyHarnessBootstrap(page, { preserveMediaLibrary: true });
  const id = `backup-${crypto.randomUUID()}`;
  const url = new URL(`${hostOrigin}${SCENARIO_EDITOR_VISUAL_HARNESS_PATH}`);
  url.search = new URLSearchParams({
    projectId: id,
    locale: 'en',
    theme: 'light',
    stepId: 'text-only',
  }).toString();
  await page.goto(url.toString());
  await page.getByRole('textbox', { name: 'Scenario', exact: true }).fill(id);
  const title = page.locator('article#text-only .guide-step-title');
  await title.fill('Restored editable step');
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await page.goto(`${hostOrigin}${GALLERY_HARNESS_PATH}`);
  const card = page.getByRole('button', { name: id, exact: true }).first().locator('..');
  await card.hover();
  await card.getByRole('button', { name: 'Select item', exact: true }).click();
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__sniptaleHarness?.getSavedFiles().at(-1) ?? null))
    .not.toBeNull();
  const saved = await page.evaluate(() => window.__sniptaleHarness?.getSavedFiles().at(-1));
  if (!saved) throw new Error('Missing backup file');
  const before = await projectIds(page);
  await page.locator('[data-ui="gallery.header.storage"] > button').click();
  await page.getByRole('menuitem', { name: 'Restore from backup', exact: true }).click();
  await page.locator('input[accept=".zip,application/zip"]').setInputFiles({
    name: saved.filename,
    mimeType: 'application/zip',
    buffer: Buffer.from(saved.bytes),
  });
  await page.getByRole('button', { name: 'If an item already exists', exact: true }).click();
  await page.getByRole('option', { name: 'Keep both copies', exact: true }).click();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect
    .poll(async () => (await projectIds(page)).filter((key) => !before.includes(key)))
    .toHaveLength(1);
  const restored = (await projectIds(page)).find((key) => !before.includes(key));
  if (!restored) throw new Error('Missing restored project');
  url.searchParams.set('projectId', restored);
  await page.goto(url.toString());
  await expect(title).toHaveValue('Restored editable step');
  await expect(page.locator('article')).toHaveCount(2);
  await expect
    .poll(() =>
      page
        .locator('article img')
        .evaluateAll(
          (images) =>
            images.length === 2 &&
            images.every(
              (image) =>
                image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
            )
        )
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(title).toHaveValue('Text-only step');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(title).toHaveValue('Restored editable step');
  await expect(page.getByRole('status').first()).toHaveText('Saved');
  await page.reload();
  await expect(title).toHaveValue('Restored editable step');
});
