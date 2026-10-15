import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import {
  checkLocalWindowIcon,
  persistedQuickHeader,
  checkRenderedWindowIcon,
} from '../support/window-header-local-icon';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  EDITOR_HARNESS_PATH,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  createExactBrowserFrameHarnessPayload,
} from '../extension-critical.helpers';

for (const locale of ['ru', 'en'] as const) {
  test(`quick editor local window icon persists (${locale})`, async ({ page }, info) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': 'dark' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=dark`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.scene').click();
      const settings = dialog.locator('[data-ui="window-header-settings"]');
      await settings
        .getByRole('button', { name: label('windowHeader.browser'), exact: true })
        .click();
      await checkLocalWindowIcon(page, settings, locale);
      const preview = dialog.locator('[data-ui="gallery.videoReview.stage"]');
      await checkRenderedWindowIcon(page, preview, info.outputPath('quick-icon-detail.png'), 0.08);
      await page.screenshot({ path: info.outputPath('quick-local-icon.png'), fullPage: false });
      await button('common.actions.close').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.scene').click();
      const folder = settings.getByRole('button', {
        name: label('windowHeader.fileIcon'),
        exact: true,
      });
      if (!(await folder.isVisible()))
        await dialog
          .getByRole('heading', { name: label('gallery.videoReview.windowHeader'), exact: true })
          .click();
      await expect(folder).toHaveAttribute('aria-pressed', 'true');
      await expect(
        settings.getByRole('textbox', { name: label('windowHeader.address'), exact: true })
      ).toHaveValue('custom-icon.example');
      const saved = await persistedQuickHeader(page);
      expect(saved?.faviconSource).toBe('file');
      await button('gallery.videoReview.undo').click();
      await expect.poll(() => persistedQuickHeader(page)).not.toEqual(saved);
      await button('gallery.videoReview.redo').click();
      await expect.poll(() => persistedQuickHeader(page)).toEqual(saved);
      await expect(folder).toHaveAttribute('aria-pressed', 'true');
      await checkRenderedWindowIcon(
        page,
        preview,
        info.outputPath('quick-icon-restored-detail.png'),
        0.08
      );
      await folder.scrollIntoViewIfNeeded();
      await expect(folder).toBeInViewport();
      await page.screenshot({
        path: info.outputPath('quick-local-icon-restored.png'),
        fullPage: false,
      });
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  for (const viewport of [
    { width: 1280, height: 560 },
    { width: 1920, height: 900 },
    { width: 1100, height: 560 },
  ]) {
    test(`image window header controls ${variant.locale} ${viewport.width}x${viewport.height}`, async ({
      page,
    }, info) => {
      const host = await startHostServer();
      const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
      try {
        await page.setViewportSize(viewport);
        await applyHarnessBootstrap(page, {
          apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
          editorAutoApplyBrowserFrame: true,
          editorBootstrapPayload: createExactBrowserFrameHarnessPayload(),
          storage: {
            'sniptale-locale-preference': variant.locale,
            'sniptale-theme-preference': variant.theme,
          },
        });
        await page.addInitScript(
          (locale) => localStorage.setItem('sniptale-locale-preference', locale),
          variant.locale
        );
        await page.goto(`${host.origin}${EDITOR_HARNESS_PATH}?theme=${variant.theme}`);
        const hasHeader = () =>
          page.evaluate(
            () =>
              window.__sniptaleEditorHarness
                ?.getCanvasObjects()
                .some((object) => object['sniptaleType'] === 'browser-frame') ?? false
          );
        await expect.poll(hasHeader).toBe(true);
        await expect(page.locator('[data-ui="editor.page.open-loading"]')).toHaveCount(0);
        await page.locator('[data-ui="editor.floating.layers.mode.browser-frame"]').click();
        const settings = page.locator('[data-ui="window-header-settings"]');
        await expect(settings).toBeVisible();
        const button = (key: Parameters<typeof translate>[0]) =>
          settings.getByRole('button', { name: label(key), exact: true });
        const artwork = () =>
          page.evaluate(() => {
            const src = window.__sniptaleEditorHarness
              ?.getCanvasObjects()
              .find((object) => object['sniptaleType'] === 'browser-frame')?.['src'];
            return typeof src === 'string' ? decodeURIComponent(src) : '';
          });
        await button('windowHeader.application').click();
        await expect.poll(artwork).toContain('application win');
        const segmentGeometry = await settings.getByRole('button').evaluateAll(
          (buttons, labels) =>
            buttons
              .filter((button) => labels.includes(button.textContent ?? ''))
              .map((button) => {
                const css = getComputedStyle(button);
                return {
                  label: button.textContent,
                  height: button.getBoundingClientRect().height,
                  paddingTop: css.paddingTop,
                  paddingBottom: css.paddingBottom,
                  lineHeight: css.lineHeight,
                  fontSize: css.fontSize,
                };
              }),
          ['Windows', 'macOS', 'Linux', label('windowHeader.light'), label('windowHeader.dark')]
        );
        await writeFile(
          info.outputPath('window-header-segment-geometry.json'),
          JSON.stringify(segmentGeometry, null, 2)
        );
        expect(segmentGeometry).toHaveLength(5);
        for (const geometry of segmentGeometry) {
          expect(geometry.height).toBe(segmentGeometry[0]!.height);
          expect(geometry.paddingTop).toBe(segmentGeometry[0]!.paddingTop);
          expect(geometry.paddingBottom).toBe(segmentGeometry[0]!.paddingBottom);
          expect(geometry.lineHeight).toBe(segmentGeometry[0]!.lineHeight);
        }
        await expect(
          settings.getByRole('textbox', { name: label('windowHeader.address'), exact: true })
        ).toHaveCount(0);
        await settings
          .getByRole('textbox', { name: label('windowHeader.windowTitle'), exact: true })
          .fill('Image application header');
        await settings.getByRole('button', { name: 'macOS', exact: true }).click();
        await button('windowHeader.dark').click();
        await expect(
          page.getByRole('button', { name: label('editor.compact.apply'), exact: true })
        ).toHaveCount(0);
        const reset = page.getByRole('button', {
          name: label('windowHeader.reset'),
          exact: true,
        });
        await reset.scrollIntoViewIfNeeded();
        await expect(reset).toBeInViewport();
        await expect.poll(hasHeader).toBe(true);
        await page.screenshot({
          path: info.outputPath('image-application-header.png'),
          fullPage: false,
        });
        await reset.click();
        await expect.poll(hasHeader).toBe(false);
        await page.getByRole('button', { name: label('editor.toolbar.undo'), exact: true }).click();
        await expect.poll(hasHeader).toBe(true);
        await expect(button('windowHeader.application')).toHaveAttribute('aria-pressed', 'true');
        await button('windowHeader.none').click();
        await expect.poll(hasHeader).toBe(false);
        await button('windowHeader.browser').click();
        await expect.poll(hasHeader).toBe(true);
        await expect(
          settings.getByRole('textbox', { name: label('windowHeader.address'), exact: true })
        ).toBeVisible();
        await expect(button('windowHeader.favicon')).toBeVisible();
        await checkLocalWindowIcon(page, settings, variant.locale);
        await expect.poll(artwork).toContain('data:image/png;base64,');
        await page.evaluate(() => window.scrollTo(0, 0));
        await checkRenderedWindowIcon(
          page,
          page.locator('[data-ui="editor.canvas.surface-hit-area"] > div'),
          info.outputPath('image-icon-detail.png')
        );
        await page.evaluate(() => window.__sniptaleEditorHarness?.clearSelection());
        await settings.scrollIntoViewIfNeeded();
        if (viewport.width < 1280) {
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
          ).toBe(true);
          await page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, 0));
          expect(await page.evaluate(() => window.scrollX)).toBeGreaterThan(0);
        }
        await page.screenshot({
          path: info.outputPath('image-window-header.png'),
          fullPage: false,
        });
        await button('windowHeader.favicon').scrollIntoViewIfNeeded();
        await expect(button('windowHeader.favicon')).toBeInViewport();
        await page.screenshot({
          path: info.outputPath('image-window-header-address.png'),
          fullPage: false,
        });
      } finally {
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}
