import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { mapCompositionPointThroughSourceContent } from '../../../../apps/extension/src/features/video/composition/motion/source-window';
import { fitQuickEditSourceCrop } from '../../../../apps/extension/src/features/video/review/advanced/canvas';
import { motionWindowAreaPoints } from '../../../../apps/extension/src/features/video/composition/motion/source-window';
import { resolveVideoCompositionFrame } from '../../../../apps/extension/src/features/video/composition/timeline/frame';
import {
  getFittedMediaOriginalWindowFrame,
  getFittedMediaWindowFrame,
} from '../../../../apps/extension/src/features/video/composition/draw/fitted-media';
import { mapCompositionPointThroughCamera } from '../../../../apps/extension/src/features/video/composition/motion';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createVideoProjectCursorTrack } from '../../../../apps/extension/src/features/video/project/defaults';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { GALLERY_SAVED_VIEWS_STORAGE_KEY } from '../../../../apps/extension/src/composition/persistence/gallery-saved-views/contract';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { checkInspectorPaintedFont, chooseInspectorValue } from '../support/inspector-utilities';
import {
  computeQuickEditSceneSize,
  computeQuickEditSceneLayout,
} from '../../../../apps/extension/src/features/video/review/advanced/scene';
import { webcamVideoPixels } from '../support/quick-editor-webcam-proof';
import {
  addReviewFocus,
  seedReviewWebcamBundle,
  seedReviewVideo,
} from '../support/quick-editor-media-fixture';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import { buildReviewTimeMap } from '../../../../apps/extension/src/features/video/review/timeline';
import {
  readNativeReviewWorkspace,
  replaceNativeReviewWorkspace,
} from '../support/native-review-workspace';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';
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

async function solidImageUpload(
  page: Page,
  name: string,
  color: string,
  width: number,
  height: number
) {
  const data = await page.evaluate(
    ({ color, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      context.fillStyle = color;
      context.fillRect(0, 0, width, height);
      return canvas.toDataURL('image/png').split(',')[1]!;
    },
    { color, width, height }
  );
  return { name, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

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
      await seedReviewWebcamBundle(page);
      const capturedCursor = createVideoProjectCursorTrack('embedded-fallback');
      capturedCursor.skin.hidden = true;
      capturedCursor.samples = [
        { id: 'handoff-cursor:0', time: 0, x: 0.1, y: 0.2, visible: true },
        { id: 'handoff-cursor:removed', time: 3, x: 0.8, y: 0.7, visible: true },
        { id: 'handoff-cursor:6', time: 6, x: 0.3, y: 0.4, visible: true },
        { id: 'handoff-cursor:outside', time: 8, x: 0.3, y: 0.4, visible: false },
        { id: 'handoff-cursor:return', time: 9, x: 0.7, y: 0.6, visible: true },
        { id: 'handoff-cursor:end', time: 12, x: 0.9, y: 0.8, visible: true },
      ].map((sample) => ({
        ...sample,
        observation: sample.visible ? 'observed' : 'outside',
        captureSegment: sample.time >= 9 ? 1 : 0,
        recordingPoint: sample.visible ? { x: sample.x, y: sample.y } : null,
        x: sample.x * 160,
        y: sample.y * 90,
      }));
      await page.evaluate(async (cursorTrack) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sniptale-db');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const tx = db.transaction(
          ['media_library', 'recordings', 'asset_owners', 'recording_telemetry'],
          'readwrite'
        );
        const done = new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
        tx.objectStore('recording_telemetry').put({
          recordingId: 'beta-v1-recording',
          captureMode: 'TAB',
          createdAt: 1,
          updatedAt: 1,
          viewport: null,
          cursorTrack,
          actionEvents: [],
          signals: [
            {
              id: 'handoff-dwell',
              kind: 'cursor-idle',
              startTime: 4.5,
              endTime: 5.5,
              point: { x: 64, y: 36 },
              recordingPoint: { x: 0.4, y: 0.4 },
              data: {},
            },
          ],
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
      }, capturedCursor);
      await page.reload();
      await page
        .getByRole('button', { name: /: Screen$/ })
        .first()
        .click();
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
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      const legacyWorkspace = (await readNativeReviewWorkspace(page, aggregateId))!;
      const legacyContent = replayReviewHistory(
        legacyWorkspace.history,
        legacyWorkspace.cursor,
        legacyWorkspace.source,
        reviewDocumentBaseline(legacyWorkspace)
      ).advancedContent;
      const legacyHistory = [
        ...legacyWorkspace.history.slice(0, legacyWorkspace.cursor),
        {
          id: 'retained-dormant-focus',
          at: Date.now(),
          target: 'advancedContent' as const,
          before: legacyContent,
          after: {
            ...legacyContent,
            zoom: {
              ...legacyContent.zoom,
              regions: [
                ...legacyContent.zoom.regions,
                {
                  ...createQuickEditZoomRegion({
                    id: 'legacy-dormant-focus',
                    at: 0,
                    duration: 12,
                    sourceAnchor: { start: 0, end: 12 },
                  }),
                  dormant: true,
                  linkTo: 'legacy-deleted-target',
                  linkEasing: 'linear',
                  transform: { scale: 4, centerX: 0.9, centerY: 0.9 },
                },
              ],
            },
          },
        },
      ];
      const legacyRow = parseVideoWorkspace({
        ...legacyWorkspace,
        revision: legacyWorkspace.revision + 1,
        history: legacyHistory,
        cursor: legacyHistory.length,
        updatedAt: Date.now(),
      });
      if (!legacyRow) throw new Error('Dormant Gallery fixture is invalid');
      await replaceNativeReviewWorkspace(page, aggregateId, legacyRow);
      await page.reload();
      await page
        .getByRole('button', { name: /: Screen$/ })
        .first()
        .click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
        .click();
      const galleryFocusRow = dialog.locator('[data-ui="cursorFocusPath.timelineKeys"]');
      await galleryFocusRow.dblclick({
        position: { x: ((await galleryFocusRow.boundingBox())!.width * 4.5) / duration, y: 10 },
      });
      const galleryFocus = dialog.locator('[data-ui="cursorFocusPath.inspector"]:visible');
      await galleryFocus.getByRole('textbox', { name: 'X', exact: true }).fill('0.35');
      await galleryFocus.getByRole('textbox', { name: 'X', exact: true }).press('Enter');
      await expect
        .poll(async () => {
          const saved = (await readNativeReviewWorkspace(page, aggregateId))!;
          return replayReviewHistory(
            saved.history,
            saved.cursor,
            saved.source,
            reviewDocumentBaseline(saved)
          ).advancedContent.cursorFocusPath;
        })
        .toMatchObject({
          segments: expect.arrayContaining([
            expect.objectContaining({
              keys: expect.arrayContaining([
                expect.objectContaining({ anchor: 'manual', x: 0.35 }),
              ]),
            }),
          ]),
        });
      const authoredWorkspace = (await readNativeReviewWorkspace(page, aggregateId))!;
      const authoredCursorKey = replayReviewHistory(
        authoredWorkspace.history,
        authoredWorkspace.cursor,
        authoredWorkspace.source,
        reviewDocumentBaseline(authoredWorkspace)
      )
        .advancedContent.cursorFocusPath!.segments.flatMap((segment) => segment.keys)
        .find((key) => key.anchor === 'manual' && key.x === 0.35)!;
      // Pointer placement has one CSS-pixel tolerance; transfer preserves its exact source time.
      expect(Math.abs(authoredCursorKey.time - 4.5)).toBeLessThan(
        duration / (await galleryFocusRow.boundingBox())!.width
      );
      await page.screenshot({
        path: info.outputPath('gallery-authored-cursor.png'),
        fullPage: false,
      });
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.trackSettings'), exact: true })
        .click();
      const webcamSwitch = dialog
        .locator('[data-review-header-track="webcam"]')
        .getByRole('switch');
      await webcamSwitch.click();
      await expect(webcamSwitch).toHaveAttribute('aria-checked', 'true');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.trackSettings'), exact: true })
        .click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.webcamSettings'), exact: true })
        .click();
      const galleryCamera = dialog.locator('[data-ui="gallery.videoReview.webcamInspector"]');
      await expect(galleryCamera).toBeVisible();
      const cameraSection = async (key: Parameters<typeof translate>[0]) => {
        const category = galleryCamera
          .locator('[data-ui="gallery.videoReview.inspectorCategories"] nav')
          .getByRole('button', { name: label(key), exact: true });
        if (await category.count()) await category.click();
      };
      await cameraSection('gallery.videoReview.webcamLayout');
      await chooseInspectorValue(
        page,
        galleryCamera,
        label('gallery.videoReview.webcamPlacement'),
        label('gallery.videoReview.webcamPlacement_top-left')
      );
      const galleryZoom = galleryCamera.getByRole('textbox', {
        name: label('videoEditor.sidebar.cameraCropZoom'),
        exact: true,
      });
      await galleryZoom.fill('1.5');
      await galleryZoom.press('Enter');
      await cameraSection('gallery.videoReview.webcamAppearance');
      const galleryMirror = galleryCamera.getByRole('switch', {
        name: label('gallery.videoReview.webcamMirror'),
        exact: true,
      });
      await galleryMirror.click();
      await expect(galleryMirror).toHaveAttribute('aria-checked', 'true');
      await cameraSection('gallery.videoReview.webcamTiming');
      const galleryOffset = galleryCamera.getByRole('textbox', {
        name: label('gallery.videoReview.webcamOffset'),
        exact: true,
      });
      const authoredOffset = index === 0 ? 0.5 : -0.5;
      await galleryOffset.fill(String(authoredOffset));
      await galleryOffset.press('Enter');
      await dialog
        .locator('video')
        .first()
        .evaluate((video) => {
          video.currentTime = 5;
        });
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.webcamAddPosition'), exact: true })
        .click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.webcamPosition"]')).toHaveCount(1);
      const cameraLane = dialog.locator('[data-ui="gallery.videoReview.webcamTrack"]');
      await cameraLane.scrollIntoViewIfNeeded();
      const cameraLaneBox = (await cameraLane.boundingBox())!;
      await page.mouse.move(
        cameraLaneBox.x + (cameraLaneBox.width * 8) / duration,
        cameraLaneBox.y + cameraLaneBox.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        cameraLaneBox.x + (cameraLaneBox.width * 9) / duration,
        cameraLaneBox.y + cameraLaneBox.height / 2,
        { steps: 6 }
      );
      await page.mouse.up();
      await expect(
        cameraLane.getByRole('button', { name: label('gallery.videoReview.webcamHidden') })
      ).toHaveCount(1);
      await page.screenshot({
        path: info.outputPath('gallery-authored-camera.png'),
        fullPage: false,
      });
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
      const readAuthoredScene = async () => {
        const workspace = await readNativeReviewWorkspace(page, aggregateId);
        return workspace
          ? replayReviewHistory(
              workspace.history,
              workspace.cursor,
              workspace.source,
              reviewDocumentBaseline(workspace)
            ).advancedContent
          : undefined;
      };
      const backgroundUpload = await solidImageUpload(
        page,
        'Transferred background.png',
        '#2050a0',
        32,
        32
      );
      await chooseInspectorValue(
        page,
        inspector.locator('.review-background-kinds'),
        label('gallery.videoReview.background'),
        label('gallery.videoReview.backgroundImage')
      );
      await inspector
        .locator('[data-ui="gallery.videoReview.backgroundInspector"] input[type="file"]')
        .setInputFiles(backgroundUpload);
      await expect
        .poll(async () => (await readAuthoredScene())?.background)
        .toMatchObject({ enabled: true, type: 'image' });
      if (index === 1) {
        await chooseInspectorValue(
          page,
          inspector.locator('.review-background-kinds'),
          label('gallery.videoReview.background'),
          label('gallery.videoReview.backgroundSolid')
        );
      }
      await sceneGroup('gallery.videoReview.watermark');
      const galleryWatermark = inspector.locator(
        '[data-ui="gallery.videoReview.watermarkInspector"]'
      );
      await chooseInspectorValue(
        page,
        galleryWatermark,
        label('gallery.videoReview.watermark'),
        label('gallery.videoReview.watermarkImage')
      );
      const logoUpload = await solidImageUpload(page, 'Transferred logo.png', '#e02030', 32, 16);
      await galleryWatermark.locator('input[type="file"]').setInputFiles(logoUpload);
      await expect
        .poll(async () => (await readAuthoredScene())?.watermark?.image)
        .toMatchObject({ width: 32, height: 16 });
      const galleryLogoSize = galleryWatermark.getByRole('textbox', {
        name: label('gallery.videoReview.watermarkSize'),
        exact: true,
      });
      await galleryLogoSize.fill('30');
      await galleryLogoSize.press('Enter');
      await galleryWatermark
        .locator('[data-ui="watermark.anchors"]')
        .getByRole('button', {
          name: label('gallery.videoReview.watermarkAnchor_bottom-right'),
          exact: true,
        })
        .click();
      if (index === 1) {
        await chooseInspectorValue(
          page,
          galleryWatermark,
          label('gallery.videoReview.watermark'),
          label('gallery.videoReview.watermarkText')
        );
        const text = galleryWatermark.getByRole('textbox', {
          name: label('gallery.videoReview.watermarkText'),
          exact: true,
        });
        await text.fill('Saved branded text');
        await text.press('Enter');
      }
      await page.screenshot({
        path: info.outputPath('gallery-authored-scene.png'),
        fullPage: false,
      });
      await plane.focus();
      await page.keyboard.press('Home');
      await expect
        .poll(async () => Number(await plane.getAttribute('aria-valuenow')))
        .toBeCloseTo(0, 3);
      await addReviewFocus(page);
      const galleryMotion = dialog.locator('[data-ui="gallery.videoReview.zoomInspector"]');
      await expect(galleryMotion).toBeVisible();
      await chooseInspectorValue(
        page,
        galleryMotion,
        label('videoEditor.sidebar.cursorFocusMode'),
        label(
          index === 0
            ? 'videoEditor.sidebar.cursorFocusFixed'
            : 'videoEditor.sidebar.cursorFocusFollow'
        )
      );
      const focusRuler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
      for (const sourceTime of [4, 8]) {
        await focusRuler.scrollIntoViewIfNeeded();
        const focusRulerBox = (await focusRuler.boundingBox())!;
        const focusDuration = Number(await plane.getAttribute('aria-valuemax'));
        await page.mouse.click(
          focusRulerBox.x + (focusRulerBox.width * sourceTime) / focusDuration,
          focusRulerBox.y + 12
        );
        await addReviewFocus(page);
        await chooseInspectorValue(
          page,
          galleryMotion,
          label('videoEditor.sidebar.cursorFocusMode'),
          label(
            index === 0
              ? 'videoEditor.sidebar.cursorFocusFixed'
              : 'videoEditor.sidebar.cursorFocusFollow'
          )
        );
      }
      const galleryLink = dialog.locator('[data-ui="gallery.videoReview.zoomLink"]');
      await expect(galleryLink).toHaveCount(1);
      await galleryLink.click();
      await expect(galleryLink).toHaveAttribute('data-connected', 'true');
      for (const [typeKey, kind] of [
        ['gallery.videoReview.focusBorder', 'border'],
        ['gallery.videoReview.focusSpotlight', 'spotlight'],
      ] as const) {
        await plane.focus();
        await page.keyboard.press('Home');
        await dialog
          .getByRole('button', { name: label('gallery.videoReview.focusRangeTool'), exact: true })
          .click();
        await dialog
          .locator('[data-ui="gallery.videoReview.editingTools"]')
          .getByRole('button', { name: label('gallery.videoReview.focusType'), exact: true })
          .click();
        await page.getByRole('option', { name: label(typeKey), exact: true }).click();
        await addReviewFocus(page);
        const authored = (await readAuthoredScene())!.zoom.regions.find((region) => region[kind])!;
        const block = dialog.locator(`[data-review-removal-key="focus:${authored.id}"]`);
        const end = block.locator('[data-zoom-edge="end"]');
        await end.scrollIntoViewIfNeeded();
        const edge = (await end.boundingBox())!;
        const row = await block.evaluate((element) => {
          const rect = element.parentElement!.getBoundingClientRect();
          return { x: rect.x, width: rect.width };
        });
        const sourceDuration = Number(await plane.getAttribute('aria-valuemax'));
        await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          edge.x +
            edge.width / 2 +
            (row.width * (0.5 - (authored.sourceAnchor?.end ?? authored.end))) / sourceDuration,
          edge.y + edge.height / 2,
          { steps: 8 }
        );
        await page.mouse.up();
        await expect
          .poll(async () =>
            Math.abs(
              ((await readAuthoredScene())!.zoom.regions.find((region) => region.id === authored.id)
                ?.sourceAnchor?.end ?? -1) - 0.5
            )
          )
          .toBeLessThanOrEqual(sourceDuration / row.width + 1e-6);
      }
      await page.screenshot({
        path: info.outputPath('gallery-authored-motion.png'),
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
        type: index === 0 ? 'image' : 'solid',
        zoomBehavior: 'window',
        layout: { padding: 8, cornerRadius: 6, shadow: { intensity: 60 } },
      });
      expect(document.advancedContent.zoom.regions).toHaveLength(6);
      expect(document.advancedContent.zoom.regions.some((region) => region.linkTo)).toBe(true);
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
      const passiveMotion = migrated.motionRegions!.filter(
        (region) => region.sourceBinding?.dormant
      );
      expect(passiveMotion.length).toBeGreaterThan(0);
      for (const region of passiveMotion) {
        expect(region).toMatchObject({
          duration: 0,
          scale: 4,
          sourceBinding: {
            dormant: true,
            sourceStart: 0,
            sourceEnd: 12,
            unresolvedLinkTo: 'legacy-deleted-target',
          },
          phaseTransitions: { link: 'LINEAR' },
        });
        await expect(page.locator(`[data-timeline-effect-segment="${region.id}"]`)).toHaveCount(0);
      }
      const importedMotion = migrated.motionRegions!.find((region) => region.duration > 0)!;
      expect(importedMotion).toMatchObject({
        focusMode: index === 0 ? 'MANUAL' : 'CURSOR',
        sourceBinding: { coordinateSpace: 'source-window' },
      });
      const motionSegment = page.locator(`[data-timeline-effect-segment="${importedMotion.id}"]`);
      await motionSegment.scrollIntoViewIfNeeded();
      await motionSegment
        .getByRole('button', {
          name: `${label('videoEditor.timeline.motionSegment')} · ${importedMotion.scale.toFixed(2)}x`,
          exact: true,
        })
        .click();
      await page
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupFraming'),
          exact: true,
        })
        .click();
      const motionControls = page.locator('[data-video-editor-motion-controls]');
      await expect(motionControls.locator('[data-video-editor-local-navigation]')).toBeEnabled();
      await chooseInspectorValue(
        page,
        motionControls,
        label('videoEditor.sidebar.motionCoverage'),
        label('videoEditor.sidebar.spotlightCoverageScene')
      );
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.motionRegions?.find(
              (region) => region.id === importedMotion.id
            )?.sourceBinding?.coordinateSpace
        )
        .toBeUndefined();
      await chooseInspectorValue(
        page,
        motionControls,
        label('videoEditor.sidebar.motionCoverage'),
        label('videoEditor.sidebar.spotlightCoverageWindow')
      );
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.motionRegions?.find(
              (region) => region.id === importedMotion.id
            )?.sourceBinding?.coordinateSpace
        )
        .toBe('source-window');
      await checkInspectorPaintedFont(
        page,
        motionControls.getByRole('button', {
          name: label('videoEditor.sidebar.spotlightCoverageWindow'),
          exact: true,
        }),
        'motion-coverage'
      );
      await page.screenshot({
        path: info.outputPath('native-imported-motion.png'),
        fullPage: false,
      });

      const importedWindowId = importedMotion.sourceBinding!.clipId;
      for (const rotation of [30, 0]) {
        await page.locator(`[data-project-timeline-clip="${importedWindowId}"]`).click();
        await page
          .locator('nav')
          .getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupTransform'),
            exact: true,
          })
          .click();
        const rotationField = page.getByRole('textbox', {
          name: label('videoEditor.sidebar.rotationLabel'),
          exact: true,
        });
        await rotationField.fill(String(rotation));
        await rotationField.press('Tab');
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))?.clips.find(
                (clip) => clip.id === importedWindowId
              )?.transform.rotation
          )
          .toBe(rotation);
        if (rotation !== 0) {
          await checkInspectorPaintedFont(page, rotationField, 'window-rotation');
          await motionSegment
            .getByRole('button', {
              name: `${label('videoEditor.timeline.motionSegment')} · ${importedMotion.scale.toFixed(2)}x`,
              exact: true,
            })
            .click();
          await page
            .locator('nav')
            .getByRole('button', {
              name: label('videoEditor.sidebar.inspectorGroupFraming'),
              exact: true,
            })
            .click();
          const rotatedPlayhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
          await rotatedPlayhead.press('Home');
          for (let frame = 0; frame < Math.round(migrated.fps * 0.3); frame++)
            await rotatedPlayhead.press('ArrowRight');
          await page.screenshot({
            path: info.outputPath('native-rotated-window-motion.png'),
            fullPage: false,
          });
          const beforeSpatial = (await readNativeVideoProject(page))!.motionRegions!.find(
            (region) => region.id === importedMotion.id
          )!;
          let spatialUndo = 0;
          if (beforeSpatial.focusMode !== 'MANUAL') {
            await chooseInspectorValue(
              page,
              motionControls,
              label('videoEditor.sidebar.motionFocusLabel'),
              label('videoEditor.sidebar.motionFocusManual')
            );
            spatialUndo++;
          }
          const stageCanvas = page.locator('[data-preview-stage-canvas]');
          const stagePixels = () =>
            stageCanvas.evaluate(async (node: HTMLCanvasElement) => {
              const pixels = node
                .getContext('2d')!
                .getImageData(0, 0, node.width, node.height).data;
              const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(pixels));
              return Array.from(new Uint8Array(hash), (byte) =>
                byte.toString(16).padStart(2, '0')
              ).join('');
            });
          await page
            .locator('nav')
            .getByRole('button', { name: label('gallery.videoReview.perspective'), exact: true })
            .click();
          const perspective = page.locator('[data-ui="video-editor.motion.perspective"]');
          if (!beforeSpatial.perspective?.enabled) {
            await perspective
              .getByRole('switch', {
                name: label('gallery.videoReview.spatialEnabled'),
                exact: true,
              })
              .click();
            spatialUndo++;
          }
          const tilt = perspective.getByRole('textbox', {
            name: label('gallery.videoReview.perspectiveY'),
            exact: true,
          });
          const beforeTilt = await stagePixels();
          const tiltValue = beforeSpatial.perspective?.rotateY === 35 ? 20 : 35;
          await tilt.fill(String(tiltValue));
          await tilt.press('Tab');
          spatialUndo++;
          await expect
            .poll(
              async () =>
                (await readNativeVideoProject(page))!.motionRegions!.find(
                  (region) => region.id === importedMotion.id
                )!.perspective?.rotateY
            )
            .toBe(tiltValue);
          await expect.poll(stagePixels).not.toBe(beforeTilt);
          await checkInspectorPaintedFont(page, tilt, 'rotated-perspective-input');
          const spatialProject = (await readNativeVideoProject(page))!;
          expect(
            resolveVideoCompositionFrame(spatialProject, 0.3).camera.spatial?.planeTransform
          ).toBeDefined();
          await page.screenshot({
            path: info.outputPath('native-rotated-window-perspective.png'),
            fullPage: false,
          });
          await page
            .locator('nav')
            .getByRole('button', { name: label('gallery.videoReview.depthOfField'), exact: true })
            .click();
          const depth = page.locator('[data-ui="video-editor.motion.depth"]');
          if (!beforeSpatial.depthOfField?.enabled) {
            const beforeDepth = await stagePixels();
            await depth
              .getByRole('switch', {
                name: label('gallery.videoReview.spatialEnabled'),
                exact: true,
              })
              .click();
            spatialUndo++;
            await expect.poll(stagePixels).not.toBe(beforeDepth);
          }
          await page.screenshot({
            path: info.outputPath('native-rotated-window-depth.png'),
            fullPage: false,
          });
          for (let undo = 0; undo < spatialUndo; undo++)
            await page
              .getByRole('button', {
                name: `${label('videoEditor.app.undo')} (${label('videoEditor.app.undoShortcut')})`,
                exact: true,
              })
              .click();
          await expect
            .poll(async () =>
              (await readNativeVideoProject(page))!.motionRegions!.find(
                (region) => region.id === importedMotion.id
              )
            )
            .toEqual(beforeSpatial);
          await page
            .locator('nav')
            .getByRole('button', {
              name: label('videoEditor.sidebar.inspectorGroupFraming'),
              exact: true,
            })
            .click();
          const beforeArea = (await readNativeVideoProject(page))!.motionRegions!.find(
            (region) => region.id === importedMotion.id
          )!;
          await chooseInspectorValue(
            page,
            motionControls,
            label('videoEditor.sidebar.motionFocusLabel'),
            label('videoEditor.sidebar.motionFocusManualArea')
          );
          const areaPreview = motionControls.locator('[data-video-editor-local-navigation]');
          await expect(areaPreview).toBeEnabled();
          await expect
            .poll(async () =>
              areaPreview.evaluate((preview) => {
                const bounds = preview.getBoundingClientRect();
                const handles = [...preview.querySelectorAll('[data-framing-corner]')];
                return (
                  handles.length === 4 &&
                  handles.every((handle) => {
                    const rect = handle.getBoundingClientRect();
                    return (
                      rect.left >= bounds.left + 1 &&
                      rect.top >= bounds.top + 1 &&
                      rect.right <= bounds.right - 1 &&
                      rect.bottom <= bounds.bottom - 1
                    );
                  })
                );
              })
            )
            .toBe(true);
          const corner = areaPreview.locator('[data-framing-corner="se"]');
          await corner.scrollIntoViewIfNeeded();
          const areaBeforeDrag = (await readNativeVideoProject(page))!.motionRegions!.find(
            (region) => region.id === importedMotion.id
          )!.focusArea!;
          const cornerBox = (await corner.boundingBox())!;
          await page.mouse.move(
            cornerBox.x + cornerBox.width / 2,
            cornerBox.y + cornerBox.height / 2
          );
          await page.mouse.down();
          await page.mouse.move(
            cornerBox.x + cornerBox.width / 2 + 6,
            cornerBox.y + cornerBox.height / 2 + 3,
            { steps: 4 }
          );
          await page.mouse.up();
          await expect
            .poll(
              async () =>
                (await readNativeVideoProject(page))!.motionRegions!.find(
                  (region) => region.id === importedMotion.id
                )!.focusArea
            )
            .not.toEqual(areaBeforeDrag);
          await expect(page.locator('polygon[data-preview-stage-area-body="true"]')).toBeVisible();
          await expect(areaPreview.locator('[data-framing-area-outline]')).toBeVisible();
          await page.screenshot({
            path: info.outputPath('native-rotated-window-area.png'),
            fullPage: false,
          });
          const areaProject = (await readNativeVideoProject(page))!;
          const areaRegion = areaProject.motionRegions!.find(
            (region) => region.id === importedMotion.id
          )!;
          const areaCorners = motionWindowAreaPoints(
            areaProject,
            areaRegion,
            areaRegion.focusArea!,
            0.3
          );
          const assertAreaCorners = async () => {
            const project = (await readNativeVideoProject(page))!;
            const region = project.motionRegions!.find((item) => item.id === importedMotion.id)!;
            const corners = motionWindowAreaPoints(project, region, region.focusArea!, 0.3);
            for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
              expect(corners[corner].x).toBeCloseTo(areaCorners[corner].x, 6);
              expect(corners[corner].y).toBeCloseTo(areaCorners[corner].y, 6);
            }
          };
          for (const coverage of ['scene', 'window'] as const) {
            await chooseInspectorValue(
              page,
              motionControls,
              label('videoEditor.sidebar.motionCoverage'),
              label(
                coverage === 'scene'
                  ? 'videoEditor.sidebar.spotlightCoverageScene'
                  : 'videoEditor.sidebar.spotlightCoverageWindow'
              )
            );
            await expect
              .poll(
                async () =>
                  (await readNativeVideoProject(page))!.motionRegions!.find(
                    (region) => region.id === importedMotion.id
                  )!.sourceBinding?.coordinateSpace
              )
              .toBe(coverage === 'window' ? 'source-window' : undefined);
            await assertAreaCorners();
          }
          await page
            .locator('nav')
            .getByRole('button', {
              name: label('videoEditor.sidebar.inspectorGroupTiming'),
              exact: true,
            })
            .click();
          await chooseInspectorValue(
            page,
            motionControls,
            label('videoEditor.sidebar.framingBinding'),
            label('videoEditor.sidebar.framingBindingScene')
          );
          await expect
            .poll(
              async () =>
                (await readNativeVideoProject(page))!.motionRegions!.find(
                  (region) => region.id === importedMotion.id
                )!.sourceBinding
            )
            .toBeUndefined();
          await assertAreaCorners();
          await page
            .locator('nav')
            .getByRole('button', {
              name: label('videoEditor.sidebar.inspectorGroupFraming'),
              exact: true,
            })
            .click();
          await expect(motionControls.locator('[data-framing-area-outline]')).toBeVisible();
          await page.screenshot({
            path: info.outputPath('native-detached-rotated-area.png'),
            fullPage: false,
          });
          for (let undo = 0; undo < 5; undo++) {
            await page
              .getByRole('button', {
                name: `${label('videoEditor.app.undo')} (${label('videoEditor.app.undoShortcut')})`,
                exact: true,
              })
              .click();
          }
          await expect
            .poll(async () =>
              (await readNativeVideoProject(page))!.motionRegions!.find(
                (region) => region.id === importedMotion.id
              )
            )
            .toEqual(beforeArea);
        }
      }

      const linkedMotion = migrated.motionRegions!.find((region) => region.incomingConnection)!;
      const nativeLink = page.locator(
        `button[data-ui="video-editor.timeline.framing-connection"][data-framing-destination="${linkedMotion.id}"]`
      );
      await nativeLink.scrollIntoViewIfNeeded();
      await nativeLink.click();
      await chooseInspectorValue(
        page,
        page.locator('body'),
        label('videoEditor.sidebar.motionEasingLabel'),
        label('videoEditor.sidebar.temporalEasingLinear')
      );
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.motionRegions?.find(
              (region) => region.id === linkedMotion.id
            )?.incomingConnection?.easing
        )
        .toBe('LINEAR');
      const linkedSourceId = linkedMotion.incomingConnection!.fromRegionId;
      await page
        .getByRole('button', { name: label('videoEditor.timeline.disconnectFraming'), exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))!.motionRegions!.find(
              (region) => region.id === linkedMotion.id
            )?.incomingConnection
        )
        .toBeUndefined();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))!.motionRegions!.find(
              (region) => region.id === linkedSourceId
            )?.phaseTransitions?.link
        )
        .toBe('LINEAR');
      const reconnect = page.locator(
        `[data-ui="video-editor.timeline.framing-connection"][data-framing-destination="${linkedMotion.id}"]`
      );
      await reconnect.scrollIntoViewIfNeeded();
      await reconnect.hover();
      await reconnect
        .getByRole('button', { name: label('videoEditor.timeline.connectFraming'), exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))!.motionRegions!.find(
              (region) => region.id === linkedMotion.id
            )?.incomingConnection?.easing
        )
        .toBe('LINEAR');
      await page.screenshot({
        path: info.outputPath('native-reconnected-motion-link.png'),
        fullPage: false,
      });
      await chooseInspectorValue(
        page,
        page.locator('body'),
        label('videoEditor.sidebar.motionEasingLabel'),
        label('videoEditor.sidebar.temporalEasingEaseInOut')
      );
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.motionRegions?.find(
              (region) => region.id === linkedMotion.id
            )?.incomingConnection?.easing
        )
        .toBe('EASE_IN_OUT');
      await checkInspectorPaintedFont(
        page,
        page.getByText(label('videoEditor.sidebar.motionEasingLabel'), { exact: true }),
        'motion-link-curve'
      );
      await page.screenshot({
        path: info.outputPath('native-imported-motion-link.png'),
        fullPage: false,
      });

      for (const kind of ['border', 'spotlight'] as const) {
        const appearance = migrated.motionRegions!.find((region) => region[kind])!;
        expect(appearance.sourceBinding?.coordinateSpace).toBe('source-window');
        const segment = page.locator(`[data-timeline-effect-segment="${appearance.id}"]`);
        await segment.scrollIntoViewIfNeeded();
        await segment
          .getByRole('button', {
            name: label(
              kind === 'border'
                ? 'gallery.videoReview.focusBorder'
                : 'gallery.videoReview.focusSpotlight'
            ),
            exact: true,
          })
          .click();
        await page
          .locator('nav')
          .getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupAppearance'),
            exact: true,
          })
          .click();
        const fieldKey =
          kind === 'border'
            ? 'gallery.videoReview.borderWidth'
            : 'gallery.videoReview.focusStrength';
        const field = page.getByRole('textbox', { name: label(fieldKey), exact: true });
        await field.fill(kind === 'border' ? '5' : '40');
        await field.press('Enter');
        await expect
          .poll(async () => {
            const current = (await readNativeVideoProject(page))!.motionRegions!.find(
              (region) => region.id === appearance.id
            )!;
            return kind === 'border' ? current.border?.width : current.spotlight?.strength;
          })
          .toBe(kind === 'border' ? 5 : 0.4);
        if (kind === 'border') {
          await page
            .locator('nav')
            .getByRole('button', {
              name: label('videoEditor.sidebar.inspectorGroupAnimation'),
              exact: true,
            })
            .click();
          for (const [phaseKey, revealKey] of [
            ['gallery.videoReview.zoomTransitionIn', 'gallery.videoReview.borderAppear'],
            ['gallery.videoReview.zoomTransitionOut', 'gallery.videoReview.borderDisappear'],
          ] as const) {
            await chooseInspectorValue(
              page,
              page.getByRole('group', { name: label(phaseKey), exact: true }),
              label('gallery.videoReview.focusReveal'),
              label(revealKey)
            );
          }
          await expect
            .poll(
              async () =>
                (await readNativeVideoProject(page))!.motionRegions!.find(
                  (region) => region.id === appearance.id
                )!.phaseTransitions
            )
            .toMatchObject({ enter: 'none', exit: 'none' });
          await page
            .locator('nav')
            .getByRole('button', {
              name: label('videoEditor.sidebar.inspectorGroupAppearance'),
              exact: true,
            })
            .click();
        }
        const appearancePlayhead = page.locator(
          '[data-ui="video-editor.timeline.playhead-handle"]'
        );
        await appearancePlayhead.press('Home');
        for (let frame = 0; frame < Math.round(migrated.fps * 0.3); frame++)
          await appearancePlayhead.press('ArrowRight');
        await checkInspectorPaintedFont(
          page,
          page.getByRole('textbox', { name: label(fieldKey), exact: true }),
          `motion-${kind}-appearance`
        );
        await page.screenshot({
          path: info.outputPath(`native-imported-${kind}.png`),
          fullPage: false,
        });
      }

      const primaryTrack = migrated.tracks.find((track) => track.isRoot)!;
      const originalVideos = migrated.clips.filter(
        (clip) => clip.type === 'VIDEO' && clip.trackId === primaryTrack.id
      );
      const cursorFacts = migrated.cursorTrack!.sourceObservations!;
      expect(cursorFacts).toHaveLength(1);
      expect(cursorFacts[0]).toMatchObject({
        recordingId: 'beta-v1-recording',
        sourceInstanceId: originalVideos[0]!.sourceInstanceId,
      });
      expect(
        cursorFacts[0]!.samples.map((sample) => ({
          id: sample.id,
          time: sample.time,
          recordingPoint: sample.recordingPoint,
          observation: sample.observation,
          captureSegment: sample.captureSegment,
        }))
      ).toEqual(
        capturedCursor.samples.map((sample) => ({
          id: sample.id,
          time: sample.time,
          recordingPoint: sample.recordingPoint,
          observation: sample.observation,
          captureSegment: sample.captureSegment,
        }))
      );
      expect(migrated.cursorTrack!.skin.hidden).toBe(true);
      const transferredFocusKey = migrated
        .cursorFocusPath!.segments.flatMap((segment) => segment.keys)
        .find((key) => key.anchor === 'manual' && key.time === authoredCursorKey.time)!;
      expect(transferredFocusKey.x).toBe(0.35);
      const nativeFocusKey = page
        .locator(`[data-cursor-focus-key="${transferredFocusKey.id}"]`)
        .first();
      await nativeFocusKey.scrollIntoViewIfNeeded();
      await nativeFocusKey.click();
      await page
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.cursorFocusPathTitle'),
          exact: true,
        })
        .click();
      const nativeFocus = page.locator('[data-ui="cursorFocusPath.inspector"]');
      await expect(nativeFocus.getByRole('textbox', { name: 'X', exact: true })).toHaveValue(
        '0.35'
      );
      await nativeFocus.getByRole('textbox', { name: 'X', exact: true }).fill('0.4');
      await nativeFocus.getByRole('textbox', { name: 'X', exact: true }).press('Enter');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.cursorFocusPath?.segments
              .flatMap((segment) => segment.keys)
              .find((key) => key.id === transferredFocusKey.id)?.x
        )
        .toBe(0.4);
      await checkInspectorPaintedFont(
        page,
        nativeFocus.getByRole('textbox', { name: 'X', exact: true }),
        'cursor-focus-coordinate'
      );
      await page.screenshot({ path: info.outputPath('native-edited-cursor.png'), fullPage: false });
      const cameraTrack = migrated.tracks.find((track) => track.role === 'CAMERA')!;
      expect(cameraTrack).toMatchObject({ visible: true, isRoot: false });
      const cameraClips = migrated.clips.filter(
        (clip) => clip.type === 'VIDEO' && clip.trackId === cameraTrack.id
      );
      expect(cameraClips).toHaveLength(originalVideos.length);
      const authoredCamera = document.advancedContent.webcam!;
      expect(authoredCamera).toMatchObject({
        enabled: true,
        offsetSeconds: authoredOffset,
        mirrored: true,
        appearance: { zoom: 1.5 },
      });
      expect(authoredCamera.positions).toHaveLength(1);
      expect(authoredCamera.hiddenRanges).toHaveLength(1);
      const cameraAsset = migrated.assets.find((asset) => asset.id === cameraClips[0]!.assetId)!;
      expect(cameraAsset).toMatchObject({
        type: 'VIDEO',
        source: {
          kind: 'project-asset',
          projectAssetId: authoredCamera.assetId.slice('project-asset:'.length),
        },
      });
      for (const [slice, clip] of cameraClips.entries()) {
        const primary = originalVideos[slice]!;
        expect(clip).toMatchObject({
          startTime: primary.startTime,
          duration: primary.duration,
          sourceStart: primary.sourceStart,
          sourceDuration: primary.sourceDuration,
          playbackRate: primary.playbackRate ?? 1,
          groupId: primary.groupId,
          assetId: cameraAsset.id,
          muted: true,
          cameraTiming: { offsetSeconds: authoredOffset, transitions: 'bounded' },
          cameraMirrored: authoredCamera.mirrored,
          cameraAppearance: authoredCamera.appearance,
          cameraHiddenRanges: authoredCamera.hiddenRanges,
          transform: {
            x: authoredCamera.placement.x * migrated.width,
            y: authoredCamera.placement.y * migrated.height,
            width: authoredCamera.placement.width * migrated.width,
            height: authoredCamera.placement.height * migrated.height,
          },
        });
        expect(
          clip.cameraPositions?.map((position) => ({
            id: position.id,
            sourceTime: position.sourceTime,
            crop: position.crop,
            transition: position.transition,
          }))
        ).toEqual(
          authoredCamera.positions.map((position) => ({
            id: position.id,
            sourceTime: position.time,
            crop: position.crop,
            transition: {
              kind:
                position.transition.type === 'none'
                  ? 'instant'
                  : position.transition.type === 'ease-in-out'
                    ? 'smooth'
                    : 'shrink',
              duration: position.transition.duration,
            },
          }))
        );
      }
      const cameraCenter = {
        x: (authoredCamera.placement.x + authoredCamera.placement.width / 2) * migrated.width,
        y: (authoredCamera.placement.y + authoredCamera.placement.height / 2) * migrated.height,
      };
      const cameraBytes = (
        await readFile(new URL('../fixtures/review-webcam-clock.webm', import.meta.url))
      ).toString('base64');
      const cameraReference = await webcamVideoPixels(page, cameraBytes, [
        { time: 1 - authoredOffset, x: 0.5, y: 0.5 },
        { time: 5 - authoredOffset, x: 0.5, y: 0.5 },
      ]);
      const cameraPixel = () =>
        page
          .locator('[data-preview-stage-canvas]')
          .evaluate(
            (canvas: HTMLCanvasElement, point) =>
              Array.from(
                canvas
                  .getContext('2d')!
                  .getImageData(
                    Math.round((point.x * canvas.width) / point.width),
                    Math.round((point.y * canvas.height) / point.height),
                    1,
                    1
                  ).data
              ).slice(0, 3),
            { ...cameraCenter, width: migrated.width, height: migrated.height }
          );
      const cameraPlayhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      await cameraPlayhead.press('Home');
      for (let step = 0; step < migrated.fps; step++) await cameraPlayhead.press('ArrowRight');
      await expect
        .poll(async () =>
          Math.max(
            ...(await cameraPixel()).map((value, channel) =>
              Math.abs(value - cameraReference.pixels[0]![channel]!)
            )
          )
        )
        .toBeLessThanOrEqual(10);
      // The second retained slice maps project second 3 to main-source second 5.
      for (let step = 0; step < migrated.fps * 2; step++) await cameraPlayhead.press('ArrowRight');
      await expect
        .poll(async () =>
          Math.max(
            ...(await cameraPixel()).map((value, channel) =>
              Math.abs(value - cameraReference.pixels[1]![channel]!)
            )
          )
        )
        .toBeLessThanOrEqual(10);
      await cameraPlayhead.press('Home');
      for (let step = 0; step < migrated.fps; step++) await cameraPlayhead.press('ArrowRight');
      await page.locator(`[data-project-timeline-clip="${cameraClips[0]!.id}"]`).click();
      const cameraGroup = page.getByRole('button', {
        name: label('videoEditor.sidebar.inspectorGroupCamera'),
        exact: true,
      });
      await cameraGroup.scrollIntoViewIfNeeded();
      await cameraGroup.click();
      const nativeOffset = page
        .locator('[data-ui="video-editor.camera-placement-controls"]')
        .getByRole('textbox', { name: label('gallery.videoReview.webcamOffset'), exact: true });
      await expect(nativeOffset).toHaveValue(String(authoredOffset));
      const editedOffset = authoredOffset / 2;
      await nativeOffset.fill(String(editedOffset));
      await nativeOffset.press('Enter');
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === cameraClips[0]!.id)
        )
        .toMatchObject({ cameraTiming: { offsetSeconds: editedOffset } });
      const cameraStyle = page.getByRole('button', {
        name: label('videoEditor.sidebar.inspectorGroupStyle'),
        exact: true,
      });
      await cameraStyle.scrollIntoViewIfNeeded();
      await cameraStyle.click();
      await chooseInspectorValue(
        page,
        page.locator('[data-ui="video-editor.camera-appearance"]'),
        label('gallery.videoReview.webcamMirror'),
        label('gallery.videoReview.webcamMirrorOff')
      );
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === cameraClips[0]!.id)
        )
        .toMatchObject({ cameraMirrored: false });
      const editedCameraReference = await webcamVideoPixels(page, cameraBytes, [
        { time: 1 - editedOffset, x: 0.5, y: 0.5 },
      ]);
      await expect
        .poll(async () =>
          Math.max(
            ...(await cameraPixel()).map((value, channel) =>
              Math.abs(value - editedCameraReference.pixels[0]![channel]!)
            )
          )
        )
        .toBeLessThanOrEqual(10);
      await page.screenshot({ path: info.outputPath('native-edited-camera.png'), fullPage: false });
      expect(originalVideos).toHaveLength(2);
      expect({ width: migrated.width, height: migrated.height }).toEqual({
        width: output.width,
        height: output.height,
      });
      const backgroundReference =
        scene.background.enabled && scene.background.type === 'image'
          ? scene.background.assetId
          : scene.background.rememberedImage!.assetId;
      const backgroundAsset = migrated.assets.find(
        (asset) =>
          asset.source.kind === 'project-asset' &&
          asset.source.projectAssetId === backgroundReference.slice('project-asset:'.length)
      )!;
      const authoredWatermark = document.advancedContent.watermark!;
      const logoAsset = migrated.assets.find(
        (asset) =>
          asset.source.kind === 'project-asset' &&
          asset.source.projectAssetId ===
            authoredWatermark.image!.assetId.slice('project-asset:'.length)
      )!;
      expect(backgroundAsset).toMatchObject({
        name: label('gallery.videoReview.background'),
        type: 'IMAGE',
        metadata: { width: 32, height: 32 },
      });
      expect(logoAsset).toMatchObject({
        name: label('gallery.videoReview.watermark'),
        type: 'IMAGE',
        metadata: { width: 32, height: 16 },
      });
      expect(migrated.assets.filter((asset) => asset.type === 'IMAGE')).toHaveLength(2);
      expect(migrated.watermark).toEqual({
        ...authoredWatermark,
        image: { ...authoredWatermark.image, assetId: `project-asset:${logoAsset.id}` },
      });
      expect(migrated.watermark?.mode).toBe(index === 0 ? 'image' : 'text');
      expect(migrated.sceneBackground).toMatchObject(
        index === 0
          ? { kind: 'image', assetId: backgroundAsset.id, imageFit: 'cover' }
          : {
              kind: 'solid',
              remembered: {
                image: { kind: 'image', assetId: backgroundAsset.id, imageFit: 'cover' },
              },
            }
      );
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
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      const backgroundGroup = page
        .locator('[data-ui="video-editor.inspector.content"]')
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupBackground'),
          exact: true,
        });
      await backgroundGroup.scrollIntoViewIfNeeded();
      await backgroundGroup.click();
      const nativeBackground = page.locator('[data-ui="video-editor.scene-background"]');
      await chooseInspectorValue(
        page,
        nativeBackground,
        label('videoEditor.sidebar.sceneBackgroundTypeLabel'),
        label('videoEditor.sidebar.sceneBackgroundImage')
      );
      await chooseInspectorValue(
        page,
        nativeBackground,
        label('videoEditor.sidebar.sceneBackgroundImageAssetLabel'),
        backgroundAsset.name
      );
      await chooseInspectorValue(
        page,
        nativeBackground,
        label('videoEditor.sidebar.sceneBackgroundImageFit'),
        label('videoEditor.sidebar.sceneBackgroundImageContain')
      );
      await chooseInspectorValue(
        page,
        nativeBackground,
        label('videoEditor.sidebar.sceneBackgroundImageFit'),
        label('videoEditor.sidebar.sceneBackgroundImageCover')
      );
      const watermarkGroup = page
        .locator('[data-ui="video-editor.inspector.content"]')
        .getByRole('button', {
          name: label('gallery.videoReview.watermark'),
          exact: true,
        });
      await watermarkGroup.scrollIntoViewIfNeeded();
      await watermarkGroup.click();
      const nativeWatermark = page.locator('[data-ui="video-editor.watermark.inspector"]');
      await chooseInspectorValue(
        page,
        nativeWatermark,
        label('gallery.videoReview.watermark'),
        label('gallery.videoReview.watermarkImage')
      );
      const nativeLogoSize = nativeWatermark.getByRole('textbox', {
        name: label('gallery.videoReview.watermarkSize'),
        exact: true,
      });
      await nativeLogoSize.fill('40');
      await nativeLogoSize.press('Enter');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.watermark?.image?.size)
        .toBe(0.4);
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sceneBackground)
        .toMatchObject({ kind: 'image', assetId: backgroundAsset.id, imageFit: 'cover' });
      const scenePlayhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      await scenePlayhead.press('Home');
      // Inspect the unchanged scene after all authored camera intervals and their link.
      for (let step = 0; step < Math.round(migrated.fps * 9); step++)
        await scenePlayhead.press('ArrowRight');
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
              const logo = sample(
                scene.output.width - 1.8 - (scene.output.width * 0.4) / 2,
                scene.output.height - 1.8 - (scene.output.width * 0.4) / 4
              );
              const background = sample(2, scene.output.height / 2);
              return (
                Math.min(...header) > 100 &&
                Math.max(...source) > 100 &&
                Math.max(...source) - Math.min(...source) > 30 &&
                logo[0]! > 200 &&
                logo[1]! < 60 &&
                logo[2]! < 70 &&
                background[2]! > 50 &&
                background[2]! - background[0]! > 30
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
            (await readNativeVideoProject(page))?.clips.filter(
              (clip) => clip.type === 'VIDEO' && clip.trackId === primaryTrack.id
            ).length
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
            (await readNativeVideoProject(page))?.clips.filter(
              (clip) => clip.type === 'VIDEO' && clip.trackId === primaryTrack.id
            ).length
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
      const beforeCameraMode = (await readNativeVideoProject(page))!;
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      await page
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupBackground'),
          exact: true,
        })
        .click();
      const cameraBackground = page.locator('[data-ui="video-editor.scene-background"]');
      await chooseInspectorValue(
        page,
        cameraBackground,
        label('gallery.videoReview.backgroundZoom'),
        label('gallery.videoReview.backgroundZoomContent')
      );
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sceneBackground?.zoomBehavior)
        .toBe('content');
      await checkInspectorPaintedFont(
        page,
        cameraBackground.getByRole('button', {
          name: label('gallery.videoReview.backgroundZoomContent'),
          exact: true,
        }),
        'migrated-project-content-camera'
      );
      if (index === 1) {
        // This authored crop excludes part of the cursor path from the fixed window.
        await motionSegment.scrollIntoViewIfNeeded();
        await motionSegment
          .getByRole('button', {
            name: `${label('videoEditor.timeline.motionSegment')} · ${importedMotion.scale.toFixed(2)}x`,
            exact: true,
          })
          .click();
        await page
          .locator('nav')
          .getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupFraming'),
            exact: true,
          })
          .click();
        await expect(page.locator('[data-ui="video-editor.framing-preview"]')).toContainText(
          label('videoEditor.app.exportCameraConflict')
        );
        await chooseInspectorValue(
          page,
          motionControls,
          label('videoEditor.sidebar.motionFocusLabel'),
          label('videoEditor.sidebar.motionFocusManual')
        );
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))?.motionRegions?.find(
                (region) => region.id === importedMotion.id
              )?.focusMode
          )
          .toBe('MANUAL');
        await expect(page.locator('[data-ui="video-editor.framing-preview"]')).not.toContainText(
          label('videoEditor.app.exportCameraConflict')
        );
      }
      const final = (await readNativeVideoProject(page))!;
      expect(final.version).toBe(37);
      expect(hydrateVideoProject(final).clips).toEqual(hydrateVideoProject(beforeCameraMode).clips);
      await page.screenshot({
        path: info.outputPath('migrated-project-content-camera.png'),
        fullPage: false,
      });
      expect(final.id).toBe(migrated.id);
      const finalPassiveMotion = final.motionRegions!.filter(
        (region) => region.sourceBinding?.dormant
      );
      expect(finalPassiveMotion.length).toBeGreaterThanOrEqual(passiveMotion.length);
      for (const region of finalPassiveMotion)
        expect(region).toMatchObject({
          duration: 0,
          scale: 4,
          sourceBinding: {
            dormant: true,
            sourceStart: 0,
            sourceEnd: 12,
            unresolvedLinkTo: 'legacy-deleted-target',
          },
          phaseTransitions: { link: 'LINEAR' },
        });

      expect(await readNativeReviewWorkspace(page, aggregateId)).toEqual(gallery);
      await page.screenshot({
        path: info.outputPath('migrated-project-effects.png'),
        fullPage: false,
      });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect(await readNativeVideoProject(page)).toEqual(final);
      expect(await readNativeReviewWorkspace(page, aggregateId)).toEqual(gallery);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
      await page
        .locator('[data-gallery-folder="video-project"]')
        .getByRole('button')
        .first()
        .click();
      const galleryProject = page.locator(
        `[data-gallery-keyboard-id="quick-edit-project:${aggregateId}"]`
      );
      await galleryProject
        .getByRole('button', { name: gallery.project!.name, exact: true })
        .first()
        .click();
      await page
        .locator('[data-ui="gallery.preview.lifecycle-actions"]')
        .getByRole('button', { name: label('common.actions.delete'), exact: true })
        .click();
      const deletion = page.locator('[data-ui="gallery.deletion.menu"]');
      await deletion
        .getByRole('menuitem', { name: label('gallery.app.permanentDelete'), exact: true })
        .click();
      await deletion
        .getByRole('menuitem', { name: label('gallery.app.confirmPermanentDelete'), exact: true })
        .click();
      await expect.poll(() => readNativeReviewWorkspace(page, aggregateId)).toBeNull();
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${encodeURIComponent(final.id)}`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect(await readNativeVideoProject(page)).toEqual(final);
      await expect(
        page.locator('button[data-ui="video-editor.timeline.framing-connection"]')
      ).not.toHaveCount(0);
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
      const borderSampleTime = 0.45;
      expect(final.sceneEdges?.intro.duration ?? 0).toBeLessThan(borderSampleTime);
      const borderFrame = resolveVideoCompositionFrame(final, borderSampleTime);
      const borderLayer = borderFrame.visualLayers.find(
        (layer) => layer.kind === 'video' && layer.borders?.length
      );
      if (!borderLayer || borderLayer.kind !== 'video')
        throw new Error('Missing transferred border layer');
      const border = borderLayer.borders![0]!.border;
      const borderMetadata = final.assets.find(
        (asset) => asset.id === borderLayer.clip.assetId
      )!.metadata;
      const originalWindow = getFittedMediaOriginalWindowFrame({
        frame: borderLayer.clip.transform,
        fitMode: borderLayer.clip.fitMode,
        sourceWidth: borderMetadata.width,
        sourceHeight: borderMetadata.height,
        ...(borderLayer.clip.sourceCrop ? { sourceCrop: borderLayer.clip.sourceCrop } : {}),
        ...(borderLayer.clip.windowHeader ? { windowHeader: borderLayer.clip.windowHeader } : {}),
      });
      const stroke = [
        border.area.y * originalWindow.height + border.width / 2,
        (border.area.y + border.area.height) * originalWindow.height - border.width / 2,
      ]
        .map((y) =>
          mapCompositionPointThroughCamera(
            mapCompositionPointThroughSourceContent(final, borderFrame.camera, borderSampleTime, {
              x: originalWindow.x + (border.area.x + border.area.width / 2) * originalWindow.width,
              y: originalWindow.y + y,
            }),
            borderFrame.camera
          )
        )
        .find(
          (point) =>
            point &&
            point.x >= 1 &&
            point.x < final.width - 1 &&
            point.y >= 1 &&
            point.y < final.height - 1
        );
      if (!stroke) throw new Error('Transferred border is outside the output');
      const exported = await encodedNativeVideoSamples(
        page,
        host.origin,
        final,
        index === 0 ? 'WEBM' : 'MP4',
        [
          {
            time: borderSampleTime,
            x: Math.round(stroke.x),
            y: Math.round(stroke.y),
            expected: [255, 136, 0],
          },
          {
            time: 1,
            x: Math.round(cameraCenter.x),
            y: Math.round(cameraCenter.y),
            expected: editedCameraReference.pixels[0]!.slice(0, 3) as [number, number, number],
          },
          {
            time: 1,
            x: Math.round(
              final.width -
                Math.min(final.width, final.height) * final.watermark!.placement.margin -
                (final.width * final.watermark!.image!.size) / 2
            ),
            y: Math.round(
              final.height -
                Math.min(final.width, final.height) * final.watermark!.placement.margin -
                (final.width * final.watermark!.image!.size) / 4
            ),
            expected: [224, 32, 48],
          },
        ]
      );
      expect(exported.size).toBeGreaterThan(0);
      for (const sample of exported.samples) expect(sample.error).toBeLessThanOrEqual(10);
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

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  test(`basic Gallery appearance remains editable after transfer ${viewport.name}`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ ...viewport.size });
    const locale = index === 0 ? 'en' : 'ru',
      theme = index === 0 ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: theme });
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const advanced = dialog.getByRole('button', {
        name: label('gallery.videoReview.advancedEditing'),
        exact: true,
      });
      await advanced.click();
      await expect(advanced).toHaveAttribute('aria-pressed', 'true');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
        .click();
      const inspector = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
      const galleryGroup = async (key: Parameters<typeof translate>[0]) => {
        const category = inspector
          .locator('[data-ui="gallery.videoReview.inspectorCategories"] nav')
          .getByRole('button', { name: label(key), exact: true });
        if (await category.count()) await category.click();
      };
      await galleryGroup('gallery.videoReview.canvas');
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
      await galleryGroup('gallery.videoReview.windowHeader');
      const galleryHeader = inspector.locator('[data-ui="window-header-settings"]');
      await chooseInspectorValue(
        page,
        galleryHeader,
        label('windowHeader.type'),
        label('windowHeader.browser')
      );
      await chooseInspectorValue(
        page,
        galleryHeader,
        label('windowHeader.style'),
        label('windowHeader.macos')
      );
      await chooseInspectorValue(
        page,
        galleryHeader,
        label('windowHeader.theme'),
        label('windowHeader.dark')
      );
      const authoredTitle = 'Retained Gallery header';
      const galleryTitle = galleryHeader.getByRole('textbox', {
        name: label('windowHeader.tabTitle'),
        exact: true,
      });
      await galleryTitle.fill(authoredTitle);
      await galleryTitle.press('Tab');
      await galleryGroup('gallery.videoReview.background');
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.backgroundZoom'),
        label(
          index === 0
            ? 'gallery.videoReview.backgroundZoomWindow'
            : 'gallery.videoReview.backgroundZoomContent'
        )
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
      await chooseInspectorValue(
        page,
        inspector.locator('.review-background-kinds'),
        label('gallery.videoReview.background'),
        label('gallery.videoReview.backgroundImage')
      );
      await inspector
        .locator('[data-ui="gallery.videoReview.backgroundInspector"] input[type="file"]')
        .setInputFiles(await solidImageUpload(page, 'Retained background.png', '#2050a0', 32, 32));
      const backgroundBlur = inspector.getByRole('textbox', {
        name: label('editor.scene.backgroundBlurAmount'),
        exact: true,
      });
      await backgroundBlur.fill('2');
      await backgroundBlur.press('Enter');
      if (index === 1)
        await chooseInspectorValue(
          page,
          inspector.locator('.review-background-kinds'),
          label('gallery.videoReview.background'),
          label('gallery.videoReview.backgroundNone')
        );
      await galleryGroup('gallery.videoReview.watermark');
      const galleryWatermark = inspector.locator(
        '[data-ui="gallery.videoReview.watermarkInspector"]'
      );
      await chooseInspectorValue(
        page,
        galleryWatermark,
        label('gallery.videoReview.watermark'),
        label('gallery.videoReview.watermarkImage')
      );
      await galleryWatermark
        .locator('input[type="file"]')
        .setInputFiles(await solidImageUpload(page, 'Retained watermark.png', '#e02030', 32, 16));
      const logoSize = galleryWatermark.getByRole('textbox', {
        name: label('gallery.videoReview.watermarkSize'),
        exact: true,
      });
      await logoSize.fill('30');
      await logoSize.press('Enter');
      await advanced.click();
      await expect(advanced).toHaveAttribute('aria-pressed', 'false');
      await page.locator('[data-ui="gallery.videoReview.openVideoEditor"]').click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
        )
        .toBe(1);
      const [tab] = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
      const target = new URL(tab!.url!);
      const source = (await readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))!;
      const document = replayReviewHistory(
        source.history,
        source.cursor,
        source.source,
        reviewDocumentBaseline(source)
      );
      const canvas = document.advancedContent.canvas!;
      const crop = fitQuickEditSourceCrop(source.source, canvas, canvas.crop);
      const header = document.advancedContent.windowHeader!;
      expect(header).toMatchObject({
        kind: 'browser',
        style: 'macos',
        theme: 'dark',
        title: authoredTitle,
      });
      expect(source.advanced.ui.mode).toBe('basic');
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}${target.search}`);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const project = (await readNativeVideoProject(page))!;
      expect(project.id).not.toBe(source.aggregateId);
      expect(project.version).toBe(index === 0 ? 36 : 37);
      expect(project.sceneBackground?.zoomBehavior).toBe(index === 0 ? undefined : 'content');
      const video = project.clips.find((clip) => clip.type === 'VIDEO')!;
      expect(video).toMatchObject({ rememberedWindowHeader: header, rememberedSourceCrop: crop });
      expect(video).not.toHaveProperty('sourceCrop');
      expect(video).toMatchObject({
        rememberedWindowLayout: { padding: 8, windowCornerRadius: 6, shadowIntensity: 60 },
      });
      expect(video.shadowIntensity ?? 0).toBe(0);
      expect(project.sceneBackground).toMatchObject({ enabled: false, blur: 2 });
      expect(project.watermarkEnabled).toBe(false);
      expect(project.watermark).toMatchObject({ mode: 'image', image: { size: 0.3 } });
      expect(project.assets.filter((asset) => asset.type === 'IMAGE')).toHaveLength(2);

      expect(project.rememberedCanvas).toEqual({ width: canvas.width, height: canvas.height });
      expect(video).not.toHaveProperty('windowHeader');
      expect({ width: project.width, height: project.height }).toEqual({
        width: source.source.width,
        height: source.source.height,
      });
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      await page
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupCanvas'),
          exact: true,
        })
        .click();
      await chooseInspectorValue(
        page,
        page.locator('[data-ui="video-editor.scene.canvas"]'),
        label('videoEditor.sidebar.canvasResolutionLabel'),
        `${canvas.width} × ${canvas.height}`
      );
      await expect
        .poll(async () => {
          const accepted = await readNativeVideoProject(page);
          return { width: accepted?.width, height: accepted?.height };
        })
        .toEqual({ width: canvas.width, height: canvas.height });
      const select = async () => {
        await page.locator(`[data-project-timeline-clip="${video.id}"]`).click();
        await page
          .locator('nav')
          .getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupFraming'),
            exact: true,
          })
          .click();
      };
      await select();
      const nativeHeader = page.locator('[data-ui="window-header-settings"]');
      await expect(
        nativeHeader.getByRole('textbox', { name: label('windowHeader.tabTitle'), exact: true })
      ).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath('retained-header-disabled.png'),
        fullPage: false,
      });
      await chooseInspectorValue(
        page,
        nativeHeader,
        label('windowHeader.type'),
        label('windowHeader.browser')
      );
      const title = nativeHeader.getByRole('textbox', {
        name: label('windowHeader.tabTitle'),
        exact: true,
      });
      await expect(title).toHaveValue(authoredTitle);
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === video.id)
        )
        .toMatchObject({ windowHeader: header });
      await checkInspectorPaintedFont(page, title, 'input');
      await title.fill('Edited Native header');
      await title.press('Tab');
      await expect
        .poll(async () => {
          const clip = (await readNativeVideoProject(page))?.clips.find(
            (clip) => clip.id === video.id
          );
          return clip && (clip.type === 'VIDEO' || clip.type === 'IMAGE')
            ? clip.windowHeader?.title
            : undefined;
        })
        .toBe('Edited Native header');
      await chooseInspectorValue(
        page,
        nativeHeader,
        label('windowHeader.type'),
        label('windowHeader.none')
      );
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === video.id)
        )
        .toMatchObject({ rememberedWindowHeader: { ...header, title: 'Edited Native header' } });
      const accepted = (await readNativeVideoProject(page))!;
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect(await readNativeVideoProject(page)).toEqual(accepted);
      await select();
      await chooseInspectorValue(
        page,
        nativeHeader,
        label('windowHeader.type'),
        label('windowHeader.browser')
      );
      await expect(title).toHaveValue('Edited Native header');
      await title.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('retained-header-restored.png'),
        fullPage: false,
      });
      await page.getByText(label('videoEditor.sidebar.mediaCrop'), { exact: true }).click();
      const cropControls = page.locator('[data-ui="video-editor.media-crop"]');
      await cropControls
        .getByRole('button', { name: label('gallery.videoReview.sourceCropRestore'), exact: true })
        .click();
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === video.id)
        )
        .toMatchObject({ sourceCrop: crop });
      const restoredCrop = (await readNativeVideoProject(page))!.clips.find(
        (clip) => clip.id === video.id
      )!;
      expect(restoredCrop.transform).toEqual(video.transform);
      await page
        .locator('[data-ui="video-editor.framing-presets"]')
        .getByRole('button', {
          name: label('videoEditor.sidebar.framingWhole'),
          exact: true,
        })
        .click();
      await expect
        .poll(async () => {
          const fitted = (await readNativeVideoProject(page))?.clips.find(
            (clip) => clip.id === video.id
          );
          return fitted?.transform;
        })
        .not.toEqual(video.transform);
      const restoreLayout = page.getByRole('button', {
        name: label('gallery.videoReview.windowLayoutRestore'),
        exact: true,
      });
      if (!(await restoreLayout.isVisible()))
        await page
          .locator('summary')
          .filter({ hasText: label('videoEditor.sidebar.inspectorGroupAppearance') })
          .click();
      await checkInspectorPaintedFont(page, restoreLayout, 'appearance-restore');
      await restoreLayout.click();
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === video.id)
        )
        .toMatchObject({ windowCornerRadius: 6, shadowIntensity: 60 });
      const cropped = (await readNativeVideoProject(page))!;
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect(await readNativeVideoProject(page)).toEqual(cropped);
      await select();
      if (!(await cropControls.isVisible()))
        await page.getByText(label('videoEditor.sidebar.mediaCrop'), { exact: true }).click();
      await cropControls.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('retained-crop-restored.png'),
        fullPage: false,
      });
      const fitted = cropped.clips.find((clip) => clip.id === video.id)!;
      if (fitted.type !== 'VIDEO') throw new Error('Expected transferred video');
      const frame = getFittedMediaWindowFrame({
        frame: fitted.transform,
        fitMode: fitted.fitMode,
        sourceWidth: source.source.width,
        sourceHeight: source.source.height,
        ...(fitted.sourceCrop ? { sourceCrop: fitted.sourceCrop } : {}),
        ...(fitted.windowHeader ? { windowHeader: fitted.windowHeader } : {}),
      });
      expect(frame.x).toBeGreaterThanOrEqual(-0.001);
      expect(frame.y).toBeGreaterThanOrEqual(-0.001);
      expect(frame.x + frame.width).toBeLessThanOrEqual(cropped.width + 0.001);
      expect(frame.y + frame.height).toBeLessThanOrEqual(cropped.height + 0.001);
      const nativeScene = async (key: Parameters<typeof translate>[0]) => {
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
          .click();
        await page
          .locator('nav')
          .getByRole('button', { name: label(key), exact: true })
          .click();
      };
      const background = page.locator('[data-ui="video-editor.scene-background"]');
      const watermark = page.locator('[data-ui="video-editor.watermark.inspector"]');
      const paintCounts = () =>
        page.locator('[data-preview-stage-canvas]').evaluate((node: HTMLCanvasElement) => {
          const data = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
          let blue = 0,
            red = 0,
            opaque = 0;
          for (let offset = 0; offset < data.length; offset += 4) {
            if (data[offset + 3]! < 250) continue;
            opaque++;
            if (
              data[offset]! <= 120 &&
              data[offset + 1]! >= 40 &&
              data[offset + 1]! <= 130 &&
              data[offset + 2]! >= 100 &&
              data[offset + 2]! - data[offset]! >= 30
            )
              blue++;
            if (
              Math.abs(data[offset]! - 224) <= 2 &&
              Math.abs(data[offset + 1]! - 32) <= 2 &&
              Math.abs(data[offset + 2]! - 48) <= 2
            )
              red++;
          }
          return { blue, red, opaque };
        });
      let backgroundBaseline = 0;
      const activateSceneAppearance = async () => {
        await nativeScene('videoEditor.sidebar.inspectorGroupBackground');
        await chooseInspectorValue(
          page,
          background,
          label('videoEditor.sidebar.sceneBackgroundTypeLabel'),
          label('videoEditor.sidebar.sceneBackgroundImage')
        );
        await expect
          .poll(async () => (await paintCounts()).blue)
          .toBeGreaterThan(backgroundBaseline + 20);
        await nativeScene('gallery.videoReview.watermark');
        await chooseInspectorValue(
          page,
          watermark,
          label('gallery.videoReview.watermark'),
          label('gallery.videoReview.watermarkImage')
        );
        await expect.poll(async () => (await paintCounts()).red).toBeGreaterThan(20);
      };
      await nativeScene('videoEditor.sidebar.inspectorGroupBackground');
      await expect(background.getByRole('textbox')).toHaveCount(0);
      await expect.poll(async () => (await paintCounts()).opaque).toBeGreaterThan(100);
      backgroundBaseline = (await paintCounts()).blue;
      await expect.poll(async () => (await paintCounts()).red).toBe(0);
      await page.screenshot({
        path: info.outputPath('retained-scene-disabled.png'),
        fullPage: false,
      });
      await activateSceneAppearance();
      const nativeLogoSize = watermark.getByRole('textbox', {
        name: label('gallery.videoReview.watermarkSize'),
        exact: true,
      });
      await expect(nativeLogoSize).toHaveValue('30');
      await nativeLogoSize.fill('35');
      await nativeLogoSize.press('Enter');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.watermark?.image?.size)
        .toBeCloseTo(0.35, 8);
      await page.screenshot({
        path: info.outputPath('retained-scene-enabled.png'),
        fullPage: false,
      });
      await chooseInspectorValue(
        page,
        watermark,
        label('gallery.videoReview.watermark'),
        label('gallery.videoReview.watermarkNone')
      );
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.watermarkEnabled)
        .toBe(false);
      await expect.poll(async () => (await paintCounts()).red).toBe(0);
      await nativeScene('videoEditor.sidebar.inspectorGroupBackground');
      await chooseInspectorValue(
        page,
        background,
        label('videoEditor.sidebar.sceneBackgroundTypeLabel'),
        label('gallery.videoReview.backgroundNone')
      );
      await expect.poll(async () => (await paintCounts()).blue).toBe(backgroundBaseline);
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sceneBackground?.enabled)
        .toBe(false);
      const disabledScene = (await readNativeVideoProject(page))!;
      expect(disabledScene.watermark).toMatchObject({ mode: 'image', image: { size: 0.35 } });
      expect(disabledScene.sceneBackground).toMatchObject({
        kind: 'image',
        enabled: false,
        blur: 2,
      });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect(await readNativeVideoProject(page)).toEqual(disabledScene);
      const unchanged = (await readNativeReviewWorkspace(page, source.aggregateId))!;
      const original = replayReviewHistory(
        unchanged.history,
        unchanged.cursor,
        unchanged.source,
        reviewDocumentBaseline(unchanged)
      );
      expect(original.advancedContent.windowHeader).toEqual(header);
      expect(original.advancedContent.canvas).toEqual(canvas);
      expect(original.advancedContent).toEqual(document.advancedContent);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
      await page
        .locator('[data-gallery-folder="video-project"]')
        .getByRole('button')
        .first()
        .click();
      await page
        .locator(`[data-gallery-keyboard-id="quick-edit-project:${source.aggregateId}"]`)
        .getByRole('button', { name: source.project!.name, exact: true })
        .first()
        .click();
      await page
        .locator('[data-ui="gallery.preview.lifecycle-actions"]')
        .getByRole('button', { name: label('common.actions.delete'), exact: true })
        .click();
      const deletion = page.locator('[data-ui="gallery.deletion.menu"]');
      await deletion
        .getByRole('menuitem', { name: label('gallery.app.permanentDelete'), exact: true })
        .click();
      await deletion
        .getByRole('menuitem', { name: label('gallery.app.confirmPermanentDelete'), exact: true })
        .click();
      await expect.poll(() => readNativeReviewWorkspace(page, source.aggregateId)).toBeNull();
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${encodeURIComponent(disabledScene.id)}`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect(await readNativeVideoProject(page)).toEqual(disabledScene);
      await activateSceneAppearance();
      await expect(
        watermark.getByRole('textbox', {
          name: label('gallery.videoReview.watermarkSize'),
          exact: true,
        })
      ).toHaveValue('35');
      await page.screenshot({
        path: info.outputPath('retained-scene-after-source-deletion.png'),
        fullPage: false,
      });
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
