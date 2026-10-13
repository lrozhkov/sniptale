import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

for (const reviewed of [false, true]) {
  test(`recording opens in Montage after native metadata admission (reviewed=${reviewed})`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      if (reviewed) {
        await page.reload();
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
        await expect
          .poll(() => readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))
          .not.toBeNull();
      }
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?id=beta-v1-recording`);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const canvas = page.locator('[data-preview-stage-canvas]');
      await expect
        .poll(() =>
          canvas.evaluate((element: HTMLCanvasElement) => {
            const context = element.getContext('2d');
            if (!context || !element.width || !element.height) return false;
            const pixel = context.getImageData(
              Math.floor(element.width / 2),
              Math.floor(element.height / 2),
              1,
              1
            ).data;
            return Math.max(pixel[0]!, pixel[1]!, pixel[2]!) > 30;
          })
        )
        .toBe(true);
      await page.screenshot({ path: info.outputPath('opened-recording.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
