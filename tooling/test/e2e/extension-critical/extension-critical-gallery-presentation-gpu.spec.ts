import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';
import { chooseInspectorValue } from '../support/inspector-utilities';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

enableGpuPreviewProof();

async function sampleClip(video: Locator) {
  await expect(video).toBeVisible({ timeout: 45_000 });
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState))
    .toBeGreaterThanOrEqual(2);
  return video.evaluate(async (node: HTMLVideoElement) => {
    node.pause();
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 54;
    const context = canvas.getContext('2d');
    if (!context || !Number.isFinite(node.duration))
      throw new Error('Prepared clip is unavailable.');
    const frames: number[][] = [];
    try {
      for (const time of [0.001, node.duration / 2, Math.max(0.001, node.duration - 1 / 30)]) {
        await new Promise<void>((resolve, reject) => {
          node.addEventListener('seeked', () => resolve(), { once: true });
          node.addEventListener('error', () => reject(new Error('Prepared clip seek failed.')), {
            once: true,
          });
          node.currentTime = time;
        });
        context.drawImage(node, 0, 0, canvas.width, canvas.height);
        frames.push([...context.getImageData(0, 0, canvas.width, canvas.height).data]);
      }
      return { duration: node.duration, width: node.videoWidth, height: node.videoHeight, frames };
    } finally {
      canvas.width = canvas.height = 0;
    }
  });
}

async function modalGpuCount(page: Page) {
  return page.evaluate(() => {
    const value: unknown = Reflect.get(window, 'sniptaleTestModalGpuCompleted');
    if (typeof value !== 'number') throw new Error('Modal GPU witness is unavailable.');
    return value;
  });
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  test(`Gallery generated presentation GPU image and recovery at ${viewport.name}`, async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ ...viewport.size });
    await page.addInitScript(() => {
      let completed = 0;
      Object.defineProperty(window, 'sniptaleTestModalGpuCompleted', { get: () => completed });
      if (typeof GPUQueue === 'undefined') return;
      const submit = GPUQueue.prototype.submit;
      const done = GPUQueue.prototype.onSubmittedWorkDone;
      GPUQueue.prototype.submit = function (...args: Parameters<GPUQueue['submit']>) {
        const inModal = !!document.querySelector(
          '[data-ui="gallery.videoReview.presentationPreview"]'
        );
        submit.apply(this, args);
        if (inModal)
          void done.call(this).then(
            () => {
              completed++;
            },
            () => {}
          );
      };
    });
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
    const inspector = review.locator('[data-ui="gallery.videoReview.inspector"]');
    const fields = inspector.locator('[data-ui="gallery.videoReview.presentationInspector"]');
    const slot = index === 0 ? 'intro' : 'outro';
    const section = fields.locator(
      `section[aria-label="` +
        `${label(
          slot === 'intro'
            ? 'gallery.videoReview.presentationIntro'
            : 'gallery.videoReview.presentationOutro'
        )}"]`
    );
    const showScene = () =>
      inspector
        .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
        .click();
    const settled = () => expect(fields).toHaveAttribute('aria-busy', 'false');
    const modal = page.locator('[data-ui="gallery.videoReview.presentationPreview"]');
    const trigger = section.getByRole('button', {
      name: label(
        slot === 'intro'
          ? 'gallery.videoReview.presentationPreviewJoinIntro'
          : 'gallery.videoReview.presentationPreviewJoinOutro'
      ),
      exact: true,
    });
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': 'en',
          sniptale_quick_preview_preferences: {
            renderer: 'legacy',
            rasterPreset: 'current',
            frameRate: 'current',
            pausedQuality: 'same',
            showFrameRate: false,
          },
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await review
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await showScene();
      await section
        .getByRole('button', {
          name: label('gallery.videoReview.presentationBookend'),
          exact: true,
        })
        .click();
      const image = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 100;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#ff400080';
        context.fillRect(0, 0, 150, 100);
        context.fillStyle = '#20a0ffff';
        context.fillRect(150, 0, 150, 100);
        return canvas.toDataURL().split(',')[1]!;
      });
      const chooser = page.waitForEvent('filechooser');
      await section
        .getByRole('button', {
          name: label('gallery.videoReview.presentationComputer'),
          exact: true,
        })
        .click();
      await (
        await chooser
      ).setFiles(
        index === 0
          ? { name: 'modal-alpha.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') }
          : {
              name: 'modal-source.webm',
              mimeType: 'video/webm',
              buffer: await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url)),
            }
      );
      await settled();
      if (index === 1)
        await section
          .locator('summary')
          .filter({ hasText: label('gallery.videoReview.presentationTrim') })
          .click();
      const duration = section
        .getByRole('textbox', {
          name: label(
            index === 0
              ? 'gallery.videoReview.presentationDuration'
              : 'gallery.videoReview.presentationTrimEnd'
          ),
          exact: true,
        })
        .first();
      const originalDuration = Number(await duration.inputValue());
      await duration.fill('1');
      await duration.press('Enter');
      await settled();
      await review
        .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
        .click();
      await expect.poll(async () => Number(await duration.inputValue())).toBe(originalDuration);
      await review
        .getByRole('button', { name: label('gallery.videoReview.redo'), exact: true })
        .click();
      await expect.poll(async () => Number(await duration.inputValue())).toBe(1);
      await settled();
      await chooseInspectorValue(
        page,
        section,
        label(
          slot === 'intro'
            ? 'gallery.videoReview.presentationJoinIntro'
            : 'gallery.videoReview.presentationJoinOutro'
        ),
        label(index === 0 ? 'gallery.videoReview.cutDissolve' : 'gallery.videoReview.cutFadeColor')
      );
      await settled();
      const mainVideo = review.locator('[data-ui="gallery.videoReview.stage"] video').first();
      const legacyBefore = await modalGpuCount(page);
      await trigger.click();
      const legacy = await sampleClip(modal.locator('video'));
      expect(await modalGpuCount(page)).toBe(legacyBefore);
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
      await review.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
      await chooseInspectorValue(
        page,
        review.locator('[data-ui="gallery.videoReview.previewInspector"]'),
        label('editor.scene.previewRenderer'),
        label('editor.scene.previewRendererGpu')
      );
      await showScene();
      await settled();
      await trigger.click();
      // Closing a pending job must not leave a stale modal or prevent the next request.
      await expect(modal).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
      const before = await modalGpuCount(page);
      await trigger.click();
      const gpu = await sampleClip(modal.locator('video'));
      await expect.poll(() => modalGpuCount(page)).toBeGreaterThan(before + 2);
      expect(gpu.duration).toBeCloseTo(legacy.duration, 6);
      expect([gpu.width, gpu.height]).toEqual([legacy.width, legacy.height]);
      const differences = gpu.frames.map(
        (frame, tick) =>
          frame.reduce(
            (sum, channel, pixel) => sum + Math.abs(channel - legacy.frames[tick]![pixel]!),
            0
          ) / frame.length
      );
      // Independent lossy encodes plus edge sampling can differ by a few 8-bit channel values.
      for (const difference of differences) expect(difference).toBeLessThan(5);
      await info.attach('generated-modal-comparison', {
        body: JSON.stringify({
          slot,
          gpu: { width: gpu.width, height: gpu.height, duration: gpu.duration },
          differences,
        }),
        contentType: 'application/json',
      });
      await expect
        .poll(() => mainVideo.evaluate((node: HTMLVideoElement) => node.paused))
        .toBe(true);
      await page.screenshot({ path: info.outputPath('generated-modal-gpu.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
