import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

for (const variant of [
  { locale: 'en' as const, theme: 'dark' as const, width: 1280, height: 560 },
  { locale: 'ru' as const, theme: 'light' as const, width: 1920, height: 900 },
  { locale: 'en' as const, theme: 'light' as const, width: 1200, height: 560 },
]) {
  test(`adaptive export controls ${variant.locale} ${variant.width}`, async ({ page }, info) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const project = createEmptyVideoProject('Adaptive export');
    project.duration = 2;
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await page.emulateMedia({ colorScheme: variant.theme });
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        runtimeResponses: {
          GET_PROJECT_EXPORT_CAPABILITIES: {
            success: true,
            capabilities: {
              formats: [
                { format: 'MP4', available: true },
                { format: 'WEBM', available: true },
              ],
              mp4Codecs: [{ codec: 'AVC', available: true }],
              defaultMp4VideoCodec: 'AVC',
            },
          },
        },
        apiBehavior: { runtimeFallback: 'typed-success' },
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await page
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await page
        .locator('[data-ui="gallery.videoReview.toolbar"]')
        .getByRole('button', { name: label('gallery.videoReview.exportSection'), exact: true })
        .click();
      const fps = page.getByRole('button', {
        name: label('gallery.videoReview.exportFrameRate'),
        exact: true,
      });
      await fps.focus();
      await page.keyboard.press('Enter');
      await page
        .getByRole('option', {
          name: label('videoEditor.exportDialog.frameRateAdaptive'),
        })
        .click();
      await expect(fps).toContainText(label('videoEditor.exportDialog.frameRateAdaptive'));
      await expect(page.locator('[data-ui="video.exportSizeEstimate"]')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('quick-adaptive.png'), fullPage: false });
      if (variant.width === 1920) {
        const columns = page.locator('[data-ui="gallery.videoReview.exportSettings"] fieldset');
        const separator = page.getByRole('separator', {
          name: label('videoEditor.sidebar.resizeInspector'),
        });
        for (const width of [523, 524, 525]) {
          const current = (await columns.boundingBox())!.width;
          const handle = (await separator.boundingBox())!;
          await page.mouse.move(handle.x + handle.width / 2, handle.y + 10);
          await page.mouse.down();
          await page.mouse.move(handle.x + handle.width / 2 + current - width, handle.y + 10);
          await page.mouse.up();
          await expect
            .poll(async () => Math.round((await columns.boundingBox())!.width))
            .toBe(width);
          await expect(fps).toBeInViewport();
          await page.screenshot({
            path: info.outputPath(`quick-adaptive-${width}.png`),
            fullPage: false,
          });
        }
      }

      await fps.click();
      await page.getByRole('option', { name: '30', exact: true }).click();
      await expect(fps).toContainText('30');
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${variant.theme}`
      );
      await page.locator('[data-ui="video-editor.timeline.toolbar.project-menu"]').click();
      await page
        .getByRole('button', { name: label('videoEditor.app.exportButton'), exact: true })
        .click();
      const mode = page.getByRole('button', {
        name: label('videoEditor.exportDialog.frameRateMode'),
        exact: true,
      });
      await mode.focus();
      await page.keyboard.press('Enter');
      await page
        .getByRole('option', {
          name: label('videoEditor.exportDialog.frameRateAdaptive'),
        })
        .click();
      await expect(mode).toContainText(label('videoEditor.exportDialog.frameRateAdaptive'));
      await expect(
        page.getByRole('textbox', { name: label('videoEditor.exportDialog.fpsLabel'), exact: true })
      ).toHaveCount(0);
      await expect(page.locator('[data-ui="video.exportSizeEstimate"]')).toHaveCount(0);
      const submit = page.getByRole('button', {
        name: label('videoEditor.exportDialog.submit'),
        exact: true,
      });
      await expect(submit).toBeInViewport();
      await expect(submit).toBeEnabled();
      await page.screenshot({ path: info.outputPath('full-adaptive.png'), fullPage: false });
      await mode.click();
      await page
        .getByRole('option', {
          name: label('videoEditor.exportDialog.frameRateConstant'),
          exact: true,
        })
        .click();
      await expect(
        page.getByRole('textbox', { name: label('videoEditor.exportDialog.fpsLabel'), exact: true })
      ).toHaveValue('60');
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
