import { expect, test, type Page } from '@playwright/test';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { GALLERY_SAVED_VIEWS_STORAGE_KEY } from '../../../../apps/extension/src/composition/persistence/gallery-saved-views/contract';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { checkInspectorPaintedFont, chooseInspectorValue } from '../support/inspector-utilities';
import {
  computeQuickEditSceneSize,
  computeQuickEditSceneLayout,
} from '../../../../apps/extension/src/features/video/review/advanced/scene';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import { buildReviewTimeMap } from '../../../../apps/extension/src/features/video/review/timeline';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import {
  EFFECT_V1_TARGET_FIXTURE,
  EFFECT_V1_TRANSITION_FIXTURE,
  importEffectFile,
} from './extension-critical-video-effects.helpers';
import { readNativeVideoProject } from '../support/native-video-project';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  getRuntimeMessagesByType,
  VideoMessageType,
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

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  const theme = index === 0 ? 'dark' : 'light';
  test(`Gallery project continues as independent montage ${viewport.name} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(300000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const aggregateId = 'recording:beta-v1-recording';
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sniptale-db');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const tx = db.transaction(['media_library', 'recordings', 'asset_owners'], 'readwrite');
        const done = new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
        const library = tx.objectStore('media_library');
        const original = library.get('recording:beta-v1-recording');
        original.onsuccess = () =>
          library.put({
            ...original.result,
            id: 'recording:other-recording',
            filename: 'Other.webm',
            originalFilename: 'Other.webm',
            tags: [],
            source: { kind: 'recording', recordingId: 'other-recording' },
          });
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
      });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.cutMode'), exact: true })
        .click();
      const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
      const sourceLane = (await plane.getAttribute('data-active-tool-lane')) === 'source';
      const ruler = plane.locator(
        sourceLane
          ? '[data-ui="gallery.videoReview.sourceLane"]'
          : '[data-ui="gallery.videoReview.ruler"]'
      );
      const box = (await ruler.boundingBox())!;
      const duration = Number(await plane.getAttribute('aria-valuemax'));
      await page.mouse.move(box.x + (box.width * 2) / duration, box.y + 12);
      await page.mouse.down();
      await page.mouse.move(box.x + (box.width * 4) / duration, box.y + 12, { steps: 8 });
      await page.mouse.up();
      await expect
        .poll(async () => (await readNativeReviewWorkspace(page, aggregateId))?.project?.name)
        .toBeTruthy();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
        .click();
      const inspector = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
      const sceneGroup = async (key: Parameters<typeof translate>[0]) => {
        const category = inspector
          .locator('[data-ui="gallery.videoReview.inspectorCategories"] nav')
          .getByRole('button', { name: label(key), exact: true });
        if (await category.count()) await category.click();
      };
      await sceneGroup('gallery.videoReview.canvas');
      await chooseInspectorValue(
        page,
        inspector,
        label('videoEditor.sidebar.canvasFormatLabel'),
        '1:1'
      );
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.sourceCropMode'),
        label('gallery.videoReview.sourceCropEnable')
      );
      await sceneGroup('gallery.videoReview.windowHeader');
      const headerSettings = inspector.locator('[data-ui="window-header-settings"]');
      await chooseInspectorValue(
        page,
        headerSettings,
        label('windowHeader.type'),
        label('windowHeader.browser')
      );
      await chooseInspectorValue(
        page,
        headerSettings,
        label('windowHeader.style'),
        label('windowHeader.windows')
      );
      const title = headerSettings.getByRole('textbox', {
        name: label('windowHeader.tabTitle'),
        exact: true,
      });
      await title.fill('Editable transferred window');
      await title.press('Tab');
      await sceneGroup('gallery.videoReview.background');
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.backgroundZoom'),
        label('gallery.videoReview.backgroundZoomWindow')
      );
      await chooseInspectorValue(
        page,
        inspector.locator('.review-background-kinds'),
        label('gallery.videoReview.background'),
        label('gallery.videoReview.backgroundSolid')
      );
      for (const [key, value] of [
        ['gallery.videoReview.backgroundPadding', '8'],
        ['gallery.videoReview.backgroundCornerRadius', '6'],
        ['gallery.videoReview.backgroundShadow', '60'],
      ] as const) {
        const field = inspector.getByRole('textbox', { name: label(key), exact: true });
        await field.fill(value);
        await field.press('Enter');
      }
      await page.screenshot({
        path: info.outputPath('gallery-authored-scene.png'),
        fullPage: false,
      });
      await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
      const transfer = dialog.locator('[data-ui="gallery.videoReview.openVideoEditor"]');
      await transfer.scrollIntoViewIfNeeded();
      await checkInspectorPaintedFont(page, transfer, 'gallery-project-transfer');
      await page.screenshot({
        path: info.outputPath('gallery-project-transfer.png'),
        fullPage: false,
      });
      await transfer.click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
        )
        .toBe(1);
      const [tab] = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
      const target = new URL(tab!.url!);
      const gallery = (await readNativeReviewWorkspace(page, aggregateId))!;
      expect(gallery.project?.name).toBeTruthy();
      expect(gallery.project?.lifecycle.storageClass).toBe('library');
      expect(target.searchParams.get('review')).toBe(gallery.aggregateId);
      expect(Number(target.searchParams.get('reviewRevision'))).toBe(gallery.revision);
      expect(Number(target.searchParams.get('reviewCreatedAt'))).toBe(gallery.createdAt);
      expect(target.searchParams.get('reviewSourceAssetId')).toBe(gallery.sourceAssetId);
      const document = replayReviewHistory(
        gallery.history,
        gallery.cursor,
        gallery.source,
        reviewDocumentBaseline(gallery)
      );
      expect(document.edits.some((edit) => edit.kind === 'cut')).toBe(true);
      const scene = {
        source: gallery.source,
        canvas: document.advancedContent.canvas,
        windowHeader: document.advancedContent.windowHeader,
        background: document.advancedContent.background,
      };
      expect(scene.canvas).toMatchObject({ width: 90, height: 90, crop: { width: 0.5625 } });
      expect(scene.windowHeader).toMatchObject({
        kind: 'browser',
        style: 'windows',
        title: 'Editable transferred window',
      });
      expect(scene.background).toMatchObject({
        enabled: true,
        type: 'solid',
        zoomBehavior: 'window',
        layout: { padding: 8, cornerRadius: 6, shadow: { intensity: 60 } },
      });
      expect(document.advancedContent.zoom.regions).toEqual([]);
      const output = computeQuickEditSceneSize(scene);
      const layout = computeQuickEditSceneLayout({
        ...scene,
        output,
        camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
      });
      const expectedDuration = buildReviewTimeMap(gallery.source.duration, document.edits).at(
        -1
      )!.resultEnd;
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}${target.search}`);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect.poll(async () => (await readNativeVideoProject(page))?.id).toBeTruthy();
      const migrated = (await readNativeVideoProject(page))!;
      expect(migrated.id).not.toBe(gallery.aggregateId);
      expect(migrated.name).toBe(gallery.project!.name);
      expect(migrated.duration).toBeCloseTo(expectedDuration, 5);
      const originalVideos = migrated.clips.filter((clip) => clip.type === 'VIDEO');
      expect(originalVideos).toHaveLength(2);
      expect({ width: migrated.width, height: migrated.height }).toEqual({
        width: output.width,
        height: output.height,
      });
      expect(migrated.sceneBackground).toMatchObject({
        kind: 'solid',
        color:
          scene.background.enabled && scene.background.type === 'solid'
            ? scene.background.color
            : '',
      });
      for (const clip of originalVideos) {
        expect(clip).toMatchObject({
          sourceCrop: layout.sourceCrop,
          windowHeader: scene.windowHeader,
          windowCornerRadius: 6,
          shadowIntensity: 60,
          shadowMode: 'BACKDROP',
        });
        expect(clip.transform).toMatchObject(layout.windowRect);
      }
      await page.locator(`[data-project-timeline-clip="${originalVideos[0]!.id}"]`).click();
      const framing = page.getByRole('button', {
        name: label('videoEditor.sidebar.inspectorGroupFraming'),
        exact: true,
      });
      await framing.scrollIntoViewIfNeeded();
      await framing.click();
      const nativeTitle = page
        .locator('[data-ui="window-header-settings"]')
        .getByRole('textbox', { name: label('windowHeader.tabTitle'), exact: true });
      await expect(nativeTitle).toHaveValue('Editable transferred window');
      await nativeTitle.fill('Edited in montage');
      await nativeTitle.press('Tab');
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find(
            (clip) => clip.id === originalVideos[0]!.id
          )
        )
        .toMatchObject({ windowHeader: { title: 'Edited in montage' } });
      await checkInspectorPaintedFont(page, nativeTitle, 'input');
      const scenePlayhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      await scenePlayhead.press('Home');
      for (let step = 0; step < migrated.fps; step++) await scenePlayhead.press('ArrowRight');
      await expect
        .poll(() =>
          page.locator('[data-preview-stage-canvas]').evaluate(
            (node: HTMLCanvasElement, scene) => {
              const context = node.getContext('2d')!;
              const sample = (x: number, y: number) =>
                Array.from(
                  context.getImageData(
                    Math.round((x * node.width) / scene.output.width),
                    Math.round((y * node.height) / scene.output.height),
                    1,
                    1
                  ).data
                ).slice(0, 3);
              const header = sample(
                scene.window.x + scene.window.width / 2,
                scene.window.y + scene.output.headerHeight / 2
              );
              const source = sample(
                scene.window.x + scene.window.width / 2,
                scene.window.y +
                  scene.output.headerHeight +
                  (scene.window.height - scene.output.headerHeight) / 2
              );
              return (
                Math.min(...header) > 100 &&
                Math.max(...source) > 100 &&
                Math.max(...source) - Math.min(...source) > 30
              );
            },
            { output, window: layout.windowRect }
          )
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath('migrated-editable-scene.png'),
        fullPage: false,
      });
      expect(await readNativeReviewWorkspace(page, aggregateId)).toEqual(gallery);
      await expect.poll(() => new URL(page.url()).searchParams.get('project')).toBe(migrated.id);
      expect(new URL(page.url()).searchParams.has('review')).toBe(false);
      await page.locator('[data-ui="video-editor.materials.library"]').click();
      const drawer = page.locator('[data-ui="video-editor.library.drawer"]');
      await drawer
        .locator('[data-ui="library-materials-list"]')
        .getByRole('button', { name: /Other\.webm/ })
        .click();
      await drawer
        .locator('[data-ui="video-editor.library.media-preview"]')
        .getByRole('button', { name: label('videoEditor.sidebar.addToTimeline'), exact: true })
        .click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.assets.length)
        .toBe(migrated.assets.length + 1);
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
      const imported = (await readNativeVideoProject(page))!;
      const second = imported.assets.find(
        (asset) =>
          asset.source.kind === 'recording' && asset.source.recordingId === 'other-recording'
      )!;
      await page.locator(`[data-material-id="${second.id}"]`).locator('[draggable="true"]').click();
      await page
        .locator('[data-ui="video-editor.source-viewer"]')
        .getByTitle(label('videoEditor.app.materialsAppend'), { exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.filter((clip) => clip.type === 'VIDEO')
              .length
        )
        .toBe(originalVideos.length + 1);
      const appended = (await readNativeVideoProject(page))!.clips.find(
        (clip) => clip.type === 'VIDEO' && clip.assetId === second.id
      )!;
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      await page.locator('[data-ui="video-editor.timeline.toolbar.fit-project"]').click();
      await page.locator(`[data-project-timeline-clip="${appended.id}"]`).click();
      const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      await playhead.press('End');
      for (let step = 0; step < 6; step++) await playhead.press('ArrowLeft');
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
        .toBe(originalVideos.length + 2);
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      await page
        .locator(`[data-project-timeline-clip="${appended.id}"]`)
        .click({ modifiers: ['Control'] });
      const timing = page.getByRole('button', {
        name: label('videoEditor.sidebar.inspectorGroupTiming'),
        exact: true,
      });
      await timing.scrollIntoViewIfNeeded();
      await timing.click();
      const rate = page.getByRole('textbox', {
        name: label('videoEditor.sidebar.playbackRateLabel'),
        exact: true,
      });
      await rate.fill('2');
      await rate.press('Enter');
      await expect
        .poll(async () => {
          const clip = (await readNativeVideoProject(page))?.clips.find(
            (item) => item.id === appended.id
          );
          return clip?.type === 'VIDEO' ? clip.playbackRate : undefined;
        })
        .toBe(2);
      await checkInspectorPaintedFont(page, rate, 'migrated-project-rate');
      await page.screenshot({
        path: info.outputPath('migrated-project-rate.png'),
        fullPage: false,
      });
      await importEffectFile(page, {
        documentId: 'demo-target-overlay',
        fixturePath: EFFECT_V1_TARGET_FIXTURE,
        locale,
      });
      const effect = page.locator('[data-effect-document="demo-target-overlay"]');
      await effect.hover();
      await effect
        .getByRole('button', { name: label('videoEditor.effectsLibrary.applyToClip'), exact: true })
        .click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.effectInstances?.length)
        .toBe(1);
      await importEffectFile(page, {
        documentId: 'neutral-transition',
        fixturePath: EFFECT_V1_TRANSITION_FIXTURE,
        locale,
      });
      await page.locator('[data-ui="video-editor.timeline.toolbar.fit-project"]').click();
      const transition = page.locator('[data-effect-document="neutral-transition"]');
      const junction = page
        .locator(`[data-track-lane-id="${originalVideos[0]!.trackId}"]`)
        .locator('[data-ui="timeline.transition-cut-drop"]')
        .first();
      const cardBox = (await transition.locator('p').first().boundingBox())!;
      const junctionBox = (await junction.boundingBox())!;
      await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
      await page.mouse.down();
      const dropX = junctionBox.x + junctionBox.width / 2;
      const dropY = junctionBox.y + junctionBox.height / 2;
      await page.mouse.move(dropX, dropY, { steps: 20 });
      await page.mouse.move(dropX, dropY);
      await page.mouse.up();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.effectInstances?.filter(
              (instance) => instance.kind === 'transition'
            ).length
        )
        .toBe(1);
      const transitioned = (await readNativeVideoProject(page))!;
      const videoJunction = transitioned.transitions?.find(
        (item) =>
          item.leadingClipId === originalVideos[0]!.id &&
          item.trailingClipId === originalVideos[1]!.id
      );
      expect(videoJunction).toBeDefined();
      expect(
        transitioned.effectInstances?.find((instance) => instance.kind === 'transition')?.target
      ).toEqual({ kind: 'transition', transitionId: videoJunction!.id });
      const originalAudio = migrated.clips.filter((clip) => clip.type === 'AUDIO');
      expect(originalAudio).toHaveLength(2);
      expect(
        transitioned.transitions?.some(
          (item) =>
            item.leadingClipId === originalAudio[0]!.id &&
            item.trailingClipId === originalAudio[1]!.id
        )
      ).toBe(true);
      await page.locator('[data-ui="video-editor.materials.close"]').click();
      const final = (await readNativeVideoProject(page))!;
      expect(final.id).toBe(migrated.id);
      expect(await readNativeReviewWorkspace(page, aggregateId)).toEqual(gallery);
      await page.screenshot({
        path: info.outputPath('migrated-project-effects.png'),
        fullPage: false,
      });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect(await readNativeVideoProject(page)).toEqual(final);
      expect(await readNativeReviewWorkspace(page, aggregateId)).toEqual(gallery);
      await page.screenshot({
        path: info.outputPath('migrated-project-reopened.png'),
        fullPage: false,
      });
      await page.evaluate(
        ({ capabilitiesType, startType }) => {
          window.__sniptaleHarness?.setRuntimeResponse(capabilitiesType, {
            success: true,
            capabilities: {
              formats: [
                { format: 'MP4', available: true },
                { format: 'WEBM', available: true },
              ],
              mp4Codecs: [
                { codec: 'AVC', available: true },
                { codec: 'VP9', available: true },
              ],
              defaultMp4VideoCodec: 'AVC',
            },
            capabilityToken: 'migration-export-start',
            cancelCapabilityToken: 'migration-export-cancel',
            ownerDocumentId: 'migration-editor-document',
          });
          window.__sniptaleHarness?.setRuntimeResponse(startType, {
            success: true,
            capabilityToken: 'migration-export-cancel',
            ownerDocumentId: 'migration-editor-document',
          });
        },
        {
          capabilitiesType: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
          startType: VideoMessageType.START_PROJECT_EXPORT,
        }
      );
      await page.locator('[data-ui="video-editor.timeline.toolbar.project-menu"]').click();
      await page
        .getByRole('button', { name: label('videoEditor.app.exportButton'), exact: true })
        .click();
      const exportInspector = page.locator('[data-ui="video-editor.export.inspector"]');
      await expect(exportInspector).toBeVisible();
      await exportInspector
        .getByRole('button', {
          name: label(
            index === 0
              ? 'videoEditor.exportDialog.formatWebmLabel'
              : 'videoEditor.exportDialog.formatMp4Label'
          ),
          exact: true,
        })
        .click();
      const exportSubmit = exportInspector.getByRole('button', {
        name: label('videoEditor.exportDialog.submit'),
        exact: true,
      });
      await expect(exportSubmit).toBeEnabled();
      await expect(exportSubmit).toBeInViewport();
      await checkInspectorPaintedFont(page, exportSubmit, 'migrated-project-export');
      await page.screenshot({
        path: info.outputPath('migrated-project-export-inspector.png'),
        fullPage: false,
      });
      await exportSubmit.click();
      await expect
        .poll(
          async () =>
            (await getRuntimeMessagesByType(page, VideoMessageType.START_PROJECT_EXPORT)).length
        )
        .toBe(1);
      const [start] = await getRuntimeMessagesByType(page, VideoMessageType.START_PROJECT_EXPORT);
      expect(start).toMatchObject({
        input: {
          projectId: final.id,
          contentSha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        },
        settings: { format: index === 0 ? 'WEBM' : 'MP4', scope: 'project' },
      });
      const exported = await encodedNativeVideoSamples(
        page,
        host.origin,
        final,
        index === 0 ? 'WEBM' : 'MP4',
        []
      );
      expect(exported.size).toBeGreaterThan(0);
      expect({ width: exported.width, height: exported.height }).toEqual({
        width: final.width,
        height: final.height,
      });
      expect(Math.abs(exported.duration - final.duration)).toBeLessThanOrEqual(0.1);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
