import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo, persistedFocus } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`quick editor draws source volume at HD in ${variant.locale}/${variant.theme}`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
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
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: translate(key, variant.locale), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.originalAudioRange').click();
      await expect(button('gallery.videoReview.volume')).toContainText('50%');
      await page.screenshot({
        path: testInfo.outputPath(`source-volume-tool-${variant.locale}-${variant.theme}.png`),
      });
      const source = dialog.locator('[data-ui="gallery.videoReview.sourceLane"]');
      const sourceBox = (await source.boundingBox())!;
      await page.mouse.move(sourceBox.x + sourceBox.width / 6, sourceBox.y + sourceBox.height / 2);
      await expect(dialog.locator('[data-ui="gallery.videoReview.timePlane"]')).toHaveCSS(
        'cursor',
        'default'
      );
      await page.mouse.down();
      await page.mouse.move(sourceBox.x + sourceBox.width / 3, sourceBox.y + sourceBox.height / 2, {
        steps: 5,
      });
      await page.mouse.up();
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.originalAudioRange"]')
      ).toHaveCount(0);
      await expect(dialog.locator('[data-ui="gallery.videoReview.sourceRange"]')).toHaveCount(0);
      const original = dialog.locator('[data-original-audio-lane]');
      const box = (await original.boundingBox())!;
      await page.mouse.move(box.x + box.width / 6, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      const range = dialog.locator('[data-ui="gallery.videoReview.originalAudioRange"]');
      await expect(range).toHaveCount(1);
      await expect(range).toHaveAttribute('title', /50%/);
      await expect(range).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({
        path: testInfo.outputPath(`source-volume-${variant.locale}-${variant.theme}.png`),
      });
      await button('gallery.videoReview.undo').click();
      await expect(range).toHaveCount(0);
      await button('gallery.videoReview.redo').click();
      await expect(range).toHaveCount(1);
      const timeline = dialog.locator('[data-ui="gallery.videoReview.timeline"]');
      const beforeError = (await timeline.boundingBox())!;
      await dialog
        .locator('[data-ui="gallery.videoReview.editingTools"]')
        .getByRole('button', {
          name: translate('gallery.videoReview.originalAudioRange', variant.locale),
          exact: true,
        })
        .click();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
        await page.mouse.up();
        const message = translate('gallery.videoReview.originalAudioOverlap', variant.locale);
        await expect(dialog.locator('aside')).toContainText(message);
        await expect(timeline).not.toContainText(message);
        await expect(range).toHaveCount(1);
        await expect(dialog.locator('[data-ui="gallery.videoReview.sourceRange"]')).toHaveCount(0);
        const afterError = (await timeline.boundingBox())!;
        expect(afterError.y).toBeCloseTo(beforeError.y, 0);
        expect(afterError.height).toBeCloseTo(beforeError.height, 0);
      }
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const, dpr: 1 },
  { locale: 'en' as const, theme: 'dark' as const, dpr: 2 },
]) {
  test(`quick editor timeline cursor and hover guide at HD (${variant.locale}/${variant.theme})`, async ({
    browser,
  }, testInfo) => {
    const host = await startHostServer();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: variant.dpr,
    });
    const page = await context.newPage();
    const button = (key: Parameters<typeof translate>[0]) =>
      page
        .locator('dialog')
        .getByRole('button', { name: translate(key, variant.locale), exact: true });
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const plane = page.locator('[data-ui="gallery.videoReview.timePlane"]');
      const source = page.locator('[data-ui="gallery.videoReview.sourceLane"]');
      const box = (await source.boundingBox())!;
      await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
      await expect(plane).toHaveCSS('cursor', /data:image\/svg\+xml.*4 16, cell/);
      const guide = page.locator('[data-ui="gallery.videoReview.hoverTime"]');
      await expect(guide).toBeVisible();
      expect(Math.abs((await guide.boundingBox())!.x - (box.x + box.width * 0.25))).toBeLessThan(2);
      await page.screenshot({
        path: testInfo.outputPath(`timeline-cursor-${variant.locale}-dpr${variant.dpr}.png`),
      });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.focusRangeTool').click();
      const focus = page.locator('[data-ui="gallery.videoReview.zoomLane"]');
      const focusBox = (await focus.boundingBox())!;
      await page.mouse.move(focusBox.x + focusBox.width * 0.25, focusBox.y + focusBox.height / 2);
      await expect(plane).toHaveCSS('cursor', /data:image\/svg\+xml.*4 16, cell/);
      const restrictedSource = (await source.boundingBox())!;
      await page.mouse.move(
        restrictedSource.x + restrictedSource.width * 0.25,
        restrictedSource.y + restrictedSource.height / 2
      );
      await expect(plane).toHaveCSS('cursor', 'default');
      await page.mouse.down();
      await page.mouse.move(
        restrictedSource.x + restrictedSource.width * 0.5,
        restrictedSource.y + restrictedSource.height / 2
      );
      await page.mouse.up();
      await expect(page.locator('[data-ui="gallery.videoReview.sourceRange"]')).toHaveCount(0);
      await expect(focus.locator('[role="button"]')).toHaveCount(0);
      await page.mouse.move(focusBox.x + focusBox.width * 0.2, focusBox.y + focusBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(focusBox.x + focusBox.width * 0.4, focusBox.y + focusBox.height / 2, {
        steps: 5,
      });
      await expect(page.locator('[data-ui="gallery.videoReview.sourceRange"]')).toHaveCount(0);
      await page.mouse.up();
      await expect(focus.locator('[role="button"]')).toHaveCount(1);
      await expect(page.locator('[data-ui="gallery.videoReview.sourceRange"]')).toHaveCount(0);
      await button('gallery.videoReview.pointerTool').click();
      await page.mouse.move(
        restrictedSource.x + restrictedSource.width * 0.25,
        restrictedSource.y + restrictedSource.height / 2
      );
      await expect(plane).toHaveCSS('cursor', /data:image\/svg\+xml.*4 16, cell/);
      await button('gallery.videoReview.originalAudioRange').click();
      const original = page.locator('[data-original-audio-lane]');
      const audioBox = (await original.boundingBox())!;
      await page.mouse.move(audioBox.x + audioBox.width * 0.25, audioBox.y + audioBox.height / 2);
      await expect(plane).toHaveCSS('cursor', /data:image\/svg\+xml.*4 16, cell/);
      await page.mouse.move(focusBox.x + focusBox.width * 0.25, focusBox.y + focusBox.height / 2);
      await expect(plane).toHaveCSS('cursor', 'default');
      await page.mouse.move(audioBox.x + audioBox.width * 0.5, audioBox.y + audioBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(audioBox.x + audioBox.width * 0.7, audioBox.y + audioBox.height / 2, {
        steps: 5,
      });
      await page.mouse.up();
      await expect(
        original.locator('[data-ui="gallery.videoReview.originalAudioRange"]')
      ).toHaveCount(1);
      await expect(page.locator('[data-ui="gallery.videoReview.sourceRange"]')).toHaveCount(0);
      await button('gallery.videoReview.undo').click();
      await expect(
        original.locator('[data-ui="gallery.videoReview.originalAudioRange"]')
      ).toHaveCount(0);
      await expect(focus.locator('[role="button"]')).toHaveCount(1);
    } finally {
      await context.close();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const variant of [
  { locale: 'en' as const, theme: 'light' as const },
  { locale: 'ru' as const, theme: 'dark' as const },
]) {
  test(`quick editor zoom resize grips never cross at HD (${variant.locale}/${variant.theme})`, async ({
    page,
  }) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
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
      const dialog = page.locator('dialog');
      await dialog
        .getByRole('button', {
          name: translate('gallery.videoReview.advancedEditing', variant.locale),
          exact: true,
        })
        .click();
      await dialog
        .getByRole('button', {
          name: translate('gallery.videoReview.zoomAdd', variant.locale),
          exact: true,
        })
        .click();
      const block = dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first();
      await expect(block).toBeVisible();
      const originalWidth = await block.evaluate((node) =>
        Number.parseFloat((node as HTMLElement).style.width)
      );
      const start = block.locator('[data-zoom-edge="start"]');
      const end = block.locator('[data-zoom-edge="end"]');
      const initial = (await start.boundingBox())!;
      const other = (await end.boundingBox())!;
      await page.keyboard.down('Shift');
      await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
      await page.mouse.down();
      await page.mouse.move(other.x + 150, other.y + other.height / 2);
      const edges = await block.evaluate((node) => {
        const first = node.querySelector('[data-zoom-edge="start"]')!.getBoundingClientRect();
        const last = node.querySelector('[data-zoom-edge="end"]')!.getBoundingClientRect();
        return { first: first.x + first.width / 2, last: last.x + last.width / 2 };
      });
      expect(edges.first).toBeLessThan(edges.last);
      const preview = (await block.boundingBox())!;
      await page.mouse.up();
      await page.keyboard.up('Shift');
      await expect.poll(async () => (await persistedFocus(page))?.start).toBeGreaterThan(0);
      const saved = (await persistedFocus(page))!;
      expect(saved.end).toBeCloseTo(2);
      expect(saved.end - saved.start).toBeGreaterThan(0);
      await dialog
        .getByRole('button', {
          name: translate('gallery.videoReview.back', variant.locale),
          exact: true,
        })
        .click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(block).toBeVisible();
      const reopened = (await block.boundingBox())!;
      expect(reopened.width).toBeCloseTo(preview.width, 0);
      expect(reopened.x).toBeCloseTo(preview.x, 0);
      const controls = dialog.locator('[data-ui="gallery.videoReview.trackControls"]');
      for (const key of ['zoomTrack', 'audioTrack'] as const) {
        const compact = controls.getByRole('button', {
          name: translate(`gallery.videoReview.${key}`, variant.locale),
          exact: true,
        });
        await compact.hover();
        await expect(compact).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
      }
      await dialog
        .getByRole('button', {
          name: translate('gallery.videoReview.undo', variant.locale),
          exact: true,
        })
        .click();
      await expect
        .poll(() => block.evaluate((node) => Number.parseFloat((node as HTMLElement).style.width)))
        .toBeCloseTo(originalWidth);
      const endInitial = (await end.boundingBox())!;
      const fixedStart = (await start.boundingBox())!;
      await page.keyboard.down('Shift');
      await page.mouse.move(
        endInitial.x + endInitial.width / 2,
        endInitial.y + endInitial.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(fixedStart.x - 150, fixedStart.y + fixedStart.height / 2);
      const reverse = await block.evaluate((node) => {
        const first = node.querySelector('[data-zoom-edge="start"]')!.getBoundingClientRect();
        const last = node.querySelector('[data-zoom-edge="end"]')!.getBoundingClientRect();
        return { first: first.x + first.width / 2, last: last.x + last.width / 2 };
      });
      expect(reverse.first).toBeLessThan(reverse.last);
      await page.mouse.up();
      await page.keyboard.up('Shift');
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`quick editor resize hover and quiet deletion in ${theme}`, async ({ page }, testInfo) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': theme },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      await dialog
        .getByRole('button', {
          name: translate('gallery.videoReview.advancedEditing', 'en'),
          exact: true,
        })
        .click();
      await dialog
        .getByRole('button', { name: translate('gallery.videoReview.zoomAdd', 'en'), exact: true })
        .click();
      const block = dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first();
      const inspectEdges = async (handles = block.locator('[data-zoom-edge]')) => {
        await expect(handles).toHaveCount(2);
        for (const handle of await handles.all()) {
          await handle.scrollIntoViewIfNeeded();
          const box = (await handle.boundingBox())!;
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          await page.mouse.move(x, y);
          const cursor = await page.evaluate(
            ({ x, y }) => {
              const hit = document.elementFromPoint(x, y);
              return hit
                ? {
                    cursor: getComputedStyle(hit).cursor,
                    html: hit.outerHTML,
                    parent: hit.parentElement?.outerHTML.slice(0, 700),
                  }
                : null;
            },
            { x, y }
          );
          expect
            .soft(cursor?.cursor, `grip under pointer: ${JSON.stringify(cursor)}`)
            .toBe('ew-resize');
        }
      };
      await inspectEdges();
      const zoom = dialog.getByRole('slider', {
        name: translate('videoEditor.timeline.zoom', 'en'),
        exact: true,
      });
      await zoom.focus();
      for (let i = 0; i < 8; i += 1) await zoom.press('ArrowRight');
      await inspectEdges();
      const end = (await block.locator('[data-zoom-edge="end"]').boundingBox())!;
      await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
      await page.mouse.down();
      await page.mouse.move(end.x + end.width / 2 + 20, end.y + end.height / 2, { steps: 4 });
      await page.mouse.up();
      await inspectEdges();
      const remove = dialog
        .locator('[data-ui="gallery.videoReview.inspector"] .review-inspector-danger')
        .first();
      await remove.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await expect.soft(remove).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect.soft(remove).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await remove.hover();
      await expect.soft(remove).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect.soft(remove).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await page.mouse.move(0, 0);
      await expect.soft(remove).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await page.screenshot({ path: testInfo.outputPath(`quiet-delete-${theme}.png`) });
      await dialog
        .getByRole('button', { name: translate('gallery.videoReview.fit', 'en'), exact: true })
        .click();
      for (const kind of ['cutMode', 'originalAudioRange'] as const) {
        await dialog
          .getByRole('button', {
            name: translate(`gallery.videoReview.${kind}`, 'en'),
            exact: true,
          })
          .first()
          .click();
        const lane =
          kind === 'cutMode'
            ? dialog.locator('[data-ui="gallery.videoReview.sourceLane"]')
            : dialog.locator('[data-original-audio-lane]');
        const bounds = (await lane.boundingBox())!;
        const from = kind === 'cutMode' ? 0.25 : 0.55;
        await page.mouse.move(bounds.x + bounds.width * from, bounds.y + bounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          bounds.x + bounds.width * (from + 0.15),
          bounds.y + bounds.height / 2,
          {
            steps: 4,
          }
        );
        await page.mouse.up();
        await inspectEdges(lane.locator(kind === 'cutMode' ? '[data-edge]' : '[data-audio-edge]'));
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

test('quick editor zoom retains playhead and selected focus through repeated scales', async ({
  page,
}) => {
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: translate(key, 'en'), exact: true });
    await button('gallery.videoReview.advancedEditing').click();
    const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
    const box = (await ruler.boundingBox())!;
    await ruler.click({ position: { x: box.width * 0.65, y: box.height / 2 } });
    const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
    const sourceTime = await plane.getAttribute('aria-valuenow');
    const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
    const zoom = dialog.getByRole('slider', {
      name: translate('videoEditor.timeline.zoom', 'en'),
      exact: true,
    });
    const center = async () =>
      viewport.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        const plane = node.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
        const gutter = Number.parseFloat(plane.style.getPropertyValue('--review-track-gutter'));
        return bounds.x + gutter + (node.clientWidth - gutter) / 2;
      });
    const playhead = dialog.locator('[data-ui="gallery.videoReview.playhead"]');
    for (const key of ['End', 'Home', 'End']) {
      await zoom.press(key);
      if (key !== 'Home') {
        const marker = (await playhead.boundingBox())!;
        expect(Math.abs(marker.x + marker.width / 2 - (await center()))).toBeLessThan(3);
      }
      await expect(plane).toHaveAttribute('aria-valuenow', sourceTime!);
    }
    await zoom.press('Home');
    await button('gallery.videoReview.zoomAdd').click();
    const block = dialog
      .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
      .first();
    await button('gallery.videoReview.timelineStart').click();
    const startTime = await plane.getAttribute('aria-valuenow');
    for (const key of ['End', 'Home', 'End']) {
      await zoom.press(key);
      if (key !== 'Home') {
        const selected = (await block.boundingBox())!;
        expect(Math.abs(selected.x + selected.width / 2 - (await center()))).toBeLessThan(3);
      }
      await expect(block).toHaveAttribute('aria-pressed', 'true');
      await expect(plane).toHaveAttribute('aria-valuenow', startTime!);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
