import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { getVideoProjectWatermarkAsset } from '../../../../apps/extension/src/features/video/project/scene/watermark';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { checkInspectorPaintedFont } from '../support/inspector-utilities';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru',
    theme = index === 0 ? 'dark' : 'light';
  test(`Native watermark preserves scene authoring ${viewport.size.width} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const project = createVideoProjectFromRecording({
        recordingId: 'beta-v1-recording',
        filename: 'beta-v1.webm',
        width: 160,
        height: 90,
        duration: 12,
        mimeType: 'video/webm',
        size: bytes.length,
      });
      project.width = 1280;
      project.height = 720;
      project.duration = 1.2;
      project.clips = project.clips.map((clip) => ({
        ...clip,
        duration: 1.2,
        sourceDuration: 1.2,
        transform: { ...clip.transform, x: 80, y: 40, width: 1120, height: 630 },
      }));
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript((language) => {
        localStorage.setItem('sniptale-locale-preference', language);
        if (sessionStorage.getItem('native-watermark-seeded')) {
          const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
          if (typeof bootstrap === 'object' && bootstrap !== null)
            Reflect.deleteProperty(bootstrap, 'videoProjects');
        }
      }, locale);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.evaluate(() => sessionStorage.setItem('native-watermark-seeded', 'true'));
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const select = async () => {
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
          .click();
        await page
          .getByRole('button', { name: label('gallery.videoReview.watermark'), exact: true })
          .click();
      };
      await select();
      const owner = page.locator('[data-ui="video-editor.watermark.inspector"]');
      await expect(owner).toBeVisible();
      expect((await readNativeVideoProject(page))?.watermark).toBeUndefined();
      const mode = (key: Parameters<typeof translate>[0]) =>
        owner.getByRole('button', { name: label(key), exact: true });
      await mode('gallery.videoReview.watermarkText').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.watermark?.mode)
        .toBe('text');
      const baseline = (await readNativeVideoProject(page))!;
      expect(baseline.version).toBe(20);
      const text = owner.getByRole('textbox', {
        name: label('gallery.videoReview.watermarkText'),
        exact: true,
      });
      const size = owner.getByRole('textbox', {
        name: label('gallery.videoReview.watermarkSize'),
        exact: true,
      });
      await size.fill('80');
      await size.press('Enter');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.watermark?.text.size)
        .toBe(80 / 720);
      await text.fill('Accepted mark');
      await text.press('Enter');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.watermark?.text.value)
        .toBe('Accepted mark');
      const canvas = page.locator('[data-preview-stage-canvas]');
      await expect(canvas).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const hash = () => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
      const acceptedCanvas = await hash();
      await text.fill('Visible draft');
      await expect.poll(hash).not.toBe(acceptedCanvas);
      expect((await readNativeVideoProject(page))?.watermark?.text.value).toBe('Accepted mark');
      await text.press('Escape');
      await expect.poll(hash).toBe(acceptedCanvas);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.watermark?.text.value)
        .toBe(label('gallery.videoReview.watermarkSeed'));
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.watermark?.text.value)
        .toBe('Accepted mark');
      await mode('gallery.videoReview.watermarkBold').click();
      await mode('gallery.videoReview.watermarkItalic').click();
      await mode('gallery.videoReview.watermarkStrike').click();
      await checkInspectorPaintedFont(
        page,
        mode('gallery.videoReview.watermarkFontSans'),
        'native-watermark-font'
      );
      await page.screenshot({
        path: info.outputPath('watermark-text-controls.png'),
        fullPage: false,
      });
      const anchors = owner.locator('[data-ui="watermark.anchors"]');
      for (const anchor of [
        'top-left',
        'top',
        'top-right',
        'left',
        'center',
        'right',
        'bottom-left',
        'bottom',
        'bottom-right',
      ] as const) {
        const button = anchors.getByRole('button', {
          name: label(`gallery.videoReview.watermarkAnchor_${anchor}`),
          exact: true,
        });
        await button.click();
        await page.mouse.move(0, 0);
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(button).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        const box = (await button.boundingBox())!,
          glyph = (await button.locator('svg').boundingBox())!;
        expect
          .soft(Math.abs(box.x + box.width / 2 - glyph.x - glyph.width / 2))
          .toBeLessThanOrEqual(1);
        expect
          .soft(Math.abs(box.y + box.height / 2 - glyph.y - glyph.height / 2))
          .toBeLessThanOrEqual(1);
      }
      await anchors.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('watermark-anchors.png'), fullPage: false });
      await mode('gallery.videoReview.watermarkTiled').click();
      const spacing = owner.getByRole('textbox', {
        name: label('gallery.videoReview.watermarkSpacing'),
        exact: true,
      });
      await spacing.fill('12');
      await spacing.press('Enter');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.watermark?.tile.spacing)
        .toBe(0.12);
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
      const rail = inspector.locator('[data-ui="video-editor.inspector.categories"] > nav');
      if (index === 0) await page.locator('[data-ui="video-editor.materials.close"]').click();
      for (const width of [359, 360, 361]) {
        const current = (await inspector.boundingBox())!.width,
          box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + 12);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + current - width, box.y + 12);
        await page.mouse.up();
        await expect
          .poll(async () => Math.round((await inspector.boundingBox())!.width))
          .toBe(width);
        const before = await rail.boundingBox();
        await mode('gallery.videoReview.watermarkReset').scrollIntoViewIfNeeded();
        expect((await rail.boundingBox())?.y).toBe(before?.y);
        expect(
          await owner.evaluate((node) => {
            const body = node.closest('[data-ui="video-editor.inspector.categories"] > div');
            return body instanceof HTMLElement && body.scrollWidth <= body.clientWidth + 1;
          })
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`watermark-inspector-${width}.png`),
          fullPage: false,
        });
      }
      await mode('gallery.videoReview.watermarkImage').click();
      const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 40;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#2563eb';
        context.fillRect(0, 0, 80, 40);
        return canvas.toDataURL('image/png').split(',')[1]!;
      });
      await owner.locator('input[type="file"]').setInputFiles({
        name: 'native-logo.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
      });
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.watermark?.image?.width)
        .toBe(80);
      const image = owner.locator('img');
      await expect(image).toHaveAttribute('src', /^blob:/);
      await expect
        .poll(() =>
          image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth === 80)
        )
        .toBe(true);
      const opacity = owner.getByRole('textbox', {
        name: label('gallery.videoReview.watermarkOpacity'),
        exact: true,
      });
      await opacity.fill('35');
      await opacity.press('Enter');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.watermark?.image?.opacity)
        .toBe(0.35);
      const withLogo = (await readNativeVideoProject(page))!;
      expect(withLogo.clips).toEqual(baseline.clips);
      expect(withLogo.assets).toHaveLength(baseline.assets.length + 1);
      const logo = getVideoProjectWatermarkAsset(withLogo)!;
      expect(logo.source.kind).toBe('project-asset');
      expect(withLogo.watermark!.image!.assetId).toBe(`project-asset:${logo.id}`);
      await mode('gallery.videoReview.watermarkNone').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.watermark?.mode)
        .toBe('none');
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await select();
      const reopened = (await readNativeVideoProject(page))!;
      expect(reopened.assets).toEqual(withLogo.assets);
      expect(reopened.clips).toEqual(baseline.clips);
      expect(reopened.watermark?.image).toEqual(withLogo.watermark!.image);
      const retainedRow = page.locator(`[data-material-id="${logo.id}"]`);
      await retainedRow.getByRole('button', { name: logo.name, exact: true }).click();
      await expect(page.locator('[data-ui="video-editor.source-viewer"]')).toBeVisible();
      const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      await playhead.press('Home');
      for (let frame = 0; frame < 6; frame++) await playhead.press('ArrowRight');
      const time = Number(await playhead.getAttribute('aria-valuenow'));
      expect(time).toBeGreaterThan(0);
      await page.locator('[data-ui="video-editor.inspector.close"]').click();
      await expect(owner).toBeHidden();
      await retainedRow.locator('[data-ui="video-editor.materials.show-use"] button').click();
      const uses = page.getByRole('listbox');
      await expect(
        uses.getByRole('option', {
          name: label('videoEditor.sidebar.materialsSceneUse'),
          exact: true,
        })
      ).toHaveCount(0);
      await uses
        .getByRole('option', { name: label('gallery.videoReview.watermark'), exact: true })
        .click();
      await expect(owner).toBeVisible();
      await expect(
        page
          .locator('[data-ui="video-editor.inspector.categories"] nav')
          .getByRole('button', { name: label('gallery.videoReview.watermark'), exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-ui="video-editor.source-viewer"]')).toBeHidden();
      expect(Number(await playhead.getAttribute('aria-valuenow'))).toBeCloseTo(time, 5);
      await expect(page.locator('[data-ui="video-editor.materials.remove-unused"]')).toBeDisabled();
      expect((await readNativeVideoProject(page))?.watermark?.mode).toBe('none');
      await page.screenshot({
        path: info.outputPath('watermark-material-use.png'),
        fullPage: false,
      });
      await mode('gallery.videoReview.watermarkText').click();
      await expect(text).toHaveValue('Accepted mark');
      await expect(mode('gallery.videoReview.watermarkBold')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await page.screenshot({ path: info.outputPath('watermark-reopened.png'), fullPage: false });
      if (index === 0) {
        await page.setViewportSize({ width: 1200, height: 560 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
      }
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
