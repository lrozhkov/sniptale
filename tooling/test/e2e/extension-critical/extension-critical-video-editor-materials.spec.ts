import { expect, test, type Page } from '@playwright/test';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { GALLERY_SAVED_VIEWS_STORAGE_KEY } from '../../../../apps/extension/src/composition/persistence/gallery-saved-views/contract';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { checkInspectorPaintedFont } from '../support/inspector-utilities';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

async function readSource(page: Page) {
  return page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction('media_library')
            .objectStore('media_library')
            .get('recording:beta-v1-recording');
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
        };
      })
  );
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  const theme = index === 0 ? 'dark' : 'light';
  test(`tagged material retains identity through montage ${viewport.name} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    page.setDefaultTimeout(10000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const project = createEmptyVideoProject('Material identity', 320, 180);
    const viewName = locale === 'en' ? 'Selected interviews' : 'Отобранные интервью';
    const views = {
      version: 1,
      views: [
        {
          id: 'selected-interviews',
          name: viewName,
          folderFilter: 'recording',
          createdAt: 1,
          updatedAt: 1,
          filters: {
            activeTags: ['interview'],
            scope: 'all',
            facetFilters: {
              created: [],
              updated: [],
              format: [],
              size: [],
              resolution: [],
              duration: [],
              source: [],
            },
          },
        },
      ],
    };
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: {
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': theme,
          [GALLERY_SAVED_VIEWS_STORAGE_KEY]: views,
        },
      });
      await page.addInitScript((language) => {
        localStorage.setItem('sniptale-locale-preference', language);
        if (sessionStorage.getItem('materials-seeded')) {
          const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
          if (typeof bootstrap === 'object' && bootstrap !== null)
            Reflect.deleteProperty(bootstrap, 'videoProjects');
        }
      }, locale);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open('sniptale-db');
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        const tx = db.transaction(['media_library', 'recordings', 'asset_owners'], 'readwrite');
        const done = new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
        const store = tx.objectStore('media_library');
        const r = store.get('recording:beta-v1-recording');
        r.onsuccess = () => {
          store.put({ ...r.result, tags: ['interview'] });
          store.put({
            ...r.result,
            id: 'recording:other-recording',
            filename: 'Other.webm',
            originalFilename: 'Other.webm',
            tags: [],
            source: { kind: 'recording', recordingId: 'other-recording' },
          });
        };
        const recording = tx.objectStore('recordings').get('beta-v1-recording');
        recording.onsuccess = () => {
          tx.objectStore('recordings').put({
            ...recording.result,
            id: 'other-recording',
            filename: 'Other.webm',
          });
          tx.objectStore('asset_owners').put({
            assetId: recording.result.assetId,
            ownerId: 'other-recording',
            ownerKind: 'recording',
            role: 'body',
          });
        };
        await done;
        db.close();
        sessionStorage.setItem('materials-seeded', 'true');
      });
      const sourceBefore = await readSource(page);
      const url = `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`;
      await page.goto(url);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const trigger = page.locator('[data-ui="video-editor.materials.library"]');
      const drawer = page.locator('[data-ui="video-editor.library.drawer"]');
      await trigger.click();
      await expect(drawer.getByRole('button', { name: /Other\.webm/ })).toHaveCount(1);
      const saved = drawer.getByRole('button', { name: viewName, exact: true });
      await saved.click();
      await expect(saved).toHaveAttribute('aria-pressed', 'true');
      await expect(drawer.getByRole('button', { name: /Other\.webm/ })).toHaveCount(0);
      await expect(saved.locator('span')).toHaveText(viewName);
      await checkInspectorPaintedFont(page, saved, 'material-view');
      const list = drawer.locator('[data-ui="library-materials-list"]');
      const card = list.getByRole('button', { name: /beta-v1\.webm/ });
      await expect(card).toHaveCount(1);
      const search = drawer.locator('input[type="search"]');
      await search.fill('interview');
      await expect(card).toHaveCount(0);
      await search.fill('beta-v1');
      await expect(card).toHaveCount(1);
      await card.click();
      const add = drawer
        .locator('[data-ui="video-editor.library.media-preview"]')
        .getByRole('button', { name: label('videoEditor.sidebar.addToTimeline'), exact: true });
      await expect(add.locator('svg')).toBeVisible();
      await add.click();
      await expect.poll(async () => (await readNativeVideoProject(page))?.assets.length).toBe(1);
      await expect(
        drawer
          .locator('[data-ui="video-editor.library.media-preview"]')
          .locator('[data-ui="video-editor.library.add-material"]')
      ).toBeDisabled();
      await page.screenshot({ path: info.outputPath('tag-filter-material.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
      await expect(trigger).toBeFocused();
      const imported = (await readNativeVideoProject(page))!;
      expect(imported.clips).toHaveLength(0);
      const asset = imported.assets[0]!;
      expect(asset.source).toEqual({ kind: 'recording', recordingId: 'beta-v1-recording' });
      const row = page.locator(`[data-material-id="${asset.id}"]`);
      await row.locator('[data-material-rename]').click();
      const rename = row.getByRole('textbox', { name: label('videoEditor.app.materialsRename') });
      await rename.fill('Interview A');
      await rename.press('Enter');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.assets[0]?.name)
        .toBe('Interview A');
      await row.locator('[draggable="true"]').click();
      const viewer = page.locator('[data-ui="video-editor.source-viewer"]');
      const append = viewer.getByTitle(label('videoEditor.app.materialsAppend'), { exact: true });
      await append.click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.filter((clip) => clip.type === 'VIDEO')
              .length
        )
        .toBe(1);
      await row.locator('[draggable="true"]').click();
      await append.click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.filter((clip) => clip.type === 'VIDEO')
              .length
        )
        .toBe(2);
      const placed = (await readNativeVideoProject(page))!;
      const videos = placed.clips.filter((clip) => clip.type === 'VIDEO');
      expect(placed.assets).toEqual([{ ...asset, name: 'Interview A' }]);
      expect(videos.map((clip) => clip.assetId)).toEqual([asset.id, asset.id]);
      expect(new Set(videos.map((clip) => clip.sourceInstanceId)).size).toBe(2);
      expect(videos.map((clip) => clip.duration)).toEqual([
        asset.metadata.duration,
        asset.metadata.duration,
      ]);
      expect(videos.map((clip) => clip.startTime)).toEqual([0, asset.metadata.duration]);
      await page
        .getByRole('button', {
          name: label('videoEditor.sidebar.sceneProperties'),
          exact: true,
        })
        .click();
      await page.locator('[data-ui="video-editor.timeline.toolbar.fit-project"]').click();
      await page
        .locator(`[data-project-timeline-clip="${videos[0]!.id}"]`)
        .click({ modifiers: ['Control'] });
      await page
        .getByRole('button', { name: label('videoEditor.timeline.duplicate'), exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.filter((clip) => clip.type === 'VIDEO')
              .length
        )
        .toBe(3);
      const duplicated = (await readNativeVideoProject(page))!;
      expect(duplicated.assets).toEqual(placed.assets);
      const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      await page.locator(`[data-project-timeline-clip="${videos[0]!.id}"]`).click();
      await playhead.press('Home');
      for (let frame = 0; frame < 6; frame++) await playhead.press('ArrowRight');
      const split = page.getByRole('button', {
        name: label('videoEditor.timeline.split'),
        exact: true,
      });
      await expect(split).toBeEnabled();
      await split.click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.filter((clip) => clip.type === 'VIDEO')
              .length
        )
        .toBe(4);
      const final = (await readNativeVideoProject(page))!;
      expect(final.assets).toEqual(placed.assets);
      expect(
        final.clips
          .filter((clip) => clip.type === 'VIDEO')
          .every((clip) => clip.assetId === asset.id)
      ).toBe(true);
      expect('tags' in final).toBe(false);
      expect(final.assets.some((item) => 'tags' in item)).toBe(false);
      expect(final.clips.some((item) => 'tags' in item)).toBe(false);
      expect(await readSource(page)).toEqual(sourceBefore);
      await page.screenshot({ path: info.outputPath('material-montage.png'), fullPage: false });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect(await readNativeVideoProject(page)).toEqual(final);
      expect(await readSource(page)).toEqual(sourceBefore);
      await trigger.click();
      await saved.click();
      await expect(card).toHaveCount(1);
      expect(
        await page.evaluate(
          (key) => window.__sniptaleHarness?.getStorageState()[key],
          GALLERY_SAVED_VIEWS_STORAGE_KEY
        )
      ).toEqual(views);
      expect(errors).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
