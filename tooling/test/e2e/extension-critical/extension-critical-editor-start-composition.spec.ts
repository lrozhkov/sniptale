import { translate } from '../../../../apps/extension/src/platform/i18n';
import { test, expect } from '../support/extension-fixture';
import { createGuideProject } from '../../../../apps/extension/src/features/scenario/project/factories';
import { createVideoProject } from '../../../../apps/extension/src/composition/persistence/projects/index.test-support';

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`editor start composition and actions ${variant.locale}/${variant.theme}`, async ({
    context,
    extensionId,
  }, info) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    const base = `chrome-extension://${extensionId}/apps/extension/src`;
    await page.goto(`${base}/gallery/index.html`);
    await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            typeof (await chrome.storage.local.get('sniptale-locale-preference'))[
              'sniptale-locale-preference'
            ]
        )
      )
      .toBe('string');
    await page.evaluate(async (variant) => {
      localStorage.setItem('sniptale-locale-preference', variant.locale);
      await chrome.storage.local.set({
        'sniptale-locale-preference': variant.locale,
        'sniptale-theme-preference': variant.theme,
      });
    }, variant);
    for (const editor of ['editor', 'video-editor', 'scenario-editor']) {
      const url = `${base}/${editor}/index.html`;
      const storeName =
        editor === 'editor'
          ? 'media_library'
          : editor === 'video-editor'
            ? 'video_projects'
            : 'scenario_projects';
      await page.evaluate(async (storeName) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sniptale-db');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      }, storeName);
      await page.goto(url);
      const start = page.locator('[data-ui="editor.start"]');
      await expect(start).toBeVisible();
      await expect(start.getByRole('heading', { level: 1 })).toHaveText(
        translate(
          editor === 'editor'
            ? 'editor.page.documentTitle'
            : editor === 'video-editor'
              ? 'videoEditor.app.documentTitle'
              : 'scenario.editor.documentTitle',
          variant.locale
        )
      );
      await expect(start.locator('[role="status"]')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`${editor}-empty.png`) });
      await start.getByRole('button').first().click();
      await expect(start).toBeHidden();
      const title =
        variant.locale === 'ru'
          ? 'Обучение команды — подробная демонстрация возможностей и новых рабочих процессов'
          : 'Team onboarding — a detailed demonstration of features and new working practices';
      const projects = Array.from({ length: 3 }, (_, index) =>
        editor === 'video-editor'
          ? createVideoProject({ id: `composition-video-${index}`, name: `${title} ${index + 1}` })
          : createGuideProject(`${title} ${index + 1}`, `composition-scenario-${index}`, 1000)
      );
      await page.evaluate(
        async ({ storeName, projects, title }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('sniptale-db');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 360;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#31569c';
          ctx.fillRect(0, 0, 640, 360);
          ctx.fillStyle = '#eef2fa';
          ctx.fillRect(50, 45, 540, 45);
          ctx.fillRect(50, 115, 250, 190);
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (blob) => (blob ? resolve(blob) : reject(new Error('PNG failed'))),
              'image/png'
            )
          );
          const tx = db.transaction(
            storeName === 'media_library' ? [storeName, 'thumbnails'] : [storeName],
            'readwrite'
          );
          if (storeName === 'media_library')
            tx.objectStore('thumbnails').put({
              assetId: 'composition-image-0',
              blob,
              createdAt: 1000,
              updatedAt: 1000,
              width: 640,
              height: 360,
            });
          const store = tx.objectStore(storeName);
          store.clear();
          const lifecycle = { savedAt: 1000, storageClass: 'library', updatedAt: 1000 };
          projects.forEach((project, index) =>
            store.put(
              storeName === 'media_library'
                ? {
                    id: `composition-image-${index}`,
                    kind: 'screenshot',
                    source: { kind: 'screenshot' },
                    filename: `${title} ${index + 1}.png`,
                    originalFilename: 'source.png',
                    createdAt: 1000,
                    updatedAt: 1000,
                    size: blob.size,
                    mimeType: blob.type,
                    width: 640,
                    height: 360,
                    duration: null,
                    sourceUrl: null,
                    sourceTitle: null,
                    sourceFavicon: null,
                    tags: [],
                    lifecycle,
                    blob,
                  }
                : {
                    id: project.id,
                    project,
                    createdAt: project.createdAt,
                    updatedAt: project.updatedAt,
                    workspaceRevision: 1,
                    lifecycle,
                  }
            )
          );
          await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          db.close();
        },
        { storeName, projects, title }
      );
      await page.goto(url);
      await expect(start.locator('section button')).toHaveCount(3);
      if (editor === 'editor') await expect(start.locator('section img').first()).toBeVisible();
      await page.screenshot({ path: info.outputPath(`${editor}-projects.png`) });
      expect(await start.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
      );
      const card = start.locator('section button').first();
      await card.focus();
      await page.keyboard.press('Enter');
      await expect(start).toBeHidden();
      await expect(page.locator('[data-ui="editor.page.open-error"]')).toHaveCount(0);
    }
    await page.close();
  });
}
