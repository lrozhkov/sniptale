import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import {
  addReviewFocus,
  seedReviewVideo,
  clickReviewExport,
  persistedFocus,
} from '../support/quick-editor-media-fixture';

async function seek(page: Page, time: number) {
  const plane = page.locator('[data-ui="gallery.videoReview.timePlane"]');
  const rulerNode = plane.locator('[data-ui="gallery.videoReview.ruler"]');
  await rulerNode.scrollIntoViewIfNeeded();
  const ruler = await rulerNode.boundingBox();
  if (!ruler) throw new Error('Timeline ruler is unavailable');
  const duration = Number(await plane.getAttribute('aria-valuemax'));
  await page.mouse.click(ruler.x + (ruler.width * time) / duration, ruler.y + 12);
}

for (const variant of [
  { locale: 'en', theme: 'light' },
  { locale: 'ru', theme: 'dark' },
  { locale: 'en', theme: 'light', viewport: { width: 1200, height: 560 } },
] as const) {
  test(`quick editor overlapping Focus Border (${variant.locale}${'viewport' in variant ? ', below minimum' : ''})`, async ({
    page,
  }, info) => {
    if ('viewport' in variant) await page.setViewportSize(variant.viewport);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 4 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await seek(page, 0.5);
      await addReviewFocus(page);
      const blocks = dialog.locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]');
      await expect(blocks).toHaveCount(1);
      const toolbar = dialog.locator('[data-ui="gallery.videoReview.editingTools"]');
      const focusSelector = toolbar.getByRole('button', {
        name: label('gallery.videoReview.focusType'),
        exact: true,
      });
      await expect(focusSelector).toHaveCount(0);
      await button('gallery.videoReview.focusRangeTool').click();
      await expect(focusSelector).toBeVisible();
      await toolbar
        .getByRole('button', { name: label('gallery.videoReview.focusType'), exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (
              await page
                .getByRole('option', {
                  name: label('gallery.videoReview.zoomRegionLabel'),
                  exact: true,
                })
                .boundingBox()
            )?.height ?? 100
        )
        .toBeLessThan(50);
      await page.screenshot({ path: info.outputPath('focus-type-menu.png'), fullPage: false });
      await page
        .getByRole('option', { name: label('gallery.videoReview.focusBorder'), exact: true })
        .click();
      await addReviewFocus(page);
      await expect(blocks).toHaveCount(2);
      const inspector = dialog.locator('[data-ui="gallery.videoReview.zoomInspector"]');
      await expect(
        inspector
          .locator('[data-ui="gallery.videoReview.focusType"]')
          .getByRole('button', { name: label('gallery.videoReview.zoomRegionLabel'), exact: true })
      ).toBeDisabled();
      await expect(
        inspector.getByText(label('gallery.videoReview.focusZoomConflict'), { exact: true })
      ).toBeVisible();
      const resetPosition = inspector.getByRole('button', {
        name: label('gallery.videoReview.zoomResetPosition'),
        exact: true,
      });
      const removeFocus = inspector.getByRole('button', {
        name: label('gallery.videoReview.zoomDelete'),
        exact: true,
      });
      await removeFocus.scrollIntoViewIfNeeded();
      await expect(removeFocus).toBeVisible();
      const resetSize = await resetPosition.evaluate((node) => ({
        height: node.getBoundingClientRect().height,
        padding: getComputedStyle(node).paddingInline,
      }));
      const removeSize = await removeFocus.evaluate((node) => ({
        height: node.getBoundingClientRect().height,
        padding: getComputedStyle(node).paddingInline,
      }));
      expect(removeSize).toEqual(resetSize);
      expect(removeSize.height).toBe(32);
      await page.screenshot({
        path: info.outputPath('inspector-footer-actions.png'),
        fullPage: false,
      });
      const duplicateFocus = inspector.getByRole('button', {
        name: label('gallery.videoReview.focusDuplicate'),
        exact: true,
      });
      await duplicateFocus.click();
      await expect(blocks).toHaveCount(3);
      await page.screenshot({ path: info.outputPath('focus-copy.png'), fullPage: false });
      await button('gallery.videoReview.undo').click();
      await expect(blocks).toHaveCount(2);
      await button('gallery.videoReview.redo').click();
      await expect(blocks).toHaveCount(3);
      await blocks.last().click();
      await removeFocus.click();
      await expect(blocks).toHaveCount(2);
      await blocks.last().click();
      const width = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.borderWidth'),
        exact: true,
      });
      await expect.poll(async () => (await persistedFocus(page))?.border?.width).toBe(3);
      await width.fill('6');
      await width.press('Enter');
      await expect.poll(async () => (await persistedFocus(page))?.border?.width).toBe(6);
      await button('gallery.videoReview.undo').click();
      await expect(width).toHaveValue('3');
      await button('gallery.videoReview.redo').click();
      await expect(width).toHaveValue('6');
      const entrance = inspector.getByRole('group', {
        name: label('gallery.videoReview.zoomTransitionIn'),
        exact: true,
      });
      await entrance
        .getByRole('button', { name: label('gallery.videoReview.borderDrawing'), exact: true })
        .click();
      await entrance
        .getByRole('button', {
          name: label('gallery.videoReview.borderCounterclockwise'),
          exact: true,
        })
        .click();
      await page.screenshot({
        path: info.outputPath('border-counterclockwise-label.png'),
        fullPage: false,
      });
      const hold = inspector.getByRole('group', {
        name: label('gallery.videoReview.borderHold'),
        exact: true,
      });
      await expect(
        hold.getByRole('button', { name: label('gallery.videoReview.borderRotation'), exact: true })
      ).toHaveCount(0);
      await hold
        .getByRole('button', { name: label('gallery.videoReview.borderPulse'), exact: true })
        .click();
      const speed = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.borderSpeed'),
        exact: true,
      });
      await expect(speed).toHaveValue('1');
      await expect(
        inspector.getByRole('textbox', {
          name: label('gallery.videoReview.borderSegmentPercent'),
          exact: true,
        })
      ).toHaveCount(0);
      await speed.fill('0.5');
      await speed.press('Enter');
      await expect.poll(async () => (await persistedFocus(page))?.border?.period).toBe(4);
      const style = inspector.getByRole('button', {
        name: label('gallery.videoReview.borderStyle'),
        exact: true,
      });
      await style.click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.borderStyle_dashed'), exact: true })
        .click();
      await hold
        .getByRole('button', { name: label('gallery.videoReview.borderRotation'), exact: true })
        .click();
      await hold
        .getByRole('button', {
          name: label('gallery.videoReview.borderCounterclockwise'),
          exact: true,
        })
        .click();
      await style.click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.borderStyle_solid'), exact: true })
        .click();
      await expect(
        hold.getByRole('button', { name: label('gallery.videoReview.borderStill'), exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(speed).toHaveCount(0);
      await style.click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.borderStyle_dashed'), exact: true })
        .click();
      await hold
        .getByRole('button', { name: label('gallery.videoReview.borderRotation'), exact: true })
        .click();
      await hold
        .getByRole('button', {
          name: label('gallery.videoReview.borderCounterclockwise'),
          exact: true,
        })
        .click();
      await expect(speed).toHaveValue('0.5');
      const segmentSize = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.borderSegmentPercent'),
        exact: true,
      });
      await expect(segmentSize).toHaveValue('100');
      await segmentSize.fill('65');
      await segmentSize.press('Enter');
      await expect.poll(async () => (await persistedFocus(page))?.border?.segmentPercent).toBe(65);
      await speed.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('focus-border-animation-controls.png'),
        fullPage: false,
      });
      const rows = await blocks.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().y)
      );
      expect(new Set(rows).size).toBe(2);
      const focusTool = button('gallery.videoReview.focusRangeTool');
      if ((await focusTool.getAttribute('aria-pressed')) !== 'true') await focusTool.click();
      await toolbar
        .getByRole('button', { name: label('gallery.videoReview.focusType'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.focusSpotlight'), exact: true })
        .click();
      await addReviewFocus(page);
      await addReviewFocus(page);
      await expect(blocks).toHaveCount(4);
      await blocks.filter({ hasText: label('gallery.videoReview.focusBorder') }).click();
      await button('gallery.videoReview.pointerTool').click();
      await expect(focusSelector).toHaveCount(0);
      await seek(page, 1.5);
      await expect
        .poll(async () =>
          dialog
            .locator('[data-ui="gallery.videoReview.stage"] video')
            .evaluate((node: HTMLVideoElement) => node.currentTime)
        )
        .toBeGreaterThan(1.4);
      await button('gallery.videoReview.scene').click();
      await button('windowHeader.browser').click();
      await button('gallery.videoReview.backgroundSolid').click();
      const padding = dialog.getByRole('textbox', {
        name: label('gallery.videoReview.backgroundPadding'),
        exact: true,
      });
      await padding.fill('8');
      await padding.press('Enter');
      await button(
        variant.locale === 'en'
          ? 'gallery.videoReview.backgroundZoomContent'
          : 'gallery.videoReview.backgroundZoomWindow'
      ).click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.stage"] img')).toHaveCount(1);
      await expect(
        dialog.locator(
          '[data-ui="gallery.videoReview.stage"] [data-ui="gallery.videoReview.border"]'
        )
      ).toBeVisible();
      await blocks
        .filter({ hasText: label('gallery.videoReview.zoomRegionLabel') })
        .first()
        .click();
      await inspector
        .getByRole('button', { name: label('gallery.videoReview.zoomPreviewResult'), exact: true })
        .click();
      const zoomScale = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.zoomScale'),
        exact: true,
      });
      await zoomScale.fill('1');
      await zoomScale.press('Enter');
      // Both overlay types must reach the decoration, not stop at the first video row.
      for (const type of [
        'gallery.videoReview.focusSpotlight',
        'gallery.videoReview.focusBorder',
      ] as const) {
        await blocks
          .filter({ hasText: label(type) })
          .first()
          .click();
        const frame = dialog.locator('[data-ui="gallery.videoReview.stage"] [data-focus-frame]');
        await frame.focus();
        for (let i = 0; i < 3; i++) await frame.press('Shift+ArrowUp');
        const header = dialog.locator('[data-ui="gallery.videoReview.stage"] img');
        await expect
          .poll(async () =>
            Math.abs((await frame.boundingBox())!.y - (await header.boundingBox())!.y)
          )
          .toBeLessThan(1);
        await expect(inspector.locator('[data-ui="gallery.videoReview.previewMode"]')).toHaveCount(
          0
        );
        await expect(
          inspector.locator('[data-ui="gallery.videoReview.zoomPreview"]')
        ).toHaveAttribute('data-view', 'area');
        const areaFrame = inspector.locator(
          '[data-ui="gallery.videoReview.zoomPreview"] [data-focus-frame]'
        );
        await expect(areaFrame).toBeVisible();
        expect(
          parseFloat(await areaFrame.evaluate((node) => (node as HTMLElement).style.top))
        ).toBeLessThan(10);
      }
      await page.screenshot({ path: info.outputPath('focus-border-overlap.png'), fullPage: false });
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(blocks).toHaveCount(4);
      await blocks.filter({ hasText: label('gallery.videoReview.focusBorder') }).click();
      await expect(width).toHaveValue('6');
      await expect(segmentSize).toHaveValue('65');
      await expect(speed).toHaveValue('0.5');
      await expect(
        hold.getByRole('button', {
          name: label('gallery.videoReview.borderCounterclockwise'),
          exact: true,
        })
      ).toHaveAttribute('aria-pressed', 'true');
      await hold
        .getByRole('button', { name: label('gallery.videoReview.borderRipple'), exact: true })
        .click();
      await expect(
        hold.getByRole('button', { name: label('gallery.videoReview.borderRipple'), exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(segmentSize).toHaveCount(0);
      await button('gallery.videoReview.undo').click();
      await expect(
        hold.getByRole('button', {
          name: label('gallery.videoReview.borderCounterclockwise'),
          exact: true,
        })
      ).toHaveAttribute('aria-pressed', 'true');
      await button('gallery.videoReview.redo').click();
      await expect(
        hold.getByRole('button', { name: label('gallery.videoReview.borderRipple'), exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await hold.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('border-ripple-controls.png'),
        fullPage: false,
      });
      if (page.viewportSize()!.width === 1920) {
        const scroll = dialog.locator('.review-inspector-scroll');
        const handle = dialog.locator('[data-ui="gallery.videoReview.resizeInspector"]');
        for (const target of [523, 524, 525]) {
          const contentWidth = () =>
            scroll.evaluate((node) => {
              const style = getComputedStyle(node);
              return (
                node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
              );
            });
          const current = await contentWidth();
          const box = (await handle.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 - (target - current), box.y + box.height / 2);
          await page.mouse.up();
          await expect.poll(contentWidth).toBe(target);
          await hold.scrollIntoViewIfNeeded();
          await expect(hold).toBeVisible();
          await page.screenshot({
            path: info.outputPath(`border-ripple-inspector-${target}.png`),
            fullPage: false,
          });
        }
      }

      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await blocks.filter({ hasText: label('gallery.videoReview.focusBorder') }).click();
      await expect(
        hold.getByRole('button', { name: label('gallery.videoReview.borderRipple'), exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      const downloading = page.waitForEvent('download');
      await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
      const download = await downloading;
      await download.saveAs(info.outputPath('focus-border.webm'));
      expect(await download.failure()).toBeNull();
      const encoded = (await readFile(info.outputPath('focus-border.webm'))).toString('base64');
      const orangePixels = await page.evaluate(async (body) => {
        const url = URL.createObjectURL(
          new Blob([Uint8Array.from(atob(body), (c) => c.charCodeAt(0))], { type: 'video/webm' })
        );
        const video = document.createElement('video');
        video.muted = true;
        try {
          await new Promise<void>((resolve, reject) => {
            video.onloadeddata = () => resolve();
            video.onerror = () => reject(new Error('Export decode failed'));
            video.src = url;
          });
          await new Promise<void>((resolve) => {
            video.onseeked = () => resolve();
            video.currentTime = 1.5;
          });
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext('2d')!;
          context.drawImage(video, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let count = 0;
          let headerCount = 0;
          for (let i = 0; i < pixels.length; i += 4)
            if (
              pixels[i]! > 225 &&
              pixels[i + 1]! > 100 &&
              pixels[i + 1]! < 170 &&
              pixels[i + 2]! < 40
            ) {
              count++;
              if (Math.floor(i / 4 / canvas.width) < 24) headerCount++;
            }
          return { count, headerCount };
        } finally {
          video.removeAttribute('src');
          video.load();
          URL.revokeObjectURL(url);
        }
      }, encoded);
      expect(orangePixels.count).toBeGreaterThan(100);
      expect(orangePixels.headerCount).toBeGreaterThan(5);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

test('Focus compositor produces union holes and a partial clockwise Border in Chromium', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/focus-render-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const pixels = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      const module = await import(url);
      return module.probe();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  expect(pixels).toMatchObject({
    outside: 204,
    firstOnly: 0,
    overlap: 0,
    secondOnly: 0,
    top: 255,
    bottom: 0,
    right: 0,
  });
  expect(pixels.motion.draw).toEqual([
    { direction: 'draw', topRight: 255, topLeft: 0 },
    { direction: 'draw-ccw', topRight: 0, topLeft: 255 },
  ]);
  expect(pixels.motion.erase).toEqual([
    { direction: 'erase', topRight: 0, topLeft: 255 },
    { direction: 'erase-ccw', topRight: 255, topLeft: 0 },
  ]);
  for (const entrance of pixels.start) {
    expect(entrance.samples[0].painted).toBe(0);
    const early = entrance.samples[1];
    expect(early.center).toBe(255);
    expect(early.cap).toBeGreaterThan(150);
    expect(early.capOutside).toBe(0);
    expect(early.corner).toBe(0);
    expect(early.right).toBe(entrance.reveal === 'draw' ? 255 : 0);
    expect(early.left).toBe(entrance.reveal === 'draw-ccw' ? 255 : 0);
    expect(entrance.samples[4].painted).toBeGreaterThan(early.painted * 10);
  }
  await page.screenshot({ path: info.outputPath('border-early-frames.png'), fullPage: false });
  expect(pixels.motion.oppositePixels).toBeGreaterThan(100);
  for (const pulse of pixels.motion.pulse) {
    expect(pulse.fullAlpha).toBeGreaterThan(0);
    expect(pulse.lowAlpha / pulse.fullAlpha).toBeGreaterThan(0.3);
    expect(pulse.lowAlpha / pulse.fullAlpha).toBeLessThan(0.4);
  }
  for (const pattern of pixels.motion.moving) {
    expect(pattern.painted).toBeGreaterThan(100);
    if (pattern.style === 'solid') expect(pattern.changed).toBe(0);
    else expect(pattern.changed).toBeGreaterThan(100);
  }
  for (const stroke of pixels.patterned) {
    expect(stroke.partial).toBeGreaterThan(0);
    expect(stroke.full).toBeGreaterThan(stroke.partial * 2);
  }
});

test('Ripple keeps the original border fixed while an outline expands and fades', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/focus-render-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const samples = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return (await import(url)).probeRipple();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  expect(samples.map((sample: { base: number }) => sample.base)).toEqual([255, 255, 255, 255, 255]);
  expect(samples.map((sample: { frames: number }) => sample.frames)).toEqual([1, 2, 2, 2, 1]);
  expect(samples[1].outermost).toBeGreaterThan(samples[2].outermost);
  expect(samples[2].outermost).toBeGreaterThan(samples[3].outermost);
  expect(samples[2].echo).toBeGreaterThan(samples[1].echo);
  expect(samples[2].echo).toBeGreaterThan(samples[3].echo);
  await page.screenshot({ path: info.outputPath('border-ripple.png'), fullPage: false });
});
