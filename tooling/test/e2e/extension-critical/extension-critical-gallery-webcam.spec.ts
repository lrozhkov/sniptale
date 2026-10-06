import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewWebcamBundle } from '../support/quick-editor-media-fixture';
import { readWebcamWorkspace } from '../support/quick-editor-webcam-proof';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'en', theme: 'light' },
  { locale: 'ru', theme: 'dark' },
  { locale: 'en', theme: 'light', lowCadence: true, viewport: { width: 1200, height: 560 } },
] as const) {
  test(`linked webcam acquisition, editing and playback (${variant.locale}${'lowCadence' in variant ? ', 10fps narrow' : ''})`, async ({
    page,
  }, info) => {
    if ('viewport' in variant) await page.setViewportSize(variant.viewport);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    const toggle = () =>
      dialog
        .getByRole('button', { name: label('gallery.videoReview.webcam'), exact: true })
        .and(dialog.locator('[aria-label]'));
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewWebcamBundle(
        page,
        'lowCadence' in variant ? 'review-webcam-clock-10fps.webm' : undefined
      );
      await page.reload();
      await page.getByRole('button', { name: /: Screen$/ }).click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      if ('lowCadence' in variant)
        await dialog
          .locator('video')
          .first()
          .evaluate((video) => {
            video.currentTime = 0.09;
          });
      await toggle().click();
      const track = dialog.locator('[data-ui="gallery.videoReview.webcamTrack"]');
      const overlay = dialog.locator('[data-ui="gallery.videoReview.webcamOverlay"]');
      const inspector = dialog.locator('[data-ui="gallery.videoReview.webcamInspector"]');
      await expect(track).toBeVisible();
      await expect(track).toHaveCSS('height', '40px');
      await button('gallery.videoReview.compactTrackHeight').click();
      await expect(track).toHaveCSS('height', '28px');
      await expect(inspector).toBeVisible();
      await expect(overlay.getByRole('alert')).toHaveCount(0);
      const painted = () =>
        overlay.locator('canvas').evaluate((canvas) => {
          const context = canvas.getContext('2d')!;
          const pixel = context.getImageData(
            Math.floor(canvas.width * 0.85),
            Math.floor(canvas.height * 0.85),
            1,
            1
          ).data;
          return [...pixel];
        });
      await expect.poll(async () => (await painted())[3]).toBe(255);
      await page.screenshot({ path: info.outputPath('webcam-initial.png'), fullPage: false });
      await dialog
        .locator('video')
        .first()
        .evaluate((video) => {
          video.currentTime = 5;
        });
      await expect.poll(async () => (await painted())[0]).toBeGreaterThan(90);
      await button('gallery.videoReview.webcamAddPosition').click();
      await expect(
        track.getByRole('button', {
          name: new RegExp(`${label('gallery.videoReview.webcamPosition')} 1`),
        })
      ).toBeVisible();
      await toggle().click();
      await expect(track).toHaveCount(0);
      await expect(overlay).toHaveCount(0);
      await toggle().click();
      await expect(
        track.getByRole('button', {
          name: new RegExp(`${label('gallery.videoReview.webcamPosition')} 1`),
        })
      ).toBeVisible();
      await button('gallery.videoReview.advancedEditing').click();
      await expect(track).toHaveCount(0);
      await expect(overlay).toHaveCount(0);
      await button('gallery.videoReview.advancedEditing').click();
      await expect(
        track.getByRole('button', {
          name: new RegExp(`${label('gallery.videoReview.webcamPosition')} 1`),
        })
      ).toBeVisible();
      await expect.poll(async () => (await painted())[3]).toBe(255);
      await page.screenshot({ path: info.outputPath('webcam-restored.png'), fullPage: false });
      await button('gallery.videoReview.webcamSettings').click();
      const offset = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.webcamOffset'),
        exact: true,
      });
      if (!(await offset.isVisible()))
        await inspector
          .getByRole('heading', { name: label('gallery.videoReview.webcamTiming'), exact: true })
          .click();
      await offset.fill('2');
      await offset.press('Enter');
      await dialog
        .locator('video')
        .first()
        .evaluate((video) => {
          video.currentTime = 1.8;
        });
      await expect.poll(async () => (await painted())[3]).toBe(0);
      await dialog
        .locator('video')
        .first()
        .evaluate((video) => video.play());
      await expect.poll(async () => (await painted())[3]).toBe(255);
      await expect.poll(async () => (await painted())[0]).toBeGreaterThan(30);
      await dialog
        .locator('video')
        .first()
        .evaluate((video) => video.pause());
      await button('gallery.videoReview.webcamSettings').click();
      await track.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('webcam-offset-track.png'), fullPage: false });
      const frame = overlay.locator('[data-focus-frame]');
      await expect(frame).toBeVisible();
      const initial = (await frame.boundingBox())!;
      await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
      await expect(frame).toHaveAttribute('data-controls-visible', 'true');
      await page.mouse.down();
      await page.mouse.move(
        initial.x + initial.width / 2 - 35,
        initial.y + initial.height / 2 - 20,
        { steps: 4 }
      );
      await expect(frame).toHaveAttribute('data-controls-visible', 'false');
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect((await frame.boundingBox())!.x).toBeCloseTo(initial.x, 0);
      await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        initial.x + initial.width / 2 - 35,
        initial.y + initial.height / 2 - 20,
        { steps: 4 }
      );
      await page.mouse.up();
      await expect.poll(async () => (await frame.boundingBox())!.x).toBeLessThan(initial.x - 25);
      const moved = (await frame.boundingBox())!;
      const grip = frame.locator('[data-resize="nw"]');
      await grip.hover();
      await page.mouse.down();
      await page.mouse.move(moved.x - 18, moved.y - 12, { steps: 4 });
      await page.mouse.up();
      await expect
        .poll(async () => (await frame.boundingBox())!.width)
        .toBeGreaterThan(moved.width + 10);
      await page.screenshot({ path: info.outputPath('webcam-canvas-edit.png'), fullPage: false });
      const canvasHandle = await overlay.locator('canvas').elementHandle();
      await button('videoEditor.stage.enterFullscreen').click();
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
      expect(await canvasHandle!.evaluate((canvas) => canvas.isConnected)).toBe(true);
      const fullPosition = (await frame.boundingBox())!;
      await frame.focus();
      await frame.press('ArrowLeft');
      await expect
        .poll(async () => (await frame.boundingBox())!.x)
        .toBeLessThan(fullPosition.x - 2);
      await dialog.locator('[data-ui="gallery.videoReview.fullscreen"]').click();
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
      expect(await canvasHandle!.evaluate((canvas) => canvas.isConnected)).toBe(true);
      await track.scrollIntoViewIfNeeded();
      const lane = (await track.boundingBox())!;
      const sourceDuration = Number(
        await dialog
          .locator('[data-ui="gallery.videoReview.timePlane"]')
          .getAttribute('aria-valuemax')
      );
      await dialog
        .locator('video')
        .first()
        .evaluate((video) => {
          video.currentTime = 3;
        });
      await expect
        .poll(() =>
          dialog
            .locator('video')
            .first()
            .evaluate((video) => video.seeking)
        )
        .toBe(false);
      await expect.poll(async () => (await painted())[3]).toBe(255);
      const beforeHideTime = await dialog
        .locator('video')
        .first()
        .evaluate((video) => video.currentTime);
      await page.mouse.move(lane.x + (lane.width * 2.5) / sourceDuration, lane.y + lane.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        lane.x + (lane.width * 3.5) / sourceDuration,
        lane.y + lane.height / 2,
        { steps: 6 }
      );
      await page.mouse.up();
      const hidden = track.getByRole('button', {
        name: new RegExp(label('gallery.videoReview.webcamHidden')),
      });
      await expect(hidden).toHaveCount(1);
      expect(
        await dialog
          .locator('video')
          .first()
          .evaluate((video) => video.currentTime)
      ).toBeCloseTo(beforeHideTime, 1);
      await expect.poll(async () => (await painted())[3]).toBe(0);
      await button('gallery.videoReview.undo').click();
      await expect(hidden).toHaveCount(0);
      await button('gallery.videoReview.redo').click();
      await expect(hidden).toHaveCount(1);
      await expect
        .poll(async () => {
          const workspace = await readWebcamWorkspace(page);
          const last = workspace?.history
            .slice(0, workspace.cursor)
            .findLast((operation) => operation.target === 'advancedContent');
          return last?.target === 'advancedContent' ? last.after.webcam?.hiddenRanges.length : 0;
        })
        .toBe(1);
      expect(
        (await readWebcamWorkspace(page))!.history.some((operation) => operation.target === 'edit')
      ).toBe(false);
      await page.screenshot({
        path: info.outputPath('webcam-hidden-inspector.png'),
        fullPage: false,
      });
      await page.reload();
      await page.getByRole('button', { name: /: Screen$/ }).click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(hidden).toHaveCount(1);
      await dialog
        .locator('video')
        .first()
        .evaluate((video) => {
          video.currentTime = 3.7;
        });
      await expect.poll(async () => (await painted())[3]).toBe(255);
      await button('gallery.videoReview.webcamSettings').click();
      const shape = inspector.getByRole('button', {
        name: label('videoEditor.sidebar.cameraShape'),
        exact: true,
      });
      await shape.click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.webcamCircle'), exact: true })
        .click();
      await expect(
        inspector.getByRole('textbox', {
          name: label('videoEditor.sidebar.cameraRoundness'),
          exact: true,
        })
      ).toHaveCount(0);
      const diameter = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.webcamDiameter'),
        exact: true,
      });
      await diameter.fill('30');
      await diameter.press('Enter');
      const circle = overlay.getByRole('group', {
        name: label('gallery.videoReview.webcamSettings'),
        exact: true,
      });
      await expect
        .poll(async () => {
          const rect = (await circle.boundingBox())!;
          return Math.abs(rect.width - rect.height);
        })
        .toBeLessThanOrEqual(1);
      const cameraPixel = async (outside: boolean) => {
        const box = (await circle.boundingBox())!;
        return overlay.locator('canvas').evaluate(
          (canvas, point) => {
            const rect = canvas.getBoundingClientRect();
            return [
              ...canvas
                .getContext('2d')!
                .getImageData(
                  Math.floor(((point.x - rect.x) * canvas.width) / rect.width),
                  Math.floor(((point.y - rect.y) * canvas.height) / rect.height),
                  1,
                  1
                ).data,
            ];
          },
          { x: outside ? box.x - 3 : box.x + box.width / 2, y: box.y + box.height / 2 }
        );
      };
      await expect.poll(async () => (await cameraPixel(false))[3]).toBe(255);
      expect((await cameraPixel(true))[3]).toBe(0);
      const centerBeforeShadow = await cameraPixel(false);
      const shadow = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.webcamShadow'),
        exact: true,
      });
      await shadow.fill('60');
      await shadow.press('Enter');
      await button('gallery.videoReview.webcamShadowColor').click();
      const color = page.getByRole('textbox', {
        name: label('gallery.videoReview.webcamShadowColor'),
        exact: true,
      });
      await color.fill('#123456ff');
      await color.press('Enter');
      await page.keyboard.press('Escape');
      await expect
        .poll(async () => {
          const workspace = await readWebcamWorkspace(page);
          const operation = workspace?.history
            .slice(0, workspace.cursor)
            .findLast((item) => item.target === 'advancedContent');
          return operation?.target === 'advancedContent'
            ? operation.after.webcam?.shadow?.color
            : null;
        })
        .toBe('#123456ff');
      await expect.poll(async () => (await cameraPixel(true))[3]).toBeGreaterThan(0);
      expect(await cameraPixel(false)).toEqual(centerBeforeShadow);
      await shadow.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('webcam-circle-shadow.png'), fullPage: false });
      await page.reload();
      await page.getByRole('button', { name: /: Screen$/ }).click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.webcamSettings').click();
      await expect(
        inspector.getByRole('textbox', {
          name: label('gallery.videoReview.webcamDiameter'),
          exact: true,
        })
      ).toHaveValue('30');
      await expect(
        inspector.getByRole('textbox', {
          name: label('gallery.videoReview.webcamShadow'),
          exact: true,
        })
      ).toHaveValue('60');
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

test('webcam inspector preserves controls across adaptive columns and panel heights', async ({
  page,
}, info) => {
  const host = await startHostServer();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  const dialog = page.locator('dialog');
  const button = (key: Parameters<typeof translate>[0]) =>
    dialog.getByRole('button', { name: label(key), exact: true });
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewWebcamBundle(page);
    await page.reload();
    await page.getByRole('button', { name: /: Screen$/ }).click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await button('gallery.videoReview.advancedEditing').click();
    await button('gallery.videoReview.webcam').click();
    const inspector = dialog.locator('[data-ui="gallery.videoReview.webcamInspector"]');
    const sections = inspector.locator('[data-ui="gallery.videoReview.inspectorSections"]');
    const width = dialog.getByRole('separator', {
      name: label('videoEditor.sidebar.resizeInspector'),
    });
    await expect(inspector).toBeVisible();
    const resize = async (target: typeof sections, size: number) => {
      const current = (await target.boundingBox())!.width;
      const handle = (await width.boundingBox())!;
      await page.mouse.move(handle.x + handle.width / 2, handle.y + 10);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2 + current - size, handle.y + 10);
      await page.mouse.up();
      await expect.poll(async () => Math.round((await target.boundingBox())!.width)).toBe(size);
      await expect
        .poll(() =>
          target.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length)
        )
        .toBe(size < 524 ? 1 : 2);
    };
    for (const fullHeight of [false, true]) {
      if (fullHeight) await button('videoEditor.app.panelFullHeight').click();
      for (const size of [523, 524, 525]) await resize(sections, size);
      await button('scenario.editor.inspectorShowSections').click();
      await inspector
        .getByRole('button', { name: label('gallery.videoReview.webcamLayout'), exact: true })
        .click();
      const layout = inspector.locator('[data-section="webcam-layout"] .review-inspector-columns');
      for (const size of [523, 524, 525]) await resize(layout, size);
      await inspector
        .getByRole('button', { name: label('gallery.videoReview.webcamAppearance'), exact: true })
        .click();
      const appearance = inspector.locator(
        '[data-section="webcam-appearance"] .review-inspector-columns'
      );
      for (const size of [523, 524, 525]) await resize(appearance, size);
      const select = async (
        key: Parameters<typeof translate>[0],
        option: Parameters<typeof translate>[0]
      ) => {
        await inspector.getByRole('button', { name: label(key), exact: true }).click();
        await page.getByRole('option', { name: label(option), exact: true }).click();
      };
      await select('videoEditor.sidebar.cameraShape', 'videoEditor.sidebar.cameraShapeEllipse');
      await expect(
        inspector.getByRole('textbox', {
          name: label('videoEditor.sidebar.cameraRoundness'),
          exact: true,
        })
      ).toHaveCount(0);
      await select('videoEditor.sidebar.cameraShape', 'videoEditor.sidebar.cameraShapeSoft');
      await select('gallery.videoReview.webcamMirror', 'gallery.videoReview.webcamMirrorOn');
      const zoom = inspector.getByRole('textbox', {
        name: label('videoEditor.sidebar.cameraCropZoom'),
        exact: true,
      });
      await zoom.fill('1.5');
      await zoom.press('Enter');
      const pan = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.webcamCropX'),
        exact: true,
      });
      await pan.fill('20');
      await pan.press('Enter');
      await expect(zoom).toHaveValue('1.5');
      await expect(pan).toHaveValue('20');
      await expect
        .poll(() =>
          dialog
            .locator('[data-ui="gallery.videoReview.webcamOverlay"] canvas')
            .evaluate(
              (canvas) =>
                canvas
                  .getContext('2d')!
                  .getImageData(
                    Math.floor(canvas.width * 0.85),
                    Math.floor(canvas.height * 0.85),
                    1,
                    1
                  ).data[3]
            )
        )
        .toBe(255);
      await page.screenshot({
        path: info.outputPath(`webcam-inspector-${fullHeight ? 'full' : 'short'}.png`),
        fullPage: false,
      });
      await button('scenario.editor.inspectorShowAll').click();
      await expect(sections.locator('.review-inspector-section')).toHaveCount(3);
      await button('gallery.videoReview.webcamDisable').scrollIntoViewIfNeeded();
      await expect(button('gallery.videoReview.webcamDisable')).toBeInViewport();
    }
    await expect
      .poll(async () => {
        const workspace = await readWebcamWorkspace(page);
        const operation = workspace?.history
          .slice(0, workspace.cursor)
          .findLast((entry) => entry.target === 'advancedContent');
        return operation?.target === 'advancedContent' ? operation.after.webcam : null;
      })
      .toMatchObject({ mirrored: true, appearance: { shape: 'soft', zoom: 1.5, panX: 0.2 } });
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
