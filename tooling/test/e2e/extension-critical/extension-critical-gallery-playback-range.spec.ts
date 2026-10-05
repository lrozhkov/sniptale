import { expect, test, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';

async function rulerDrag(page: Page, start: number, end: number) {
  const ruler = page.locator('[data-ui="gallery.videoReview.ruler"]');
  await ruler.scrollIntoViewIfNeeded();
  const rect = (await ruler.boundingBox())!;
  const duration = Number(await ruler.getAttribute('aria-valuemax'));
  await page.mouse.move(rect.x + (rect.width * start) / duration, rect.y + 15);
  await page.mouse.down();
  await page.mouse.move(rect.x + (rect.width * end) / duration, rect.y + 15, { steps: 6 });
  await page.mouse.up();
}

async function proveToolGroup(page: Page, selectorLabel: string, outputPath: string) {
  const toolbar = page.locator('[data-ui="gallery.videoReview.toolbar"]');
  const group = toolbar.locator('[data-ui="gallery.videoReview.toolGroup"][data-active]');
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAttribute('role', 'group');
  await expect(group).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const controls = group.locator('button');
  const bounds = (await group.boundingBox())!;
  expect(bounds.height).toBe(32);
  for (const control of await controls.all()) {
    const rect = (await control.boundingBox())!;
    expect(rect.y).toBe(bounds.y);
    expect(rect.height).toBe(bounds.height);
    expect(rect.x).toBeGreaterThanOrEqual(bounds.x);
    expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
  }
  await page.screenshot({ path: outputPath, fullPage: false });
  const selector = group.getByRole('button', { name: selectorLabel, exact: true });
  await expect(selector).toBeEnabled();
  await selector.focus();
  await selector.press('Enter');
  await expect(selector).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('listbox')).toBeInViewport();
  await page.screenshot({ path: outputPath.replace('.png', '-menu.png'), fullPage: false });
  await page.keyboard.press('Escape');
  await expect(selector).toBeFocused();
  await expect(selector).toHaveAttribute('aria-expanded', 'false');
  await selector.hover();
  await expect(selector).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
  await expect(selector).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
}

async function proveToolbarBoundary(page: Page, outputPath: (name: string) => string) {
  const original = page.viewportSize()!;
  const toolbar = page.locator('[data-ui="gallery.videoReview.toolbar"]');
  const stateAt = async (width: number) => {
    await page.setViewportSize({ width, height: original.height });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    return toolbar.evaluate(
      (node) => `${node.getAttribute('data-layout')}:${node.getAttribute('data-labels')}`
    );
  };
  let low = 1280,
    high = 1920;
  const first = await stateAt(low);
  if ((await stateAt(high)) !== first) {
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if ((await stateAt(mid)) === first) low = mid;
      else high = mid;
    }
    for (const width of [high - 1, high, high + 1]) {
      await stateAt(width);
      const clear = page.locator('[data-ui="gallery.videoReview.loopSummary"] button');
      await expect(clear).toBeInViewport();
      expect(await toolbar.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: outputPath(`toolbar-boundary-${width}.png`), fullPage: false });
    }
  }
  await page.setViewportSize(original);
}

for (const variant of [
  { locale: 'en', theme: 'light' },
  { locale: 'ru', theme: 'dark' },
  { locale: 'en', theme: 'light', viewport: { width: 1200, height: 560 } },
] as const) {
  test(`quick editor ruler loop and tool lanes (${variant.locale}${'viewport' in variant ? ', narrow' : ''})`, async ({
    page,
  }, info) => {
    if ('viewport' in variant) await page.setViewportSize(variant.viewport);
    const server = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 160,
        height: 90,
        duration: 12.01,
      });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog
          .getByRole('button', { name: label(key), exact: true })
          .and(dialog.locator('[aria-label]:not([data-audio-id])'));
      const video = dialog.locator('video').first();
      await expect.poll(() => video.evaluate((node) => node.readyState)).toBeGreaterThan(1);
      // Ruler looping works even when basic Cut would snap edits to distant keyframes.
      await button('gallery.videoReview.cutMode').click();
      const toolbar = dialog.locator('[data-ui="gallery.videoReview.toolbar"]');
      const toolbarHeight = (await toolbar.boundingBox())!.height;
      await rulerDrag(page, 1.25, 1.85);
      const summary = dialog.locator('[data-ui="gallery.videoReview.loopSummary"]');
      await expect(summary).toContainText('0:01.25');
      expect((await toolbar.boundingBox())!.height).toBe(toolbarHeight);
      const clear = button('gallery.videoReview.clearPlaybackRange');
      await expect(clear).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
      expect((await clear.boundingBox())!.height).toBeLessThanOrEqual(28);
      await expect(video).toHaveJSProperty('paused', true);
      await expect.poll(() => video.evaluate((node) => node.currentTime)).toBeCloseTo(1.25, 1);
      await expect(dialog.locator('[data-ui="gallery.videoReview.editBlock"]')).toHaveCount(0);
      await expect(button('gallery.videoReview.undo')).toBeDisabled();
      const overlay = dialog.locator('[data-ui="gallery.videoReview.playbackRangeOverlay"]');
      const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
      await expect(overlay).toHaveCSS('pointer-events', 'none');
      await expect.poll(async () => (await overlay.boundingBox())!.height).toBeGreaterThan(60);
      await expect(overlay).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await button('gallery.videoReview.play').click();
      // Count actual source-clock returns, not merely a paused frame inside the range.
      await expect
        .poll(
          () =>
            video.evaluate(async (node) => {
              let previous = node.currentTime;
              let wraps = 0;
              const until = performance.now() + 1600;
              while (performance.now() < until) {
                await new Promise((resolve) => setTimeout(resolve, 25));
                const now = node.currentTime;
                if (now < previous - 0.15) wraps++;
                previous = now;
              }
              return wraps;
            }),
          { timeout: 6000 }
        )
        .toBeGreaterThanOrEqual(2);
      await rulerDrag(page, 3.6, 3);
      await expect(summary).toContainText('0:03.00');
      await expect(video).toHaveJSProperty('paused', false);
      await button('gallery.videoReview.pause').click();
      await button('gallery.videoReview.clearPlaybackRange').press('Space');
      await expect(summary).toHaveCount(0);
      await expect(overlay).toHaveCount(0);
      await expect(button('gallery.videoReview.undo')).toBeDisabled();
      await button('gallery.videoReview.advancedEditing').click();
      await rulerDrag(page, 0.5, 6.5);
      await button('gallery.videoReview.focusRangeTool').click();
      await expect(plane).toHaveAttribute('data-active-tool-lane', 'focus');
      const focus = dialog.locator('[data-ui="gallery.videoReview.zoomLane"]');
      await expect(focus).toBeInViewport();
      await expect(focus).not.toHaveCSS('box-shadow', 'none');
      await page.screenshot({ path: info.outputPath('focus-tool-lane.png'), fullPage: false });
      await expect(summary).toBeVisible();
      await expect(focus.locator('[role="button"]')).toHaveCount(1);
      await expect(button('gallery.videoReview.focusRangeTool')).toBeDisabled();
      await expect(button('gallery.videoReview.focusRangeTool')).toHaveAttribute(
        'title',
        label('gallery.videoReview.placement_occupied')
      );
      await expect(button('gallery.videoReview.zoomAdd')).toBeDisabled();
      await proveToolGroup(
        page,
        label('gallery.videoReview.focusType'),
        info.outputPath('focus-group.png')
      );
      if (variant.locale === 'en' && !('viewport' in variant))
        await proveToolbarBoundary(page, (name) => info.outputPath(`focus-${name}`));
      for (const kind of ['focusSpotlight', 'focusBorder'] as const) {
        await button('gallery.videoReview.focusType').click();
        await page
          .getByRole('option', { name: label(`gallery.videoReview.${kind}`), exact: true })
          .click();
        await expect(button('gallery.videoReview.focusRangeTool')).toBeEnabled();
        await button('gallery.videoReview.focusRangeTool').click();
      }
      await expect(focus.locator('[role="button"]')).toHaveCount(3);

      await button('gallery.videoReview.speedMode').click();
      await expect(plane).toHaveAttribute('data-active-tool-lane', 'source');
      await proveToolGroup(
        page,
        label('gallery.videoReview.speedRate'),
        info.outputPath('speed-group.png')
      );
      if (variant.locale === 'en' && !('viewport' in variant))
        await proveToolbarBoundary(page, (name) => info.outputPath(`speed-${name}`));
      const source = dialog.locator('[data-ui="gallery.videoReview.sourceLane"]');
      await expect(source).toBeInViewport();
      await expect(dialog.locator('[data-ui="gallery.videoReview.editBlock"]')).toHaveCount(1);
      await expect(button('gallery.videoReview.speedMode')).toBeDisabled();
      const speedBounds = (await dialog
        .locator('[data-ui="gallery.videoReview.editBlock"]')
        .boundingBox())!;
      const rangeBounds = (await overlay.boundingBox())!;
      expect(Math.abs(speedBounds.x - rangeBounds.x)).toBeLessThan(2);
      expect(Math.abs(speedBounds.width - rangeBounds.width)).toBeLessThan(2);

      await expect(button('gallery.videoReview.speedMode')).toHaveAttribute(
        'title',
        label('gallery.videoReview.placement_occupied')
      );
      await source.hover({ position: { x: 10, y: 40 } });
      await expect(plane).toHaveCSS('cursor', 'crosshair');
      await expect(
        dialog.locator('[title="' + label('gallery.videoReview.resultDuration') + '"]')
      ).toHaveCount(0);
      await button('gallery.videoReview.originalAudioRange').click();
      await expect(plane).toHaveAttribute('data-active-tool-lane', 'original');
      await proveToolGroup(
        page,
        label('gallery.videoReview.volume'),
        info.outputPath('volume-group.png')
      );
      await expect(dialog.locator('[data-original-audio-lane]')).toBeInViewport();
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.originalAudioRange"]')
      ).toHaveCount(1);
      await expect(button('gallery.videoReview.originalAudioRange')).toBeDisabled();
      await expect(button('gallery.videoReview.originalAudioRange')).toHaveAttribute(
        'title',
        label('gallery.videoReview.placement_occupied')
      );
      await button('gallery.videoReview.pointerTool').click();
      await expect(
        toolbar.locator('[data-ui="gallery.videoReview.toolGroup"][data-active]')
      ).toHaveCount(0);
      await dialog.locator('[data-ui="gallery.videoReview.ruler"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('loop-all-lanes.png'), fullPage: false });
      if (variant.locale === 'en' && !('viewport' in variant))
        await proveToolbarBoundary(page, (name) => info.outputPath(name));
      // Zoomed and horizontally scrolled ruler preserves source coordinates.
      const zoom = dialog.getByRole('slider', {
        name: label('videoEditor.timeline.zoom'),
        exact: true,
      });
      await zoom.fill('50');
      await zoom.dispatchEvent('input');
      const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
      await viewport.evaluate((node) => {
        node.scrollLeft = node.scrollWidth / 2;
      });
      const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
      const rect = (await ruler.boundingBox())!;
      const view = (await viewport.boundingBox())!;
      const duration = Number(await ruler.getAttribute('aria-valuemax'));
      const x = view.x + view.width * 0.7;
      const from = ((x - rect.x) / rect.width) * duration;
      await page.mouse.move(x, rect.y + 15);
      await page.mouse.down();
      await page.mouse.move(x + 35, rect.y + 15);
      await page.mouse.up();
      await expect.poll(() => video.evaluate((node) => node.currentTime)).toBeCloseTo(from, 1);
      await button('gallery.videoReview.fit').click();
      await button('gallery.videoReview.clearPlaybackRange').click();
      // Existing source-lane drawing still creates an edit.
      await button('gallery.videoReview.speedMode').click();
      const sourceRect = (await source.boundingBox())!;
      await page.mouse.move(sourceRect.x + sourceRect.width * 0.65, sourceRect.y + 20);
      await page.mouse.down();
      await page.mouse.move(sourceRect.x + sourceRect.width * 0.8, sourceRect.y + 20, { steps: 5 });
      await page.mouse.up();
      await expect(dialog.locator('[data-ui="gallery.videoReview.editBlock"]')).toHaveCount(2);
      await rulerDrag(page, 11, 11.5);
      await button('gallery.videoReview.cutMode').click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.editBlock"]')).toHaveCount(3);
      await expect(summary).toHaveCount(0);
      await rulerDrag(page, 10.8, 11.7);
      for (const key of ['cutMode', 'speedMode', 'focusRangeTool', 'originalAudioRange'] as const) {
        await expect(button(`gallery.videoReview.${key}`)).toBeDisabled();
        await expect(button(`gallery.videoReview.${key}`)).toHaveAttribute(
          'title',
          label('gallery.videoReview.placement_cut')
        );
      }
      await rulerDrag(page, 1, 4);
      await page.screenshot({ path: info.outputPath('loop-with-speed.png'), fullPage: false });
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.back'), exact: true })
        .click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.loopSummary"]')).toHaveCount(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
