import {
  applyCameraPolicyBootstrap,
  openGalleryCursorScene,
  readReviewContent,
  verifyGalleryCameraPolicy,
  verifyMontageCameraPolicy,
} from '../support/cursor-camera-policy-proof';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { parseCursorFocusPath } from '../../../../apps/extension/src/features/video/project/cursor-focus-path/validation';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoProjectCursorTrack } from '../../../../apps/extension/src/features/video/project/defaults';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

const samples = Array.from({ length: 481 }, (_, index) => {
  const progress = ((Math.floor(index / 2) * 2) / 480) ** 2;
  return {
    id: `focus-sample:${index}`,
    time: index * 0.025,
    x: (0.2 + 0.6 * progress) * 160,
    y: (0.3 + 0.4 * progress) * 90,
    visible: true,
    observation: 'observed' as const,
    captureSegment: 0,
    recordingPoint: { x: 0.2 + 0.6 * progress, y: 0.3 + 0.4 * progress },
  };
});

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`Gallery capture availability on empty history ${viewport.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const server = await startHostServer();
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': 'en',
          'sniptale-theme-preference': 'light',
        },
      });
      await page.addInitScript(() =>
        localStorage.setItem(
          'sniptale-locale-preference',
          new URL(location.href).searchParams.get('locale') === 'ru' ? 'ru' : 'en'
        )
      );
      await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}?theme=light`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 160,
        height: 90,
        duration: 12.01,
      });
      for (const pointer of ['available', 'unavailable', 'unknown'] as const) {
        await page.evaluate(
          async ({ fixture, pointer }) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const request = indexedDB.open(fixture.databaseName);
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            const tx = db.transaction('recording_telemetry', 'readwrite');
            const done = new Promise<void>((resolve, reject) => {
              tx.oncomplete = () => resolve();
              tx.onabort = () => reject(tx.error);
            });
            tx.objectStore('recording_telemetry').put({
              recordingId: fixture.records.recordings[0]!.id,
              captureMode: 'TAB',
              createdAt: 1,
              updatedAt: 1,
              viewport: null,
              cursorTrack: null,
              actionEvents: [],
              signals: [],
              capabilities: {
                version: 1,
                pointer,
                keyboard: 'available',
                wheel: 'available',
                coverage: 'document',
              },
            });
            await done;
            db.close();
          },
          { fixture: betaV1Fixture, pointer }
        );
        await page.reload();
        await page
          .locator(`[data-gallery-keyboard-id="${betaV1Fixture.records.media_library[0]!.id}"]`)
          .getByRole('button', { name: 'beta-v1.webm', exact: true })
          .first()
          .click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
        const dialog = page.locator('dialog');
        const advanced = dialog.getByRole('button', {
          name: translate('gallery.videoReview.advancedEditing', 'en'),
          exact: true,
        });
        if ((await advanced.getAttribute('aria-pressed')) !== 'true') await advanced.click();
        const rows = dialog.locator(
          '[data-ui="gallery.videoReview.historyStrip"] [data-history-family]'
        );
        await expect(rows).toHaveCount(0);
        await expect(dialog.locator('[data-ui="gallery.videoReview.historyStrip"]')).toHaveCSS(
          'height',
          '20px'
        );
        const key =
          pointer === 'available'
            ? 'gallery.videoReview.historyCaptureEmpty'
            : pointer === 'unavailable'
              ? 'gallery.videoReview.historyCaptureUnavailable'
              : 'gallery.videoReview.historyCaptureUnknown';
        await dialog
          .getByRole('button', {
            name: translate('gallery.videoReview.historyOpen', 'en'),
            exact: true,
          })
          .click();
        const inspectorRow = dialog.locator(
          '[data-ui="gallery.videoReview.historyCoverage"] [data-history-coverage-family="cursor"]'
        );
        await expect(inspectorRow).toContainText(translate(key, 'en'));
        await page.screenshot({
          path: info.outputPath(`gallery-capture-${pointer}.png`),
          fullPage: false,
        });
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
  { width: 1200, height: 560 },
]) {
  test(`Gallery authored Cursor Path transactions and reopen ${viewport.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const server = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    const recordingId = betaV1Fixture.records.recordings[0]!.id;
    try {
      await applyCameraPolicyBootstrap(page, { preserveMediaLibrary: true, storage: {} });
      await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}?theme=light`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 160,
        height: 90,
        duration: 12.01,
      });
      await seedCursor(page);
      await page.reload();
      const dialog = await openGalleryCursorScene(page);
      await expect(
        dialog.locator(
          '[data-history-family="cursor"] [data-ui="gallery.videoReview.historyCluster"]'
        )
      ).toHaveCount(0);
      await expect(dialog.locator('[data-history-family="cursor"] > button')).toHaveCount(3);
      const sparseRow = dialog.locator('[data-ui="cursorFocusPath.timelineKeys"]');
      await expect(sparseRow).toBeVisible();
      expect(
        await sparseRow.locator('[data-cursor-focus-key], [data-cursor-focus-group]').count()
      ).toBeLessThanOrEqual(8);
      await expect(dialog.locator('[data-ui="cursorFocusPath.overlay"]')).toHaveCount(0);
      const dwell = dialog
        .locator('[data-history-family="cursor"]')
        .getByRole('button', { name: label('gallery.videoReview.eventCursorIdle') })
        .first();
      await dwell.click();
      const focus = dialog
        .locator('[data-ui="gallery.videoReview.actionProperties"]:visible')
        .getByRole('button', { name: label('gallery.videoReview.actionFocus'), exact: true });
      await expect(focus).toBeEnabled();
      await focus.click();
      await expect
        .poll(async () => (await readReviewContent(page, recordingId))?.zoom.regions.length)
        .toBe(1);
      await dialog
        .locator(
          '[data-ui="gallery.videoReview.zoomInspector"]:visible [data-ui="gallery.videoReview.focusType"]'
        )
        .getByRole('button', { name: label('gallery.videoReview.focusSpotlight'), exact: true })
        .click();
      await expect
        .poll(async () =>
          Boolean((await readReviewContent(page, recordingId))?.zoom.regions[0]?.spotlight)
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath('gallery-dwell-focus-effects.png'),
        fullPage: false,
      });
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
        .click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
        .click();
      const row = dialog.locator('[data-ui="cursorFocusPath.timelineKeys"]');
      await dialog.locator('[data-ui="gallery.videoReview.historyStrip"]').dblclick({
        position: { x: ((await row.boundingBox())!.width * 2) / 12.01, y: 58 },
      });
      const inspector = dialog.locator('[data-ui="cursorFocusPath.inspector"]:visible');
      await expect(inspector).toBeVisible();
      await expect(
        inspector.locator('details[data-level="group"]').filter({
          has: page.locator('summary', {
            hasText: label('videoEditor.sidebar.cursorFocusHandles'),
          }),
        })
      ).not.toHaveAttribute('open');
      await page.screenshot({
        path: info.outputPath('gallery-cursor-focus-primary.png'),
        fullPage: false,
      });
      const x = inspector.getByRole('textbox', { name: 'X', exact: true });
      await x.fill('0.35');
      await x.blur();
      await inspector
        .getByRole('textbox', {
          name: label('videoEditor.sidebar.actionTimePrefix'),
          exact: true,
        })
        .fill('1');
      await x.focus();
      await expect(x).toHaveValue('0.35');
      await inspector
        .getByText(label('videoEditor.sidebar.cursorFocusHandles'), { exact: true })
        .click();
      await inspector
        .getByRole('textbox', {
          name: `${label('videoEditor.sidebar.cursorFocusOutgoing')} X`,
          exact: true,
        })
        .fill('0.6');
      await x.focus();
      await page.keyboard.press('Tab');
      await expect
        .poll(
          async () =>
            (await readCursorPath(page, recordingId))?.segments
              .flatMap((segment) => segment.keys)
              .filter((key) => key.anchor === 'manual').length
        )
        .toBe(1);
      const before = await readCursorPath(page, recordingId);
      const manual = before!.segments
        .flatMap((segment) => segment.keys)
        .find((key) => key.anchor === 'manual')!;
      expect(manual.outgoing?.x).toBe(0.6);
      await verifyCursorHandleBounds(page, dialog, () =>
        dialog
          .getByRole('button', {
            name: label('gallery.videoReview.undo'),
            exact: true,
          })
          .click()
      );
      const manualHandle = dialog.locator(
        `[data-ui="cursorFocusPath.overlay"] [data-cursor-focus-key="${manual.id}"]`
      );
      await expect(manualHandle).toBeVisible();
      await drag(page, manualHandle, 28, 14, true);
      await expect
        .poll(
          async () =>
            (await readCursorPath(page, recordingId))?.segments
              .flatMap((segment) => segment.keys)
              .find((key) => key.id === manual.id)?.x
        )
        .toBeCloseTo(0.35, 4);
      await drag(page, manualHandle, 32, 16, false);
      await expect
        .poll(
          async () =>
            (await readCursorPath(page, recordingId))?.segments
              .flatMap((segment) => segment.keys)
              .find((key) => key.id === manual.id)?.x
        )
        .not.toBe(0.35);
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
        .click();
      await expect(x).toHaveValue('0.35');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
        .click();
      const settings = dialog.locator('[data-ui="cursorFocusPath.settings"]:visible');
      await expect(settings.getByRole('textbox', { name: 'X', exact: true })).toHaveCount(0);
      await settings
        .getByRole('button', { name: label('videoEditor.sidebar.cursorFocusMode'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('videoEditor.sidebar.cursorFocusFollow'), exact: true })
        .click();
      await expect.poll(async () => (await readCursorPath(page, recordingId))?.mode).toBe('follow');
      await selectAuthoredKey(
        page,
        dialog.locator('[data-ui="cursorFocusPath.timelineKeys"]'),
        manual.id
      );
      await inspector
        .getByRole('button', { name: label('videoEditor.sidebar.cursorFocusNext'), exact: true })
        .click();
      await expect(x).not.toHaveValue('0.35');
      await inspector
        .getByRole('button', {
          name: label('videoEditor.sidebar.cursorFocusPrevious'),
          exact: true,
        })
        .click();
      await expect(x).toHaveValue('0.35');
      await expect(dialog.locator('[data-ui="cursorFocusPath.overlay"]')).toBeVisible();
      await inspector.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('gallery-cursor-focus-inspector.png'),
        fullPage: false,
      });
      if (viewport.width === 1920) await verifyCursorInspectorWidths(page, dialog, inspector, info);
      await page.reload();
      const reopened = await openGalleryCursorScene(page);
      await expect(
        reopened.locator('[data-ui="cursorFocusPath.settings"]:visible').getByRole('button', {
          name: label('videoEditor.sidebar.cursorFocusMode'),
          exact: true,
        })
      ).toHaveText(label('videoEditor.sidebar.cursorFocusFollow'));
      await selectAuthoredKey(
        page,
        reopened.locator('[data-ui="cursorFocusPath.timelineKeys"]'),
        manual.id
      );
      await expect(
        reopened
          .locator('[data-ui="cursorFocusPath.inspector"]:visible')
          .getByRole('textbox', { name: 'X', exact: true })
      ).toHaveValue('0.35');
      await expect(reopened.locator('[data-ui="cursorFocusPath.overlay"]')).toBeVisible();
      await page.screenshot({
        path: info.outputPath('gallery-cursor-focus-reopened.png'),
        fullPage: false,
      });
      await verifyGalleryCameraPolicy(page, info, recordingId);
      if (viewport.width < 1280) {
        const scroll = reopened.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
        expect(await scroll.evaluate((node) => node.scrollWidth)).toBeGreaterThan(
          await scroll.evaluate((node) => node.clientWidth)
        );
        await scroll.evaluate((node) => {
          node.scrollLeft = node.scrollWidth - node.clientWidth;
        });
        await expect.poll(() => scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
        await page.screenshot({
          path: info.outputPath('gallery-cursor-focus-horizontal-scroll.png'),
          fullPage: false,
        });
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  test(`standalone authored Cursor Path one drag undo and Escape ${viewport.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const server = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    const recording = betaV1Fixture.records.recordings[0]!;
    const cursorTrack = createVideoProjectCursorTrack('embedded-fallback');
    cursorTrack.samples = samples;
    const project = createVideoProjectFromRecording({
      recordingId: recording.id,
      filename: recording.filename,
      width: 160,
      height: 90,
      duration: 12.01,
      mimeType: 'video/webm',
      size: recording.size,
      cursorTrack,
    });
    try {
      await applyCameraPolicyBootstrap(page, {
        apiBehavior: { runtimeFallback: 'typed-success' as const },
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': 'en',
          'sniptale-theme-preference': 'light',
          [`sniptale_video_editor_track_panel_prefs:${project.id}`]: {
            collapsedCursorLaneVisible: true,
            collapsedTelemetryLaneVisible: true,
            compactRows: false,
          },
        },
      });
      await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}?theme=light`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 160,
        height: 90,
        duration: 12.01,
      });
      await seedCursor(page);
      await page.evaluate(
        async ({ databaseName, project }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(databaseName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            await new Promise<void>((resolve, reject) => {
              const tx = db.transaction('video_projects', 'readwrite');
              tx.objectStore('video_projects').put({
                id: project.id,
                project,
                createdAt: project.createdAt,
                updatedAt: project.updatedAt,
              });
              tx.oncomplete = () => resolve();
              tx.onabort = () => reject(tx.error);
            });
          } finally {
            db.close();
          }
        },
        { databaseName: betaV1Fixture.databaseName, project }
      );
      await page.goto(
        `${server.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=light`
      );
      await expect(
        page.locator(
          '[data-ui="video-editor.timeline.history-cursor-row"] [data-timeline-effect-segment]'
        )
      ).toHaveCount(1);
      const sparseRow = page.locator('[data-ui="cursorFocusPath.timelineKeys"]');
      await expect(sparseRow).toBeVisible();
      expect(
        await sparseRow.locator('[data-cursor-focus-key], [data-cursor-focus-group]').count()
      ).toBeLessThanOrEqual(3);
      await page
        .locator(
          '[data-ui="video-editor.timeline.history-cursor-row"] [data-timeline-effect-segment]'
        )
        .first()
        .click();
      await page
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.cursorFocusPathTitle'),
          exact: true,
        })
        .click();
      const inspector = page.locator('[data-ui="cursorFocusPath.inspector"]');
      await expect(inspector).toBeVisible();
      const keyRow = page.locator(
        '[data-ui="video-editor.timeline.history-cursor-row"] [data-ui="cursorFocusPath.timelineKeys"]'
      );
      const firstRange = page
        .locator(
          '[data-ui="video-editor.timeline.history-cursor-row"] [data-timeline-effect-segment]'
        )
        .first();
      const firstRangeBox = (await firstRange.boundingBox())!;
      const rowBox = (await keyRow.boundingBox())!;
      const addPosition = { x: firstRangeBox.x - rowBox.x + firstRangeBox.width / 2, y: 12 };
      await keyRow.dblclick({ position: addPosition });
      await expect(keyRow.locator('[data-authored="true"]')).toHaveCount(1);
      await page.keyboard.press('Control+z');
      await expect(keyRow.locator('[data-authored="true"]')).toHaveCount(0);
      await keyRow.dblclick({ position: addPosition });
      const x = inspector.getByRole('textbox', { name: 'X', exact: true });
      await x.fill('0.35');
      await x.blur();
      const handle = page.locator('[data-ui="cursorFocusPath.overlay"]').getByRole('button', {
        name: label('videoEditor.sidebar.cursorFocusPathTitle'),
        exact: true,
      });
      await expect(handle).toBeVisible();
      await verifyCursorHandleBounds(page, page.locator('body'), () =>
        page.keyboard.press('Control+z')
      );
      await drag(page, handle, 30, 12, true);
      await expect(x).toHaveValue('0.35');
      await drag(page, handle, 32, 16, false);
      await expect(x).not.toHaveValue('0.35');
      await page.keyboard.press('Control+z');
      await expect(x).toHaveValue('0.35');
      await inspector
        .getByText(label('videoEditor.sidebar.cursorFocusHandles'), { exact: true })
        .click();
      await inspector
        .getByRole('textbox', {
          name: `${label('videoEditor.sidebar.cursorFocusOutgoing')} X`,
          exact: true,
        })
        .fill('0.6');
      await x.focus();
      await page.keyboard.press('Tab');
      await page.locator('[data-ui="video-editor.viewer.scene"]').click();
      await page
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.cursorFocusPathTitle'),
          exact: true,
        })
        .click();
      const settings = page.locator('[data-ui="cursorFocusPath.settings"]');
      await expect(settings.getByRole('textbox', { name: 'X', exact: true })).toHaveCount(0);
      await settings
        .getByRole('button', { name: label('videoEditor.sidebar.cursorFocusMode'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('videoEditor.sidebar.cursorFocusFollow'), exact: true })
        .click();
      await expect.poll(async () => (await readProjectPath(page, project.id))?.mode).toBe('follow');
      const authored = (await readProjectPath(page, project.id))?.segments
        .flatMap((segment) => segment.keys)
        .find((key) => key.anchor === 'manual');
      await selectAuthoredKey(page, keyRow, authored!.id);
      await page
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.cursorFocusPathTitle'),
          exact: true,
        })
        .click();
      await inspector
        .getByRole('button', { name: label('videoEditor.sidebar.cursorFocusKey'), exact: true })
        .click();
      await expect(
        page.getByRole('option', {
          name: label('videoEditor.sidebar.cursorFocusManualKey'),
        })
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await inspector
        .getByRole('button', { name: label('videoEditor.sidebar.cursorFocusNext'), exact: true })
        .click();
      await inspector
        .getByRole('button', {
          name: label('videoEditor.sidebar.cursorFocusPrevious'),
          exact: true,
        })
        .click();
      await expect(x).toHaveValue('0.35');
      await page.screenshot({
        path: info.outputPath('standalone-cursor-focus-inspector.png'),
        fullPage: false,
      });
      await expect.poll(async () => (await readProjectPath(page, project.id))?.mode).toBe('follow');
      const saved = (await readProjectPath(page, project.id))!;
      const savedManual = saved.segments
        .flatMap((segment) => segment.keys)
        .find((key) => key.anchor === 'manual')!;
      await page.reload();
      await selectAuthoredKey(
        page,
        page.locator('[data-ui="cursorFocusPath.timelineKeys"]'),
        savedManual.id
      );
      await page
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.cursorFocusPathTitle'),
          exact: true,
        })
        .click();
      await expect(inspector.getByRole('textbox', { name: 'X', exact: true })).toHaveValue('0.35');
      expect(await readProjectPath(page, project.id)).toEqual(saved);
      await page.screenshot({
        path: info.outputPath('standalone-cursor-focus-reopened.png'),
        fullPage: false,
      });
      await verifyMontageCameraPolicy(page, info, project.id);
      if (viewport.width < 1280) {
        const scroll = page.locator('[data-ui="video-editor.workspace.root"]');
        expect(await scroll.evaluate((node) => node.scrollWidth)).toBeGreaterThan(
          await scroll.evaluate((node) => node.clientWidth)
        );
        await scroll.evaluate((node) => {
          node.scrollLeft = node.scrollWidth - node.clientWidth;
        });
        await expect.poll(() => scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
        await page.screenshot({
          path: info.outputPath('standalone-cursor-focus-horizontal-scroll.png'),
          fullPage: false,
        });
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

async function drag(page: Page, handle: Locator, dx: number, dy: number, cancel: boolean) {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) throw new Error('Canvas handle is absent');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 4 });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
}
async function seedCursor(page: Page) {
  const track = createVideoProjectCursorTrack('embedded-fallback');
  track.samples = samples;
  await page.evaluate(
    async ({ fixture, cursorTrack }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(fixture.databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction('recording_telemetry', 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      tx.objectStore('recording_telemetry').put({
        recordingId: fixture.records.recordings[0]!.id,
        captureMode: 'TAB',
        createdAt: 1,
        updatedAt: 1,
        viewport: null,
        cursorTrack,
        actionEvents: [],
        signals: [
          {
            id: 'focus-dwell',
            kind: 'cursor-idle',
            startTime: 4,
            endTime: 5,
            point: { x: 64, y: 36 },
            recordingPoint: { x: 0.4, y: 0.4 },
            data: {},
          },
        ],
      });
      await done;
      db.close();
    },
    { fixture: betaV1Fixture, cursorTrack: track }
  );
}

async function readCursorPath(page: Page, recordingId: string) {
  return (await readReviewContent(page, recordingId))?.cursorFocusPath;
}

async function readProjectPath(page: Page, id: string) {
  const raw = await page.evaluate(
    async ({ databaseName, id }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(databaseName);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      try {
        return await new Promise<unknown>((resolve, reject) => {
          const tx = db.transaction('video_projects', 'readonly');
          const request = tx.objectStore('video_projects').get(id);
          let path: unknown;
          request.onsuccess = () => {
            path = request.result?.project?.cursorFocusPath;
          };
          tx.oncomplete = () => resolve(path);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    { databaseName: betaV1Fixture.databaseName, id }
  );
  return parseCursorFocusPath(raw);
}

async function selectAuthoredKey(page: Page, row: Locator, id: string) {
  const point = row.locator(`[data-cursor-focus-key="${id}"]`);
  await expect(row).toBeVisible();
  await expect.poll(() => row.locator('[data-authored="true"]').count()).toBeGreaterThan(0);
  if (await point.count()) {
    await point.click();
    return;
  }
  await row
    .locator('[data-cursor-focus-group="true"][data-authored="true"] button')
    .first()
    .click();
  await page
    .getByRole('option', {
      name: translate('videoEditor.sidebar.cursorFocusManualKey', 'en'),
    })
    .first()
    .click();
}

async function verifyCursorInspectorWidths(
  page: Page,
  dialog: Locator,
  inspector: Locator,
  info: { outputPath(path: string): string }
) {
  const panel = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
  const width = () =>
    panel.evaluate((node) => {
      const style = getComputedStyle(node);
      return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    });
  for (const target of [523, 524, 525]) {
    const current = await width();
    const handle = (await panel.getByRole('separator').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 20);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + current - target, handle.y + 20, {
      steps: 4,
    });
    await page.mouse.up();
    await expect.poll(width).toBe(target);
    await expect(inspector.locator('[data-ui="gallery.videoReview.inspectorSections"]')).toHaveCSS(
      'display',
      target < 524 ? 'block' : 'grid'
    );
    await page.screenshot({
      path: info.outputPath(`cursor-inspector-width-${target}.png`),
      fullPage: false,
    });
  }
}

/** Tangent editing remains recoverable at the edge of the native rendered canvas. */
async function verifyCursorHandleBounds(page: Page, owner: Locator, undo: () => Promise<unknown>) {
  const overlay = owner.locator('[data-ui="cursorFocusPath.overlay"]');
  await expect(overlay.locator('[aria-pressed="true"]')).toHaveCount(1);
  const tangent = overlay.getByRole('button', {
    name: translate('videoEditor.sidebar.cursorFocusOutgoing', 'en'),
    exact: true,
  });
  await expect(tangent).toBeVisible();
  const box = (await tangent.boundingBox())!;
  const stage = (await overlay.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width + 200, stage.y - 200, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => (await tangent.boundingBox())!.x).toBeGreaterThan(box.x + 20);
  const bounded = (await tangent.boundingBox())!;
  expect(bounded.x).toBeGreaterThanOrEqual(stage.x);
  expect(bounded.y).toBeGreaterThanOrEqual(stage.y);
  expect(bounded.x + bounded.width).toBeLessThanOrEqual(stage.x + stage.width);
  expect(bounded.y + bounded.height).toBeLessThanOrEqual(stage.y + stage.height);
  await undo();
}
