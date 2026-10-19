import { expect, type Page } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';
import { openVisualHarness } from './scenario-editor-visual.helpers';

async function savedSource(page: Page, downgrade = false) {
  return page.evaluate(async (changeVersion) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value);
    try {
      if (changeVersion) {
        const id = new URLSearchParams(location.search).get('projectId');
        if (!id) throw new Error('Missing project identity');
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('scenario_projects', 'readwrite');
          const store = tx.objectStore('scenario_projects');
          const request = store.get(id);
          request.onsuccess = () => {
            const entry: unknown = request.result;
            if (!record(entry) || !record(entry['project']) || !record(entry['project']['tour'])) {
              tx.abort();
              reject(new Error('Missing stored tour fixture'));
              return;
            }
            entry['project']['tour']['version'] = 1;
            store.put(entry);
          };
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
          tx.onerror = () => reject(tx.error);
        });
      }
      const stores = [...db.objectStoreNames].filter((name) => name.startsWith('scenario_'));
      const rows = await Promise.all(
        stores.map(
          (name) =>
            new Promise<unknown>((resolve, reject) => {
              const request = db.transaction(name).objectStore(name).getAll();
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            })
        )
      );
      async function bytes(value: unknown): Promise<unknown> {
        if (value instanceof Blob) {
          const digest = await crypto.subtle.digest('SHA-256', await value.arrayBuffer());
          return { type: value.type, size: value.size, digest: [...new Uint8Array(digest)] };
        }
        if (Array.isArray(value)) return Promise.all(value.map(bytes));
        if (record(value))
          return Object.fromEntries(
            await Promise.all(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(async ([key, item]) => [key, await bytes(item)])
            )
          );
        return value;
      }
      return JSON.stringify(
        await bytes(Object.fromEntries(stores.map((name, i) => [name, rows[i]])))
      );
    } finally {
      db.close();
    }
  }, downgrade);
}

for (const [locale, size] of [
  ['ru', { width: 1280, height: 560 }],
  ['en', { width: 1920, height: 900 }],
] as const) {
  test(`explains unsupported tour format without overwriting saved source ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    await openVisualHarness(page, hostOrigin, 'light', locale, size, 'compare', {
      tourFixture: '1',
    });
    await expect(
      page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true })
    ).toBeVisible();
    const before = await savedSource(page, true);
    const reopen = new URL(page.url());
    reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
    reopen.searchParams.set('skipSeed', '1');
    reopen.searchParams.set('locale', locale);
    reopen.searchParams.set('theme', 'light');
    await page.goto(reopen.href, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(t('scenario.editor.tourUnsupportedOpen'), { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: t('scenario.editor.createProject'), exact: true })
    ).toBeVisible();
    await expect(page.locator('.tour-stage-host')).toHaveCount(0);
    expect(await savedSource(page)).toBe(before);
    await page
      .getByRole('button', { name: t('shared.editorStart.retry'), exact: true })
      .first()
      .click();
    await expect(
      page.getByText(t('scenario.editor.tourUnsupportedOpen'), { exact: true }).first()
    ).toBeVisible();
    expect(await savedSource(page)).toBe(before);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(t('scenario.editor.tourUnsupportedOpen'), { exact: true }).first()
    ).toBeVisible();
    expect(await savedSource(page)).toBe(before);
    await page.screenshot({
      path: info.outputPath('unsupported-source-preserved.png'),
      fullPage: false,
    });
  });
}
