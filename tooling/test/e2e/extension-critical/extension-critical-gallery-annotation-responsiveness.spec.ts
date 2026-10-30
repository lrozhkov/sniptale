import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { addReviewFocus, seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { persistedReviewContent } from '../support/voiceover-speech-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`overlapping annotations retain runtime and paint during movement (${viewport.name})`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport.size);
    await page.addInitScript(() => {
      const starts: { when: number; offset: number; duration: number | undefined }[] = [];
      Object.assign(window, { annotationVoiceStarts: starts });
      const create = BaseAudioContext.prototype.createBufferSource;
      BaseAudioContext.prototype.createBufferSource = function () {
        const node = create.call(this);
        const start = node.start.bind(node);
        node.start = (when = 0, offset = 0, duration) => {
          if (!(this instanceof OfflineAudioContext) && node.buffer)
            starts.push({ when, offset, duration });
          start(when, offset, duration);
        };
        return node;
      };
    });
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: translate(key, 'en'), exact: true });
    const lane = dialog.locator('[data-ui="gallery.videoReview.annotationEffectsLane"]');
    const workspace = () => readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
    const instance = async () =>
      (await persistedReviewContent(page))?.annotationEffects?.instances.at(-1);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': 'en',
          sniptale_quick_preview_preferences: {
            rasterPreset: '1080p',
            frameRate: '30',
            pausedQuality: 'same',
            showFrameRate: true,
          },
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 1920,
        height: 1080,
        duration: 12,
      });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await addReviewFocus(page);
      await button('gallery.videoReview.focusBorder').click();
      const edge = dialog.locator('[data-zoom-edge="end"]').first();
      await edge.scrollIntoViewIfNeeded();
      const eb = (await edge.boundingBox())!;
      const fb = (await dialog.locator('[data-ui="gallery.videoReview.zoomLane"]').boundingBox())!;
      await page.keyboard.down('Alt');
      await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
      await page.mouse.down();
      await page.mouse.move(fb.x + (fb.width * 11) / 12, eb.y + eb.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.keyboard.up('Alt');
      for (let index = 0; index < 2; index++) {
        await dialog
          .locator('[data-review-header-track="annotationEffects"] [data-review-track-select]')
          .click();
        await button('gallery.videoReview.annotationEffectsAdd').click();
        await button('gallery.videoReview.annotationEffectsChoose').click();
        await page.getByRole('option', { name: 'Main idea', exact: true }).click();
        await lane.scrollIntoViewIfNeeded();
        const bounds = (await lane.boundingBox())!;
        await page.mouse.move(bounds.x + bounds.width / 12, bounds.y + 1);
        await page.mouse.down();
        await page.mouse.move(bounds.x + (bounds.width * 11) / 12, bounds.y + 1, { steps: 8 });
        await page.mouse.up();
        await expect(lane.locator('[data-annotation-effect-id]')).toHaveCount(index + 1);
        await expect
          .poll(
            async () => (await persistedReviewContent(page))?.annotationEffects?.instances.length
          )
          .toBe(index + 1);
      }
      const voiceHeader = dialog.locator('[data-ui="gallery.videoReview.trackHeader"]').filter({
        hasText: translate('gallery.videoReview.audioVoiceover', 'en'),
      });
      await voiceHeader
        .getByRole('button', {
          name: translate('gallery.videoReview.audioImport', 'en'),
          exact: true,
        })
        .click();
      const library = page.getByRole('dialog', {
        name: translate('gallery.videoReview.musicLibrary', 'en'),
        exact: true,
      });
      await library
        .locator('input[type="file"]')
        .setInputFiles(resolve('tooling/test/e2e/fixtures/review-voice-speech.wav'));
      await expect(library).toHaveCount(0);
      await expect(dialog.locator('[data-audio-lane="voiceover"] [data-audio-id]')).toHaveCount(1);
      const video = dialog.locator('video').first();
      await video.evaluate((node) => {
        node.currentTime = 0.5;
      });
      await expect.poll(() => video.evaluate((node) => node.seeking)).toBe(false);
      await page.evaluate(() => {
        const times: number[] = [];
        const observer = new MutationObserver((records) => {
          for (const record of records)
            if (
              record.target instanceof HTMLElement &&
              record.target.dataset['previewFront'] === 'true'
            )
              times.push(performance.now());
        });
        observer.observe(document.querySelector('[data-ui="gallery.videoReview.manualPreview"]')!, {
          subtree: true,
          attributes: true,
          attributeFilter: ['data-preview-front'],
        });
        Object.assign(window, { annotationPublicationProbe: { times, observer } });
      });
      await button('gallery.videoReview.play').click();
      await page.waitForFunction(
        () => document.querySelector<HTMLVideoElement>('dialog video')!.currentTime >= 2.5
      );
      await button('gallery.videoReview.pause').click();
      const times = await page.evaluate(() => {
        const probe = Reflect.get(window, 'annotationPublicationProbe');
        probe.observer.disconnect();
        return probe.times as number[];
      });
      expect(times.length).toBeGreaterThan(4);
      const starts = await page.evaluate(() => Reflect.get(window, 'annotationVoiceStarts'));
      expect(starts).toHaveLength(1);
      await writeFile(info.outputPath('voiceover-starts.json'), JSON.stringify(starts));
      await writeFile(info.outputPath('publication-times.json'), JSON.stringify(times));
      await video.evaluate((node) => {
        node.currentTime = 1.5;
      });
      await expect.poll(() => video.evaluate((node) => node.seeking)).toBe(false);
      const target = dialog
        .locator('[data-ui="gallery.videoReview.annotationOverlay"] [data-annotation-id]')
        .last();
      await target.click();
      const canvas = dialog.locator(
        '[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]'
      );
      await expect(canvas).toBeVisible();
      const pixels = async () => (await canvas.screenshot()).toString('base64');
      const original = (await instance())!;
      const cursor = (await workspace())!.cursor;
      const beforePixels = await pixels();
      const box = (await target.boundingBox())!;
      let attached = 0;
      const onAttach = () => {
        attached++;
      };
      page.on('frameattached', onAttach);
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 48, y + 16, { steps: 60 });
      await expect.poll(pixels).not.toBe(beforePixels);
      expect((await instance())!.transform).toEqual(original.transform);
      expect((await workspace())!.cursor).toBe(cursor);
      expect(attached).toBe(0);
      await page.screenshot({ path: info.outputPath('annotation-live-drag.png'), fullPage: false });
      await page.mouse.up();
      page.off('frameattached', onAttach);
      await expect.poll(async () => (await instance())!.transform).not.toEqual(original.transform);
      await expect.poll(async () => (await workspace())!.cursor).toBe(cursor + 1);
      const moved = (await instance())!;
      await button('gallery.videoReview.undo').click();
      await expect.poll(async () => (await instance())!.transform).toEqual(original.transform);
      await button('gallery.videoReview.redo').click();
      await expect.poll(async () => (await instance())!.transform).toEqual(moved.transform);
      const next = (await target.boundingBox())!;
      await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
      await page.mouse.down();
      await page.mouse.move(next.x + next.width / 2 - 24, next.y + next.height / 2, { steps: 12 });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect((await instance())!.transform).toEqual(moved.transform);
      expect((await workspace())!.cursor).toBe(cursor + 1);
      await page.screenshot({ path: info.outputPath('annotation-cancelled.png'), fullPage: false });
      await dialog
        .locator('header')
        .getByRole('button', { name: translate('common.actions.close', 'en'), exact: true })
        .click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(lane.locator('[data-annotation-effect-id]')).toHaveCount(2);
      expect((await instance())!.transform).toEqual(moved.transform);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
