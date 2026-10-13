import { expect, test, type Page, type Locator } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { createVideoProjectCursorTrack } from '../../../../apps/extension/src/features/video/project/defaults';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { persistedReviewContent } from '../support/voiceover-speech-fixture';

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`selection paired samples retain audition and video playback ${viewport.width}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        let frames: number[] = [];
        const start = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
          start.call(this, when, offset, duration);
          if (this.buffer?.sampleRate === 44100) frames.push(this.buffer.length);
        };
        Object.defineProperty(window, 'pairedActionProbe', {
          value: (reset = false) => {
            if (reset) frames = [];
            return [...frames];
          },
        });
      });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await seedSelectionGesture(page);
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.historyOpen').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.actionHistory"] li')
        .filter({ hasText: 'Selection proof' })
        .getByRole('button')
        .first()
        .click();
      const audio = dialog.locator('[data-ui="gallery.videoReview.actionAudioFields"]:visible');
      if (!(await audio.isVisible()))
        await dialog
          .getByRole('button', { name: label('gallery.videoReview.actionAudio'), exact: true })
          .click();
      await audio.scrollIntoViewIfNeeded();
      const probe = (reset = false) =>
        page.evaluate((reset) => {
          const read = Reflect.get(window, 'pairedActionProbe');
          if (typeof read !== 'function') throw new Error('Missing paired sample probe');
          return read(reset) as number[];
        }, reset);
      const video = dialog.locator('[data-ui="gallery.videoReview.stage"] video');
      for (const [preset, key] of [
        ['mouse-classic-paired-v2', 'gallery.videoReview.actionAudioMousePaired'],
        ['mouse-soft-paired-v2', 'gallery.videoReview.actionAudioMouseSoftPaired'],
      ] as const) {
        if (!(await audio.isVisible())) {
          await button('gallery.videoReview.historyOpen').click();
          await dialog
            .locator('[data-ui="gallery.videoReview.actionHistory"] li')
            .filter({ hasText: 'Selection proof' })
            .getByRole('button')
            .first()
            .click();
          await audio.scrollIntoViewIfNeeded();
        }
        await audio
          .locator('[data-family="mouse"]')
          .getByRole('button', { name: /^Mouse ·/ })
          .click();
        await page.getByRole('option', { name: label(key), exact: true }).click();
        await expect
          .poll(async () => (await persistedReviewContent(page))?.actionAudio?.[0]?.presetId)
          .toBe(preset);
        await verifyPairedPlayback(dialog, probe, label);
        await button('gallery.videoReview.historyOpen').click();
        await dialog
          .locator('[data-ui="gallery.videoReview.actionHistory"] li')
          .filter({ hasText: 'Selection proof' })
          .getByRole('button')
          .first()
          .click();
        await audio.scrollIntoViewIfNeeded();
        await probe(true);
        await audio
          .getByRole('button', {
            name: label('gallery.videoReview.actionAudioListen'),
            exact: true,
          })
          .click();
        await expect.poll(async () => (await probe()).sort((a, b) => a - b)).toEqual([2205, 3087]);
        expect(await video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
        await expect(
          dialog.getByText(label('gallery.videoReview.actionAudioResource'), { exact: true })
        ).toHaveCount(0);
        await verifyPairedPlayback(dialog, probe, label);
      }
      await page.screenshot({
        path: info.outputPath('paired-selection-audio.png'),
        fullPage: false,
      });
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

async function verifyPairedPlayback(
  dialog: Locator,
  probe: (reset?: boolean) => Promise<number[]>,
  label: (key: Parameters<typeof translate>[0]) => string
) {
  const video = dialog.locator('[data-ui="gallery.videoReview.stage"] video');
  const before = await video.evaluate((node: HTMLVideoElement) => node.currentTime);
  await probe(true);
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.play'), exact: true })
    .click();
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
    .toBeGreaterThan(before + 0.8);
  await expect.poll(async () => (await probe()).sort((a, b) => a - b)).toEqual([2205, 3087]);
  await dialog
    .getByRole('button', { name: label('gallery.videoReview.pause'), exact: true })
    .click();
  await expect(
    dialog.getByText(label('gallery.videoReview.actionAudioResource'), { exact: true })
  ).toHaveCount(0);
}

/** Isolated native fact fixture retains exact source gesture identities and geometry. */
async function seedSelectionGesture(page: Page) {
  const track = createVideoProjectCursorTrack('embedded-fallback');
  track.samples = [
    {
      id: 'down',
      time: 1,
      x: 32,
      y: 27,
      recordingPoint: { x: 0.2, y: 0.3 },
      visible: true,
      captureSegment: 0,
    },
    {
      id: 'up',
      time: 1.5,
      x: 112,
      y: 54,
      recordingPoint: { x: 0.7, y: 0.6 },
      visible: true,
      captureSegment: 0,
    },
  ];
  await page.evaluate(
    async ({ fixture, track }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(fixture.databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const tx = db.transaction('recording_telemetry', 'readwrite');
        const done = new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
        tx.objectStore('recording_telemetry').put({
          recordingId: fixture.records.recordings[0].id,
          captureMode: 'TAB',
          createdAt: 1,
          updatedAt: 1,
          viewport: null,
          cursorTrack: track,
          signals: [],
          actionEvents: [
            {
              id: 'selection',
              kind: 'CLICK',
              time: 1,
              duration: 0.5,
              point: { x: 32, y: 27 },
              recordingPoint: { x: 0.2, y: 0.3 },
              label: 'Selection proof',
              preset: 'NONE',
              data: {
                gestureId: 'selection',
                gestureType: 'selection',
                downTime: 1,
                downX: 32,
                downY: 27,
                upTime: 1.5,
                upX: 112,
                upY: 54,
                maxExcursionCssPx: 85,
                pressDuration: 0.5,
                button: 0,
                completion: 'released',
                recordingUpX: 0.7,
                recordingUpY: 0.6,
              },
            },
          ],
        });
        await done;
      } finally {
        db.close();
      }
    },
    { fixture: betaV1Fixture, track }
  );
}
