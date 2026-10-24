import { expect, test, type Page, type TestInfo } from '@playwright/test';
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
  test(
    [
      'linked webcam acquisition, editing and playback (',
      String(variant.locale),
      String('lowCadence' in variant ? ', 10fps narrow' : ''),
      ')',
    ].join(''),
    async ({ page }, info) => {
      test.setTimeout(180_000);
      if ('viewport' in variant) await page.setViewportSize(variant.viewport);
      const host = await startHostServer();
      const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      const toggle = async () => {
        const enabled = dialog.getByRole('switch', {
          name: `${label('gallery.videoReview.trackEnabled')}: ${label('gallery.videoReview.webcam')}`,
        });
        if (!(await enabled.isVisible())) await button('gallery.videoReview.trackSettings').click();
        await enabled.click();
      };
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
        await toggle();
        await button('gallery.videoReview.webcamSettings').click();
        const track = dialog.locator('[data-ui="gallery.videoReview.webcamTrack"]');
        const overlay = dialog.locator('[data-ui="gallery.videoReview.webcamOverlay"]');
        const inspector = dialog.locator('[data-ui="gallery.videoReview.webcamInspector"]');
        await expect(track).toBeVisible();
        await expect(track).toHaveCSS('height', '36px');
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
            name: `${label('gallery.videoReview.webcamPosition')} 1`,
          })
        ).toBeVisible();
        await refineCameraPoint(page, variant.locale, info);
        await toggle();
        await expect(track).toBeVisible();
        await expect(overlay).toHaveCount(0);
        await toggle();
        await expect(
          track.getByRole('button', {
            name: `${label('gallery.videoReview.webcamPosition')} 1`,
          })
        ).toBeVisible();
        await button('gallery.videoReview.advancedEditing').click();
        await expect(track).toHaveCount(0);
        await expect(overlay).toHaveCount(0);
        await button('gallery.videoReview.advancedEditing').click();
        await expect(
          track.getByRole('button', {
            name: `${label('gallery.videoReview.webcamPosition')} 1`,
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
        // Recovery must follow source clock progress even without a second native playing event.
        await dialog
          .locator('video')
          .first()
          .evaluate((video) => video.dispatchEvent(new Event('waiting')));
        await expect.poll(async () => (await painted())[3]).toBe(255);
        await expect.poll(async () => (await painted())[0]).toBeGreaterThan(30);
        await dialog
          .locator('video')
          .first()
          .evaluate((video) => video.pause());
        await button('gallery.videoReview.webcamSettings').click();
        await track.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath('webcam-offset-track.png'),
          fullPage: false,
        });
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
        await page.mouse.move(
          lane.x + (lane.width * 2.5) / sourceDuration,
          lane.y + lane.height / 2
        );
        await page.mouse.down();
        await page.mouse.move(
          lane.x + (lane.width * 3.5) / sourceDuration,
          lane.y + lane.height / 2,
          { steps: 6 }
        );
        await page.mouse.up();
        const hidden = track.getByRole('button', {
          name: label('gallery.videoReview.webcamHidden'),
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
          (await readWebcamWorkspace(page))!.history.some(
            (operation) => operation.target === 'edit'
          )
        ).toBe(false);
        await page.screenshot({
          path: info.outputPath('webcam-hidden-inspector.png'),
          fullPage: false,
        });
        if (!('lowCadence' in variant) && variant.locale === 'en') {
          await hidden.click();
          const resize = dialog.getByRole('separator', {
            name: label('videoEditor.sidebar.resizeInspector'),
          });
          await resize.focus();
          await resize.press('End');
          const sections = inspector.locator('[data-ui="gallery.videoReview.inspectorSections"]');
          await expect(sections.locator('.review-inspector-section')).toHaveCount(1);
          await expect
            .poll(() =>
              sections.evaluate(
                (node) => getComputedStyle(node).gridTemplateColumns.split(' ').length
              )
            )
            .toBe(1);
          const section = (await sections.locator('.review-inspector-section').boundingBox())!;
          const available = (await sections.boundingBox())!;
          expect(section.width).toBeCloseTo(available.width, 0);
          await page.screenshot({
            path: info.outputPath('webcam-hidden-wide.png'),
            fullPage: false,
          });
          await resize.press('Home');
        }
        await page.reload();
        await expect(dialog).toBeVisible();
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
        await page.screenshot({
          path: info.outputPath('webcam-circle-shadow.png'),
          fullPage: false,
        });
        await page.reload();
        await expect(dialog).toBeVisible();
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
    }
  );
}

test('webcam inspector preserves controls across adaptive columns and panel heights', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
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
    await button('gallery.videoReview.trackSettings').click();
    await dialog
      .getByRole('switch', {
        name: `${label('gallery.videoReview.trackEnabled')}: ${label('gallery.videoReview.webcam')}`,
      })
      .click();
    await button('gallery.videoReview.webcamSettings').click();
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
      const mirror = inspector.getByRole('switch', {
        name: label('gallery.videoReview.webcamMirror'),
      });
      if ((await mirror.getAttribute('aria-checked')) === 'false') await mirror.click();
      await expect(mirror).toHaveAttribute('aria-checked', 'true');
      await inspector
        .getByRole('button', { name: label('gallery.videoReview.webcamLayout'), exact: true })
        .click();
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
      await expect
        .poll(() =>
          sections
            .locator('.review-inspector-section')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-section')))
        )
        .toEqual(['webcam-layout', 'webcam-appearance', 'webcam-timing', 'actions']);
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

/** Actual pointer ownership, crop preview and per-point persistence in the short-height inspector. */
async function refineCameraPoint(page: Page, locale: 'en' | 'ru', info: TestInfo) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const dialog = page.locator('dialog');
  const track = dialog.locator('[data-ui="gallery.videoReview.webcamTrack"]');
  await track.scrollIntoViewIfNeeded();
  const marker = track.locator('[data-ui="gallery.videoReview.webcamPosition"]').first();
  const before = (await marker.boundingBox())!;
  await marker.hover();
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 - 45, before.y + before.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect.poll(async () => (await marker.boundingBox())!.x).toBeLessThan(before.x - 30);
  const moved = (await marker.boundingBox())!;
  await marker.hover();
  await page.mouse.down();
  await page.mouse.move(moved.x + 35, moved.y + moved.height / 2, { steps: 3 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await marker.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
  await ruler.hover({ position: { x: 400, y: 10 } });
  await expect(dialog.locator('[data-ui="gallery.videoReview.hoverTime"]')).toBeVisible();
  await track.hover({ position: { x: 100, y: 10 } });
  await expect(dialog.locator('[data-ui="gallery.videoReview.hoverTime"]')).toHaveCount(0);
  await marker.click();
  const inspector = dialog.locator('[data-ui="gallery.videoReview.webcamInspector"]');
  const zoom = inspector.getByRole('textbox', {
    name: label('videoEditor.sidebar.cameraCropZoom'),
    exact: true,
  });
  await zoom.fill('2');
  await zoom.press('Enter');
  const crop = inspector.locator('[data-ui="gallery.videoReview.webcamCrop"] button').first();
  await expect(crop).toBeEnabled();
  await crop.scrollIntoViewIfNeeded();
  const box = (await crop.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 8, { steps: 3 });
  await page.mouse.up();
  const pan = inspector.getByRole('textbox', {
    name: label('gallery.videoReview.webcamCropX'),
    exact: true,
  });
  await expect(pan).not.toHaveValue('0');
  await inspector
    .getByRole('button', { name: label('gallery.videoReview.webcamTransition'), exact: true })
    .click();
  await page
    .getByRole('option', { name: label('videoEditor.sidebar.cameraTransitionShrink'), exact: true })
    .click();
  await crop.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('webcam-crop-position.png'), fullPage: false });
  await expect
    .poll(async () => {
      const workspace = await readWebcamWorkspace(page);
      const last = workspace?.history
        .slice(0, workspace.cursor)
        .findLast((operation) => operation.target === 'advancedContent');
      return last?.target === 'advancedContent'
        ? last.after.webcam?.positions[0]?.crop?.zoom
        : undefined;
    })
    .toBe(2);
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  for (const manual of [false, true]) {
    test(`camera retry restores durationless WebM ${viewport.width} manual=${manual}`, async ({
      page,
    }, info) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      const host = await startHostServer();
      const locale = viewport.width === 1280 ? 'ru' : 'en';
      const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
      try {
        await applyHarnessBootstrap(page, {
          preserveMediaLibrary: true,
          storage: {
            'sniptale-locale-preference': locale,
            'sniptale-theme-preference': 'dark',
            sniptale_quick_preview_preferences: {
              rasterPreset: 'current',
              frameRate: 'current',
              pausedQuality: manual ? 'detailed' : 'same',
              showFrameRate: false,
            },
          },
        });
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=dark`);
        await page.locator('[data-ui="gallery.page.root"]').waitFor();
        await seedReviewWebcamBundle(page);
        await page.evaluate(async () => {
          const objects = await (
            await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
          ).getDirectoryHandle('objects');
          const handle = await objects.getFileHandle('webcam-clock-asset');
          const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
          const index = bytes.findIndex(
            (value, i) => value === 0x44 && bytes[i + 1] === 0x89 && bytes[i + 2] === 0x88
          );
          if (index < 0) throw new Error('Fixture duration element not found');
          // Replace the 11-byte Duration element with an equal-length EBML Void.
          bytes[index] = 0xec;
          bytes[index + 1] = 0x89;
          const video = document.createElement('video');
          video.src = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }));
          await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = reject;
          });
          if (video.duration !== Infinity) throw new Error('Fixture must omit native duration');
          URL.revokeObjectURL(video.src);
          const writer = await handle.createWritable();
          await writer.write(bytes);
          await writer.close();
        });
        await page.reload();
        await page.getByRole('button', { name: /: Screen$/ }).click();
        const dialog = page.locator('dialog');
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
        await dialog
          .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
          .click();
        const enabled = dialog.getByRole('switch', {
          name: `${label('gallery.videoReview.trackEnabled')}: ${label('gallery.videoReview.webcam')}`,
        });
        if (!(await enabled.isVisible()))
          await dialog
            .getByRole('button', { name: label('gallery.videoReview.trackSettings'), exact: true })
            .click();
        const cameras = await page.evaluateHandle(() => {
          const videos: HTMLVideoElement[] = [];
          document.createElement = new Proxy(document.createElement, {
            apply(target, receiver, args) {
              const element = Reflect.apply(target, receiver, args);
              if (element instanceof HTMLVideoElement) videos.push(element);
              return element;
            },
          });
          return videos;
        });
        await enabled.click();
        await expect
          .poll(() =>
            cameras.evaluate((videos) =>
              videos.some(
                (video) =>
                  !video.isConnected && video.readyState >= 2 && video.src.startsWith('blob:')
              )
            )
          )
          .toBe(true);
        const stage = dialog.locator('[data-ui="gallery.videoReview.stage"]');
        const canvas = manual
          ? stage.locator('[data-ui="gallery.videoReview.manualPreview"] canvas')
          : stage.locator('[data-ui="gallery.videoReview.webcamOverlay"] canvas');
        const painted = async () =>
          canvas.evaluateAll((nodes) =>
            nodes.some((node) => {
              if (!(node instanceof HTMLCanvasElement) || !node.width || !node.height) return false;
              return (
                node
                  .getContext('2d')!
                  .getImageData(Math.floor(node.width * 0.85), Math.floor(node.height * 0.85), 1, 1)
                  .data[3] === 255
              );
            })
          );
        await expect.poll(painted).toBe(true);
        await cameras.evaluate((videos) => {
          const video = videos.findLast(
            (video) =>
              !video.isConnected && video.duration === Infinity && video.src.startsWith('blob:')
          );
          if (!video) throw new Error('Camera decoder missing');
          video.dispatchEvent(new Event('error'));
        });
        const failure = stage.getByRole('alert');
        await expect(failure).toHaveCount(1);
        await expect(failure).toContainText(label('gallery.videoReview.webcamFailed'));
        await expect(
          stage.getByText(label('gallery.videoReview.previewFailed'), { exact: true })
        ).toHaveCount(0);
        const notice = await failure.screenshot();
        const noticeVisible = await page.evaluate(async (bytes) => {
          const bitmap = await createImageBitmap(
            new Blob([Uint8Array.from(bytes)], { type: 'image/png' })
          );
          try {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d')!;
            context.drawImage(bitmap, 0, 0);
            return context
              .getImageData(0, 0, canvas.width, canvas.height)
              .data.some((value, index) => index % 4 !== 3 && value > 8);
          } finally {
            bitmap.close();
          }
        }, Array.from(notice));
        expect(noticeVisible, 'Camera recovery must remain visible above the initial fade').toBe(
          true
        );
        await page.screenshot({
          path: info.outputPath('camera-single-failure.png'),
          fullPage: false,
        });
        await failure
          .getByRole('button', { name: label('gallery.videoReview.retry'), exact: true })
          .click();
        await expect(stage.getByRole('alert')).toHaveCount(0);
        await expect.poll(painted).toBe(true);
        await stage
          .locator('video')
          .first()
          .evaluate((video) => {
            video.currentTime = 5;
          });
        await expect.poll(painted).toBe(true);
        await expect(stage.getByRole('alert')).toHaveCount(0);
        await page.screenshot({
          path: info.outputPath('camera-durationless-restored.png'),
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
