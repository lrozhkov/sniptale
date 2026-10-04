import { test, expect } from '../support/extension-fixture';
import type { Page } from '@playwright/test';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../../../apps/extension/src/features/scenario/project/factories';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { getSystemSurfaceStylePresets } from '../../../../apps/extension/src/features/highlighter/surface-style/system-presets';

function fixtureProject() {
  const project = createGuideProject('Hint style proof', 'hint-style-proof', 1000);
  const slide = createTourImageSlide('style-slide');
  slide.title = 'Style slide';
  slide.image = {
    assetId: 'hint-style-image',
    galleryAssetId: null,
    editDocumentId: null,
    width: 640,
    height: 360,
    alt: 'Screenshot',
    source: { kind: 'import', filename: 'image.png' },
  };
  slide.hotspots = [
    {
      id: 'style-hotspot',
      point: { x: 0.25, y: 0.33 },
      targetRect: null,
      label: 'Hotspot proof',
      text: 'Hotspot explanation',
      action: { kind: 'none' },
      appearance: null,
      pulse: false,
    },
  ];
  slide.annotations = [
    { id: 'style-annotation', text: 'Slide explanation proof', anchor: null, appearance: null },
  ];
  project.tour = { ...createTourDocument(), slides: [slide] };
  expect(parseGuideProject(project).status).toBe('ok');
  return project;
}
async function seed(page: Page, locale: 'ru' | 'en', theme: 'light' | 'dark') {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const value: unknown = (await chrome.storage.local.get('sniptale-locale-preference'))[
          'sniptale-locale-preference'
        ];
        return value === 'en' || value === 'ru';
      })
    )
    .toBe(true);
  await page.evaluate(
    async ({ project, locale, theme }) => {
      localStorage.setItem('sniptale-locale-preference', locale);
      await chrome.storage.local.set({
        'sniptale-locale-preference': locale,
        'sniptale-theme-preference': theme,
      });
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#2563eb';
      context.fillRect(0, 0, 640, 360);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('Missing PNG'))),
          'image/png'
        )
      );
      const directory = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('sniptale-assets', { create: true });
      const objects = await directory.getDirectoryHandle('objects', { create: true });
      const file = await objects.getFileHandle('hint-style-image', { create: true });
      const writer = await file.createWritable();
      await writer.write(blob);
      await writer.close();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(
        ['scenario_projects', 'scenario_assets', 'asset_refs'],
        'readwrite'
      );
      tx.objectStore('scenario_projects').put({
        id: project.id,
        project,
        createdAt: 1000,
        updatedAt: 1000,
        workspaceRevision: 1,
        lifecycle: { storageClass: 'library', savedAt: 1000, updatedAt: 1000 },
      });
      tx.objectStore('scenario_assets').put({
        id: 'hint-style-image',
        assetId: 'hint-style-image',
        projectId: project.id,
        galleryAssetId: null,
        width: 640,
        height: 360,
        size: blob.size,
        mimeType: 'image/png',
        createdAt: 1000,
      });
      tx.objectStore('asset_refs').put({
        assetId: 'hint-style-image',
        createdAt: 1000,
        location: { kind: 'opfs', objectKey: 'objects/hint-style-image' },
        mimeType: 'image/png',
        sha256: null,
        size: blob.size,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { project: fixtureProject(), locale, theme }
  );
}

for (const [locale, theme] of [
  ['ru', 'light'],
  ['en', 'dark'],
] as const) {
  test(`direct explanation style selection saves both object kinds ${locale}/${theme}`, async ({
    context,
    extensionId,
  }, info) => {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    const base = `chrome-extension://${extensionId}/apps/extension/src`;
    await page.goto(`${base}/gallery/index.html`);
    await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
    await seed(page, locale, theme);
    const url = `${base}/scenario-editor/index.html?projectId=hint-style-proof`;
    await page.goto(url);
    const text = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    await page
      .getByRole('button', {
        name: locale === 'ru' ? 'Интерактивный тур' : 'Interactive tour',
        exact: true,
      })
      .click();
    const inspector = page.locator('#guide-inspector-panel');
    const selectObject = async (id: string) => {
      const back = inspector.getByRole('button', {
        name: text('scenario.editor.tourBackToSlide'),
        exact: true,
      });
      if (await back.isVisible()) await back.click();
      await inspector
        .getByRole('button', { name: text('scenario.editor.tourObjects'), exact: true })
        .click();
      await inspector.locator(`[data-inspector-object="${id}"]`).click();
      if (id === 'style-hotspot')
        await inspector
          .getByRole('button', {
            name: text('scenario.editor.appearance'),
            exact: true,
          })
          .click();
    };
    const expected = getSystemSurfaceStylePresets().find(
      (preset) => preset.id === 'system-surface-soft-elevated'
    )!.style;
    for (const id of ['style-hotspot', 'style-annotation']) {
      await selectObject(id);
      const selector = inspector.locator('[data-ui="shared.ui.surface-style-selector"]');
      await selector.locator('button').first().click();
      const dialog = selector.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole('button', { name: text('content.callout.surfaceStyle.surface'), exact: true })
        .click();
      await expect(dialog.locator('textarea')).toHaveCount(0);
      for (const key of ['duplicate', 'create', 'apply'] as const)
        await expect(
          dialog.getByRole('button', {
            name: text(`content.callout.surfaceStyle.${key}`),
            exact: true,
          })
        ).toHaveCount(0);
      const preset = dialog.getByRole('button', {
        name: text('content.callout.surfaceStyle.system.softElevated'),
        exact: true,
      });
      await preset.scrollIntoViewIfNeeded();
      await expect(preset).toBeInViewport();
      await preset.focus();
      await preset.press('Enter');
      await expect(preset).toHaveAttribute('aria-pressed', 'true');
      await expect(preset).toBeInViewport();
      await page.screenshot({ path: info.outputPath(`${id}-selection.png`) });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(selector.locator('button').first()).toBeFocused();
    }
    const hint = page.locator('.tour-stage-host [data-tour-hint]');
    await expect(hint).toBeVisible();
    await expect
      .poll(() =>
        hint.evaluate((element, css) => {
          const expectedStyle = document.createElement('div');
          expectedStyle.style.cssText = css;
          return (
            expectedStyle.style.boxShadow !== '' &&
            element.style.boxShadow === expectedStyle.style.boxShadow
          );
        }, expected.surfaceCss)
      )
      .toBe(true);
    const saved = () =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const request = indexedDB.open('sniptale-db');
          request.onsuccess = () => resolve(request.result);
        });
        const row: unknown = await new Promise((resolve) => {
          const request = db
            .transaction('scenario_projects')
            .objectStore('scenario_projects')
            .get('hint-style-proof');
          request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return row;
      });
    await expect.poll(saved).toMatchObject({
      project: {
        tour: {
          slides: [
            expect.objectContaining({
              hotspots: [
                expect.objectContaining({
                  appearance: expect.objectContaining({
                    surface: expect.objectContaining(expected),
                  }),
                }),
              ],
              annotations: [
                expect.objectContaining({
                  appearance: expect.objectContaining({
                    surface: expect.objectContaining(expected),
                  }),
                }),
              ],
            }),
          ],
        },
      },
    });
    await page.reload();
    await page
      .getByRole('button', {
        name: locale === 'ru' ? 'Интерактивный тур' : 'Interactive tour',
        exact: true,
      })
      .click();
    for (const id of ['style-hotspot', 'style-annotation']) {
      await selectObject(id);
      const selector = inspector.locator('[data-ui="shared.ui.surface-style-selector"]');
      await expect(selector.locator('button').first()).toContainText(
        text('content.callout.surfaceStyle.system.softElevated')
      );
    }
    await page.close();
  });
}
