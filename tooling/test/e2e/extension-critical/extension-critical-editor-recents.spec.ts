import { test, expect } from '../support/extension-fixture';
import type { Page } from '@playwright/test';

test.use({ actionTimeout: 10000 });

async function seedImages(page: Page, prefix: string) {
  await page.evaluate(async (prefix) => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#94b8e8';
    ctx.fillRect(0, 0, 640, 360);
    const blob = await new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG failed'))))
    );
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('sniptale-db');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(['media_library', 'thumbnails'], 'readwrite');
    tx.objectStore('media_library').clear();
    for (let i = 0; i < 16; i++) {
      const id = `${prefix}-${i}`;
      tx.objectStore('media_library').put({
        id,
        kind: 'screenshot',
        source: { kind: 'screenshot' },
        filename: `Recent image ${i}.png`,
        originalFilename: `Original ${i}.png`,
        createdAt: 1000 + i,
        updatedAt: 20000 - i,
        workspaceRevision: 0,
        size: blob.size,
        mimeType: blob.type,
        width: 640,
        height: 360,
        duration: null,
        sourceUrl: 'https://example.org/capture',
        sourceTitle: null,
        sourceFavicon: null,
        tags: [],
        lifecycle: {
          storageClass: i === 15 ? 'temporary' : 'library',
          savedAt: i === 15 ? null : 1000,
          updatedAt: 1000,
          ...(i === 14 ? { trashedAt: 1000 } : {}),
        },
        blob,
      });
      tx.objectStore('thumbnails').put({
        assetId: id,
        blob,
        createdAt: 1000,
        updatedAt: 1000,
        width: 640,
        height: 360,
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, prefix);
}

for (const locale of ['en', 'ru'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`image recent switcher ${locale} ${theme}`, async ({ context, extensionId }, info) => {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 560 });
      const base = `chrome-extension://${extensionId}/apps/extension/src`;
      await page.goto(`${base}/gallery/index.html`);
      await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
      await page.evaluate(
        async ({ locale, theme }) => {
          localStorage.setItem('sniptale-locale-preference', locale);
          await chrome.storage.local.set({
            'sniptale-locale-preference': locale,
            'sniptale-theme-preference': theme,
          });
        },
        { locale, theme }
      );
      const prefix = `recent-${locale}-${theme}`;
      await seedImages(page, prefix);
      await page.goto(`${base}/editor/index.html?assetId=${prefix}-0`);
      const trigger = page.locator('[data-ui="editor.recent-images.trigger"]');
      const popup = page.locator('[data-ui="editor.recent-images.panel"]');
      await expect(trigger).toBeVisible();
      await expect(popup).toHaveCount(0);
      await trigger.click();
      await expect(popup.locator('[data-ui="editor.recent-images.item"]')).toHaveCount(12);
      await expect(popup.locator('[aria-current="true"]')).toHaveAttribute(
        'data-asset-id',
        `${prefix}-0`
      );
      const ids = await popup
        .locator('[data-asset-id]')
        .evaluateAll((ns) => ns.map((n) => n.getAttribute('data-asset-id')));
      expect(ids).toEqual(Array.from({ length: 12 }, (_, i) => `${prefix}-${i}`));
      await expect(popup.locator('img').first()).toBeVisible();
      await expect(popup.locator('[data-recent-close]')).toHaveCount(0);
      await expect(popup).not.toContainText(
        locale === 'ru' ? 'Недавние изображения' : 'Recent images'
      );
      await expect(popup.locator('[data-asset-id]').first()).toContainText('example.org');
      await expect(popup).not.toContainText('640 × 360');
      await expect(popup).not.toContainText('Recent image');
      await expect(popup.locator('[title^="Recent image"]')).toHaveCount(0);
      const preview = (await popup.locator('img').first().boundingBox())!;
      expect(preview.width).toBeGreaterThanOrEqual(111);
      expect(preview.height).toBeGreaterThanOrEqual(62);
      // These rows have no editor workspace: they are fresh library captures.
      await expect(popup.locator(`[data-asset-id="${prefix}-1"]`)).toBeVisible();

      const scroll = popup.locator('[data-ui="editor.recent-images.scroll"]');
      expect(await scroll.evaluate((n) => n.scrollWidth - n.clientWidth)).toBe(0);
      expect(await scroll.evaluate((n) => n.scrollHeight > n.clientHeight)).toBe(true);
      await scroll.evaluate((n) => {
        n.scrollTop = n.scrollHeight;
      });
      await expect(popup.locator('[data-asset-id]').last()).toBeInViewport();
      await scroll.evaluate((n) => {
        n.scrollTop = 0;
      });

      const bounds = (await popup.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(560);
      expect(await popup.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
      const documentBar = (await page
        .locator('[data-ui="editor.floating.document-bar.close-file-button"]')
        .boundingBox())!;
      const tools = (await page
        .locator('[data-ui="editor.floating.tool-rail.select"]')
        .boundingBox())!;
      expect(documentBar.x + documentBar.width).toBeLessThanOrEqual(tools.x + 1);
      await page.screenshot({ path: info.outputPath('recent-images-short.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.mouse.click(850, 180);
      await expect(popup).toHaveCount(0);
      // A new drawing must survive switching away and opening this project again.
      await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
      const canvas = (await page
        .locator('[data-ui="editor.canvas.layer"] canvas.upper-canvas')
        .boundingBox())!;
      await page.mouse.move(canvas.x + 80, canvas.y + 80);
      await page.mouse.down();
      await page.mouse.move(canvas.x + 160, canvas.y + 120, { steps: 5 });
      await page.mouse.up();
      const backgroundTab = page.locator('[data-ui="editor.floating.layers.mode.frame"]');
      await backgroundTab.click();
      const inspectorScroll = page.locator('[data-ui="editor.floating.inspector-scroll"]');
      await inspectorScroll.evaluate((node) => {
        node.scrollTop = 100;
      });
      const previousScroll = await inspectorScroll.evaluate((node) => node.scrollTop);
      const timeOrigin = await page.evaluate(() => performance.timeOrigin);
      const toolbar = await page
        .locator('[data-ui="editor.floating.document-bar.surface"]')
        .elementHandle();
      const inspector = await page
        .locator('[data-ui="editor.floating.layers-panel"]')
        .elementHandle();
      await trigger.click();
      await popup.locator(`[data-asset-id="${prefix}-1"]`).click();
      await expect(page).toHaveURL((url) => url.searchParams.get('assetId') === `${prefix}-1`);
      await expect(page.locator('[data-ui="editor.floating.document-bar.title"]')).toContainText(
        'Recent image 1'
      );
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
      expect(await toolbar!.evaluate((node) => node.isConnected)).toBe(true);
      expect(await inspector!.evaluate((node) => node.isConnected)).toBe(true);
      await expect(page.locator('[data-ui="editor.page.switch-loading"]')).toHaveCount(0);
      await expect(backgroundTab).toHaveAttribute('aria-pressed', 'true');
      expect(
        Math.abs((await inspectorScroll.evaluate((node) => node.scrollTop)) - previousScroll)
      ).toBeLessThanOrEqual(1);
      await page.locator('[data-ui="editor.floating.layers.mode.layers"]').click();
      await page.reload();
      await expect(page.locator('[data-ui="editor.floating.document-bar.title"]')).toContainText(
        'Recent image 1'
      );
      await backgroundTab.click();
      await trigger.click();
      await popup.locator(`[data-asset-id="${prefix}-0"]`).click();
      await expect(page).toHaveURL((url) => url.searchParams.get('assetId') === `${prefix}-0`);
      await expect(backgroundTab).toHaveAttribute('aria-pressed', 'true');
      await page.locator('[data-ui="editor.floating.layers.mode.layers"]').click();
      await expect(page.locator('[data-ui="editor.layers.list-viewport"] > div')).toHaveCount(2);
      await page.setViewportSize({ width: 1920, height: 900 });
      await trigger.click();
      await expect(popup.locator('[data-ui="editor.recent-images.item"]')).toHaveCount(12);
      // An edited image with no regenerated presentation must still show its base thumbnail.
      await expect(popup.locator(`[data-asset-id="${prefix}-0"] img`)).toBeVisible();
      await page.screenshot({ path: info.outputPath('recent-images-wide.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1100, height: 560 });
      await trigger.click();
      const narrow = (await popup.boundingBox())!;
      expect(narrow.x + narrow.width).toBeLessThanOrEqual(1100);
      await page.keyboard.press('Escape');
      if (locale === 'en' && theme === 'light') {
        await page.setViewportSize({ width: 1280, height: 560 });
        await page.locator('[data-ui="autosave-control"] > button').click();
        await page.getByRole('switch').locator('..').click();
        await page.keyboard.press('Escape');
        await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
        const bounds = (await page
          .locator('[data-ui="editor.canvas.layer"] canvas.upper-canvas')
          .boundingBox())!;
        await page.mouse.move(bounds.x + 100, bounds.y + 150);
        await page.mouse.down();
        await page.mouse.move(bounds.x + 200, bounds.y + 170, { steps: 5 });
        await page.mouse.up();
        await trigger.click();
        await popup.locator(`[data-asset-id="${prefix}-1"]`).click();
        await expect(page).toHaveURL((url) => url.searchParams.get('assetId') === `${prefix}-1`);
        await trigger.click();
        await popup.locator(`[data-asset-id="${prefix}-0"]`).click();
        await expect(page).toHaveURL((url) => url.searchParams.get('assetId') === `${prefix}-0`);
        await expect(page.locator('[data-ui="editor.layers.list-viewport"] > div')).toHaveCount(3);
        await page.locator('[data-ui="autosave-control"] > button').click();
        await page.getByRole('switch').locator('..').click();
        await page.keyboard.press('Escape');
        await page.evaluate(async (prefix) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('sniptale-db');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const original: unknown = await new Promise((resolve, reject) => {
            const read = db
              .transaction('media_library')
              .objectStore('media_library')
              .get(`${prefix}-1`);
            read.onsuccess = () => resolve(read.result);
            read.onerror = () => reject(read.error);
          });
          if (!original || typeof original !== 'object') throw new Error('Missing fixture');
          const blob = new Blob(['invalid PNG'], { type: 'image/png' });
          const tx = db.transaction('media_library', 'readwrite');
          tx.objectStore('media_library').put({
            ...original,
            id: `${prefix}-broken`,
            filename: 'Broken image.png',
            updatedAt: Date.now() + 100000,
            blob,
            size: blob.size,
          });
          await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          db.close();
        }, prefix);
        await trigger.click();
        await popup.locator(`[data-asset-id="${prefix}-broken"]`).click();
        await expect(popup.getByRole('alert')).toBeVisible();
        await expect(page).toHaveURL((url) => url.searchParams.get('assetId') === `${prefix}-0`);
        await expect(page.locator('[data-ui="editor.layers.list-viewport"] > div')).toHaveCount(3);
        await page.keyboard.press('Escape');
        const restoredCanvas = (await page
          .locator('[data-ui="editor.canvas.layer"] canvas.upper-canvas')
          .boundingBox())!;
        await page.mouse.move(restoredCanvas.x + 100, restoredCanvas.y + 200);
        await page.mouse.down();
        await page.mouse.move(restoredCanvas.x + 200, restoredCanvas.y + 220, { steps: 4 });
        await page.mouse.up();
        await expect(page.locator('[data-ui="editor.layers.list-viewport"] > div')).toHaveCount(4);
        await trigger.click();
        await popup.locator(`[data-asset-id="${prefix}-1"]`).click();
        await expect(page).toHaveURL((url) => url.searchParams.get('assetId') === `${prefix}-1`);
        await trigger.click();
        await popup.locator(`[data-asset-id="${prefix}-0"]`).click();
        await expect(page.locator('[data-ui="editor.layers.list-viewport"] > div')).toHaveCount(4);
      }
      await page.evaluate(async (prefix) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sniptale-db');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const tx = db.transaction('media_library', 'readwrite');
        for (let i = 1; i < 16; i++) tx.objectStore('media_library').delete(`${prefix}-${i}`);
        tx.objectStore('media_library').delete(`${prefix}-broken`);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      }, prefix);
      await trigger.click();
      await expect(popup.locator('[data-asset-id]')).toHaveCount(1);
      const shortScroll = popup.locator('[data-ui="editor.recent-images.scroll"]');
      expect(await shortScroll.evaluate((n) => n.scrollHeight - n.clientHeight)).toBe(0);
      expect(await shortScroll.evaluate((n) => n.scrollWidth - n.clientWidth)).toBe(0);
      await page.screenshot({ path: info.outputPath('recent-images-one.png'), fullPage: false });
      await page.close();
    });
  }
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`recent chooser opens a never-edited temporary capture ${viewport.width}`, async ({
    context,
    extensionId,
  }, info) => {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    const base = `chrome-extension://${extensionId}/apps/extension/src`;
    await page.goto(`${base}/gallery/index.html`);
    await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
    const prefix = `fresh-capture-${viewport.width}`;
    await seedImages(page, prefix);
    await page.goto(`${base}/editor/index.html?assetId=${prefix}-0`);
    const trigger = page.locator('[data-ui="editor.recent-images.trigger"]');
    await expect(trigger).toBeVisible();
    const before = await page.evaluate(async (prefix) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(['media_library', 'image_workspaces'], 'readwrite');
      const read = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const id = `${prefix}-15`;
      const entry: unknown = await read(tx.objectStore('media_library').get(id));
      if (
        !entry ||
        typeof entry !== 'object' ||
        !('lifecycle' in entry) ||
        !entry.lifecycle ||
        typeof entry.lifecycle !== 'object' ||
        !('storageClass' in entry.lifecycle) ||
        !('workspaceRevision' in entry)
      )
        throw new Error('Missing capture fixture');
      const workspace = await read(tx.objectStore('image_workspaces').get(id));
      const now = Date.now();
      tx.objectStore('media_library').put({
        ...entry,
        createdAt: now,
        updatedAt: now + 60_000,
        lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: now },
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return {
        storageClass: entry.lifecycle.storageClass,
        revision: entry.workspaceRevision,
        hasWorkspace: workspace !== undefined,
      };
    }, prefix);
    expect(before).toEqual({ storageClass: 'temporary', revision: 0, hasWorkspace: false });
    await trigger.click();
    const popup = page.locator('[data-ui="editor.recent-images.panel"]');
    const fresh = popup.locator(`[data-asset-id="${prefix}-15"]`);
    await expect(fresh).toBeVisible();
    await expect(fresh.locator('img')).toBeVisible();
    await expect(popup.locator('[data-asset-id]').first()).toHaveAttribute(
      'data-asset-id',
      `${prefix}-15`
    );
    await expect(popup.locator(`[data-asset-id="${prefix}-14"]`)).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('never-edited-capture-listed.png'),
      fullPage: false,
    });
    await fresh.click();
    await expect(page).toHaveURL((url) => url.searchParams.get('assetId') === `${prefix}-15`);
    await expect(popup).toHaveCount(0);
    await expect(page.locator('[data-ui="editor.floating.document-bar.title"]')).toContainText(
      'Recent image 15'
    );
    await page.reload();
    await expect(page.locator('[data-ui="editor.floating.document-bar.title"]')).toContainText(
      'Recent image 15'
    );
    await page.close();
  });
}
