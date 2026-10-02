import { test, expect } from '../support/extension-fixture';
import type { Page } from '@playwright/test';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../../../apps/extension/src/features/scenario/project/factories';
import type { TourNavigationSlide } from '@sniptale/runtime-contracts/scenario/types/tour';

const fullText = Array.from(
  { length: 80 },
  (_, index) => `Line ${index + 1}: Complete explanation content.`
).join('\n');
function fixtureProject() {
  const project = createGuideProject('Compact explanation', 'caption-proof', 1000);
  const tour = createTourDocument('caption-tour');
  tour.style.textAppearance.presentation = 'caption-bottom';
  const imageSlide = (id: string, text: string) => {
    const slide = createTourImageSlide(id);
    slide.title = id;
    slide.image = {
      assetId: 'caption-image',
      galleryAssetId: null,
      editDocumentId: null,
      width: 640,
      height: 360,
      alt: 'Screenshot',
      source: { kind: 'import', filename: 'image.png' },
    };
    slide.annotations = [{ id: `${id}-note`, text, anchor: null, appearance: null }];
    return slide;
  };
  tour.slides = [
    imageSlide('Short', 'Short explanation'),
    imageSlide('Long', fullText),
    imageSlide('Empty', ''),
  ];
  for (let index = 1; index <= 28; index++) {
    const slide: TourNavigationSlide = {
      id: `Slide${index}`,
      kind: 'navigation',
      title: `Slide ${index}`,
      description: '',
      background: { color: '#111827', image: null },
      buttons: [],
      narration: null,
      timing: createTourImageSlide().timing,
    };
    tour.slides.push(slide);
  }
  project.tour = tour;
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
      const file = await objects.getFileHandle('caption-image', { create: true });
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
        id: 'caption-image',
        assetId: 'caption-image',
        projectId: project.id,
        galleryAssetId: null,
        width: 640,
        height: 360,
        size: blob.size,
        mimeType: 'image/png',
        createdAt: 1000,
      });
      tx.objectStore('asset_refs').put({
        assetId: 'caption-image',
        createdAt: 1000,
        location: { kind: 'opfs', objectKey: 'objects/caption-image' },
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
  test(`compact explanations and right Slides drawer at1280 ${locale}/${theme}`, async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
    await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
    await seed(page, locale, theme);
    await page.goto(
      `chrome-extension://${extensionId}/apps/extension/src/scenario-editor/index.html?projectId=caption-proof`
    );
    await page
      .getByRole('button', {
        name: locale === 'ru' ? 'Интерактивный тур' : 'Interactive tour',
        exact: true,
      })
      .click();
    const stage = page.locator('.tour-stage-host');
    const hint = stage.locator('[data-tour-hint]');
    const text = stage.locator('[data-tour-hint-text]');
    const toggle = stage.locator('[data-tour-hint-toggle]');
    const next = stage.locator('[data-tour-next]');
    const previous = stage.locator('[data-tour-previous]');
    const contents = stage.locator('[data-tour-contents]');
    await expect(text).toHaveText('Short explanation');
    await expect(toggle).toBeHidden();
    await expect(stage.locator('[data-tour-hint-title]')).toBeHidden();
    expect(await hint.evaluate((node) => getComputedStyle(node).borderRadius)).toBe('0px');
    expect((await contents.boundingBox())!.x).toBeGreaterThan((await next.boundingBox())!.x);
    await next.click();
    const inspector = page.locator('#guide-inspector-panel');
    expect(
      (await inspector.locator('.guide-panel-heading').boundingBox())!.height
    ).toBeLessThanOrEqual(64);
    const editText = inspector.getByRole('textbox', {
      name: locale === 'ru' ? 'Текст' : 'Text',
      exact: true,
    });
    await expect(editText).toBeInViewport();
    await expect(editText).toHaveValue(fullText);
    await editText.focus();
    await expect(editText).toBeFocused();
    await expect(hint).toHaveAttribute('data-collapsed', 'true');
    await expect(toggle).toHaveAccessibleName(
      locale === 'ru' ? 'Развернуть пояснение' : 'Expand explanation'
    );
    expect(await text.evaluate((node) => node.textContent)).toBe(fullText);
    expect(
      await text.evaluate(
        (node) => node.clientHeight <= parseFloat(getComputedStyle(node).lineHeight) + 1
      )
    ).toBe(true);
    await toggle.focus();
    await toggle.press('Enter');
    await expect(toggle).toBeFocused();
    await expect(hint).toHaveAttribute('data-collapsed', 'false');
    expect(
      await text.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
        return node.scrollTop > 0;
      })
    ).toBe(true);
    expect((await hint.boundingBox())!.y + (await hint.boundingBox())!.height).toBeLessThanOrEqual(
      (await stage.locator('.tour-toolbar').boundingBox())!.y + 1
    );
    await page.screenshot({ path: `.tmp/scenario-caption-${locale}-${theme}.png` });
    await toggle.press('Enter');
    await expect(hint).toHaveAttribute('data-collapsed', 'true');
    await next.click();
    await expect(hint).toBeHidden();
    await previous.click();
    await expect(hint).toHaveAttribute('data-collapsed', 'true');
    await contents.click();
    const drawer = stage.locator('[data-tour-navigation]');
    const list = drawer.locator('.tour-contents-list');
    await expect(drawer).toBeVisible();
    expect(await list.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    const bounded = async () => {
      const bounds = (await stage.boundingBox())!;
      const box = (await drawer.boundingBox())!;
      return (
        box.y >= bounds.y &&
        box.y + box.height <= bounds.y + bounds.height + 1 &&
        Math.abs(box.x + box.width - bounds.x - bounds.width) <= 1
      );
    };
    await expect.poll(bounded).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(bounded).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect.poll(bounded).toBe(true);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(contents).toBeFocused();
    await contents.click();
    await list.getByRole('button').last().click();
    await expect(stage.locator('#tour-player')).toHaveAttribute('data-slide-id', 'Slide28');
    await expect(drawer).toBeHidden();
    await expect(contents).toBeFocused();
    const stored: unknown = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
      });
      const row: unknown = await new Promise((resolve) => {
        const request = db
          .transaction('scenario_projects')
          .objectStore('scenario_projects')
          .get('caption-proof');
        request.onsuccess = () => resolve(request.result);
      });
      db.close();
      return row;
    });
    expect(stored).toEqual({
      id: 'caption-proof',
      project: fixtureProject(),
      createdAt: 1000,
      updatedAt: 1000,
      workspaceRevision: 1,
      lifecycle: { storageClass: 'library', savedAt: 1000, updatedAt: 1000 },
    });
    await page.close();
  });
}
