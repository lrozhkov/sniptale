import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type Locator, type TestInfo } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import {
  addReviewFocus,
  seedReviewVideo,
  persistedFocus,
} from '../support/quick-editor-media-fixture';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';

type Message = Parameters<typeof translate>[0];
type Metrics = {
  videos: number;
  detachedSeeks: number;
  sourceReads: number;
  paints: number;
  latencies: number[];
};

/** Browser-observed resource/paint evidence; no product harness instrumentation. */
async function observePreviewResources(page: Page) {
  await page.addInitScript(() => {
    const metrics = {
      videos: 0,
      detachedSeeks: 0,
      sourceReads: 0,
      paints: 0,
      latencies: [] as number[],
    };
    Object.assign(window, { spatialProof: metrics });
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function (...args: Parameters<typeof create>) {
      if (args[0].toLowerCase() === 'video') metrics.videos++;
      return Reflect.apply(create, this, args);
    };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!;
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
      ...descriptor,
      set(this: HTMLMediaElement, value: number) {
        if (!this.isConnected) metrics.detachedSeeks++;
        descriptor.set!.call(this, value);
      },
    });
    let pendingMove: number | null = null;
    document.addEventListener(
      'pointermove',
      (event) => {
        if (
          event.buttons &&
          (event.target as Element).closest('[data-ui="gallery.videoReview.spatialControls"]')
        )
          pendingMove = performance.now();
      },
      true
    );
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: Parameters<typeof draw>) {
      if (args[0] instanceof HTMLVideoElement && !args[0].isConnected) metrics.sourceReads++;
      if (this.canvas.closest('[data-ui="gallery.videoReview.zoomPreview"]')) {
        metrics.paints++;
        if (pendingMove !== null) {
          metrics.latencies.push(performance.now() - pendingMove);
          pendingMove = null;
        }
      }
      return Reflect.apply(draw, this, args);
    };
  });
}
async function metrics(page: Page): Promise<Metrics> {
  return page.evaluate(() => (window as unknown as { spatialProof: Metrics }).spatialProof);
}
async function spatialWorkspace(page: Page) {
  const workspace = await readNativeReviewWorkspace(
    page,
    `recording:${betaV1Fixture.records.recordings[0].id}`
  );
  if (!workspace) throw new Error('Expected durable review workspace');
  return workspace;
}
async function historyCursor(page: Page) {
  return (await spatialWorkspace(page)).cursor;
}
async function persistedRegions(page: Page) {
  const workspace = await spatialWorkspace(page);
  const latest = workspace.history
    .slice(0, workspace.cursor)
    .findLast((item) => item.target === 'advancedContent');
  return latest?.target === 'advancedContent'
    ? latest.after.zoom.regions
    : workspace.advanced.zoom.regions;
}

async function proveWidths(page: Page, preview: Locator, info: TestInfo) {
  const scroll = page.locator('dialog .review-inspector-scroll');
  const width = () =>
    scroll.evaluate((node) => {
      const style = getComputedStyle(node);
      return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    });
  const handle = page.locator('[data-ui="gallery.videoReview.resizeInspector"]');
  for (const target of [523, 524, 525]) {
    for (let attempt = 0; attempt < 3 && Math.abs((await width()) - target) > 0.5; attempt++) {
      const current = await width();
      const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + current - target, box.y + 20, { steps: 4 });
      await page.mouse.up();
    }
    await expect.poll(width).toBe(target);
    await preview.scrollIntoViewIfNeeded();
    await expect(preview.locator('canvas')).toHaveCount(1);
    const box = (await preview.boundingBox())!;
    expect(box.width).toBeCloseTo(target < 524 ? target : (target - 12) / 2, 0);
    await page.screenshot({
      path: info.outputPath(`spatial-controls-${target}.png`),
      fullPage: false,
    });
  }
}

for (const variant of [
  { width: 1280, height: 560, locale: 'ru', theme: 'dark' },
  { width: 1280, height: 560, locale: 'ru', theme: 'light' },
  { width: 1920, height: 900, locale: 'en', theme: 'light' },
  { width: 1920, height: 900, locale: 'ru', theme: 'dark' },
  { width: 960, height: 560, locale: 'en', theme: 'dark' },
] as const) {
  test(`spatial handles commit once and recover ${variant.width} ${variant.locale} ${variant.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: variant.width, height: variant.height });
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const label = (key: Message) => translate(key, variant.locale);
    const dialog = page.locator('dialog');
    const button = (key: Message) => dialog.getByRole('button', { name: label(key), exact: true });
    const preview = dialog.locator('[data-ui="gallery.videoReview.zoomPreview"]');
    const tools = dialog.locator('[data-ui="gallery.videoReview.spatialTools"]');
    const controls = dialog.locator('[data-ui="gallery.videoReview.spatialControls"]');
    const tool = (key: Message) => tools.getByRole('button', { name: label(key), exact: true });
    const exact = async (key: Message, value: string) => {
      const input = dialog.getByRole('textbox', { name: label(key), exact: true });
      await input.fill(value);
      await input.press('Enter');
      await expect(input).not.toBeFocused();
    };
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await observePreviewResources(page);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await addReviewFocus(page);
      await expect(tool('gallery.videoReview.spatialToolTilt')).toBeEnabled();
      await tool('gallery.videoReview.spatialToolTilt').click();
      await exact('gallery.videoReview.perspectiveX', '25');
      await exact('gallery.videoReview.perspectiveY', '-30');
      await tool('gallery.videoReview.spatialToolFocus').click();
      await tool('gallery.videoReview.depthModeDepth').click();
      await expect.poll(async () => (await persistedFocus(page))?.perspective?.rotateY).toBe(-30);
      await expect.poll(async () => (await persistedFocus(page))?.depthOfField?.enabled).toBe(true);
      await expect(preview).toHaveAttribute('data-status', 'ready');
      const initial = await persistedFocus(page),
        cursor = await historyCursor(page);
      const video = dialog.locator('[data-ui="gallery.videoReview.stage"] video');
      const time = await video.evaluate((node: HTMLVideoElement) => node.currentTime);
      await preview.scrollIntoViewIfNeeded();
      const canvasHeight = (await preview.locator('canvas').boundingBox())!.height;
      const offset = () =>
        preview.evaluate((node) => {
          const canvas = node.querySelector('canvas')!;
          return canvas.getBoundingClientRect().top - node.getBoundingClientRect().top;
        });
      const canvasOffset = await offset();
      for (const key of [
        'spatialToolTilt',
        'spatialToolRotation',
        'spatialToolFocus',
        'spatialToolPosition',
      ] as const) {
        await tool(`gallery.videoReview.${key}`).click();
        expect((await preview.locator('canvas').boundingBox())!.height).toBeCloseTo(
          canvasHeight,
          1
        );
        expect.soft(await offset()).toBeCloseTo(canvasOffset, 1);
        const contextBottom = await tools
          .locator('.review-spatial-context')
          .evaluate((node) =>
            Math.max(
              ...[...node.querySelectorAll('button')].map(
                (button) => button.getBoundingClientRect().bottom
              ),
              0
            )
          );
        expect(contextBottom).toBeLessThan((await preview.locator('canvas').boundingBox())!.y);
      }
      const precisePosition = dialog.getByText(label('gallery.videoReview.precisePosition'), {
        exact: true,
      });
      await precisePosition.click();
      const resetPosition = button('gallery.videoReview.spatialResetPosition');
      const lastPositionField = dialog.getByRole('textbox', {
        name: label('gallery.videoReview.zoomFocusY'),
        exact: true,
      });
      const parameterBox = (await lastPositionField.boundingBox())!;
      const resetBox = (await resetPosition.boundingBox())!;
      expect(resetBox.y).toBeGreaterThanOrEqual(parameterBox.y + parameterBox.height);
      expect(resetBox.height).toBeLessThanOrEqual(32);
      await resetPosition.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('spatial-reset-after-fields.png'),
        fullPage: false,
      });
      await precisePosition.click();
      expect(await historyCursor(page)).toBe(cursor);
      expect(await persistedFocus(page)).toEqual(initial);
      const scaleRange = dialog.locator(
        `input[type="range"][aria-label="${label('gallery.videoReview.zoomScale')} range"]`
      );
      await scaleRange.focus();
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(300);
      expect(await historyCursor(page)).toBe(cursor);
      await page.keyboard.down('ArrowLeft');
      await page.keyboard.up('ArrowLeft');
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(300);
      expect(await historyCursor(page)).toBe(cursor);
      expect(await persistedFocus(page)).toEqual(initial);
      await expect(tools.locator('.review-spatial-tool-active')).toHaveCount(1);
      expect(
        await tools
          .locator('.review-spatial-tool-active')
          .evaluate((node) => getComputedStyle(node).backgroundColor)
      ).not.toBe('rgba(0, 0, 0, 0)');
      await expect(
        tools.locator('.review-spatial-tool-active .review-spatial-tool-label')
      ).toHaveText(label('gallery.videoReview.spatialToolPosition'));
      expect(await video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBe(time);
      await tool('gallery.videoReview.spatialToolTilt').click();
      const tilt = controls.getByRole('button', {
        name: label('gallery.videoReview.spatialDragTilt'),
        exact: true,
      });
      await tilt.scrollIntoViewIfNeeded();
      const box = (await tilt.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      // Admission may seek once to the authored midpoint; subsequent angle movement must reuse its source.
      await expect(preview).toHaveAttribute('data-status', 'ready');
      const before = await metrics(page);
      await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.4, { steps: 20 });
      await expect.poll(async () => (await metrics(page)).paints).toBeGreaterThan(before.paints);
      expect(await historyCursor(page)).toBe(cursor);
      await page.mouse.up();
      await expect.poll(() => historyCursor(page)).toBe(cursor + 1);
      const changed = await persistedFocus(page);
      expect(changed?.perspective).not.toEqual(initial?.perspective);
      expect(changed?.perspective?.rotateZ).toBe(initial?.perspective?.rotateZ);
      const after = await metrics(page);
      expect(after.videos).toBe(before.videos);
      expect(after.detachedSeeks).toBe(before.detachedSeeks);
      expect(after.sourceReads).toBe(before.sourceReads);
      const latencies = after.latencies.slice(before.latencies.length);
      expect(latencies.length).toBeGreaterThan(0);
      expect(Math.max(...latencies)).toBeLessThan(250);
      await writeFile(
        info.outputPath('spatial-gesture-metrics.json'),
        JSON.stringify(
          {
            before,
            after,
            cursorBefore: cursor,
            cursorAfter: await historyCursor(page),
            browser: page.context().browser()?.version(),
            viewport: page.viewportSize(),
            devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
          },
          null,
          2
        )
      );
      await button('gallery.videoReview.undo').click();
      await expect
        .poll(async () => (await persistedFocus(page))?.perspective)
        .toEqual(initial?.perspective);
      await button('gallery.videoReview.redo').click();
      await expect
        .poll(async () => (await persistedFocus(page))?.perspective)
        .toEqual(changed?.perspective);
      await tool('gallery.videoReview.spatialToolRotation').click();
      const rotation = controls.getByRole('button', {
        name: label('gallery.videoReview.spatialDragRotation'),
        exact: true,
      });
      await rotation.focus();
      await rotation.press('ArrowRight');
      await rotation.press('Escape');
      expect(await historyCursor(page)).toBe(cursor + 1);
      await rotation.focus();
      await rotation.press('ArrowRight');
      await rotation.press('Enter');
      await expect.poll(() => historyCursor(page)).toBe(cursor + 2);
      await tool('gallery.videoReview.spatialToolFocus').click();
      await expect(controls.locator('polyline')).not.toHaveCount(0);
      await expect(
        controls.getByRole('button', {
          name: label('gallery.videoReview.spatialFocusCenter'),
          exact: true,
        })
      ).toBeVisible();
      await page.screenshot({ path: info.outputPath('spatial-focus-depth.png'), fullPage: false });
      await tool('gallery.videoReview.depthModeArea').click();
      // A mode change uses the debounced writer; capture the next gesture only after it is durable.
      await expect.poll(async () => (await persistedFocus(page))?.depthOfField?.mode).toBe('area');
      await controls.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('spatial-focus-area.png'), fullPage: false });
      const center = controls.getByRole('button', {
        name: label('gallery.videoReview.spatialFocusCenter'),
        exact: true,
      });
      const focusBefore = await persistedFocus(page),
        focusCursor = await historyCursor(page);
      await center.focus();
      await center.press('ArrowRight');
      await center.press('Enter');
      await expect.poll(() => historyCursor(page)).toBe(focusCursor + 1);
      expect((await persistedFocus(page))?.depthOfField?.x).toBeGreaterThan(
        focusBefore!.depthOfField!.x
      );
      const acceptedFocus = await persistedFocus(page);
      const centerBox = (await center.boundingBox())!;
      await page.mouse.move(centerBox.x + centerBox.width / 2, centerBox.y + centerBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(centerBox.x + 20, centerBox.y + 10, { steps: 4 });
      await expect(controls).toHaveAttribute('data-active', 'center');
      for (const handle of await controls.locator('.review-spatial-boundary-handle').all()) {
        await expect(handle).toHaveCSS('opacity', '0');
      }
      await page.screenshot({ path: info.outputPath('spatial-drag-active.png'), fullPage: false });
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.mouse.up();
      expect(await historyCursor(page)).toBe(focusCursor + 1);
      expect(await persistedFocus(page)).toEqual(acceptedFocus);

      if (variant.width === 1920) await proveWidths(page, preview, info);
      if (variant.width === 960) {
        const scroll = dialog.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
        expect(await scroll.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        await tool('gallery.videoReview.spatialToolRotation').scrollIntoViewIfNeeded();
        await expect(tool('gallery.videoReview.spatialToolRotation')).toBeVisible();
        await page.screenshot({
          path: info.outputPath('spatial-horizontal-scroll.png'),
          fullPage: false,
        });
      }
      const entrance = dialog.getByRole('group', {
        name: label('gallery.videoReview.zoomTransitionIn'),
        exact: true,
      });
      await entrance.scrollIntoViewIfNeeded();
      if (variant.width === 1920 && variant.locale === 'ru') {
        const curve = entrance.getByRole('button', {
          name: label('gallery.videoReview.zoomTransitionType'),
          exact: true,
        });
        await curve.click();
        await expect(
          page.getByRole('option', {
            name: label('gallery.videoReview.transitionLinear'),
            exact: true,
          })
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(curve).toBeFocused();
      } else {
        await expect(
          entrance.getByRole('button', {
            name: label('gallery.videoReview.transitionLinear'),
            exact: true,
          })
        ).toBeVisible();
      }
      await expect(
        entrance.getByRole('switch', { name: label('gallery.videoReview.motionBlur'), exact: true })
      ).toHaveAttribute('aria-checked', 'false');
      await page.screenshot({
        path: info.outputPath('animation-direct-controls.png'),
        fullPage: false,
      });
      const phaseHeading = dialog
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.zoomTransitionIn') });
      await phaseHeading.click();
      await expect(entrance).not.toBeVisible();
      await expect(
        dialog.getByRole('group', {
          name: label('gallery.videoReview.zoomTransitionOut'),
          exact: true,
        })
      ).toBeVisible();
      await phaseHeading.click();
      await expect(entrance).toBeVisible();
      const saved = await persistedFocus(page);
      await button('gallery.videoReview.zoomResetPosition').click();
      await expect.poll(async () => (await persistedFocus(page))?.perspective).toBeUndefined();
      expect((await persistedFocus(page))?.depthOfField).toBeUndefined();
      expect((await persistedFocus(page))?.transform).toEqual({
        scale: 1.5,
        centerX: 0.5,
        centerY: 0.5,
      });
      expect((await persistedFocus(page))?.sourceAnchor).toEqual(saved?.sourceAnchor);
      await button('gallery.videoReview.undo').click();
      await expect.poll(() => persistedFocus(page)).toEqual(saved);
      await button('common.actions.close').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      expect(await persistedFocus(page)).toEqual(saved);
      await expect(preview).toHaveAttribute('data-status', 'ready');
      await button('gallery.videoReview.play').click();
      await expect(button('gallery.videoReview.spatialResetPosition')).toHaveCount(0);
      await button('gallery.videoReview.pause').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      await expect(button('gallery.videoReview.spatialResetPosition')).toBeEnabled();
      expect(await persistedFocus(page)).toEqual(saved);
      expect(errors).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

/** Compare composited visible rasters, including CSS background layers, at equal output scale. */
async function compareSpatialRasters(page: Page, first: Buffer, second: Buffer) {
  return page.evaluate(
    async ({ a, b }) => {
      const load = async (data: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        return image;
      };
      const [left, right] = await Promise.all([load(a), load(b)]);
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = Math.round((320 * left.height) / left.width);
      const context = canvas.getContext('2d')!;
      context.drawImage(left, 0, 0, canvas.width, canvas.height);
      const expected = context.getImageData(0, 0, canvas.width, canvas.height).data;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(right, 0, 0, canvas.width, canvas.height);
      const actual = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0,
        samples = 0;
      // Exclude only the decorative 1px canvas border, not the scene background or window header.
      for (let y = 4; y < canvas.height - 4; y++)
        for (let x = 4; x < canvas.width - 4; x++) {
          const offset = (y * canvas.width + x) * 4;
          for (let channel = 0; channel < 3; channel++) {
            sum += Math.abs(expected[offset + channel]! - actual[offset + channel]!);
            samples++;
          }
        }
      return {
        mae: sum / samples,
        width: canvas.width,
        height: canvas.height,
        firstAspect: left.width / left.height,
        secondAspect: right.width / right.height,
      };
    },
    { a: first.toString('base64'), b: second.toString('base64') }
  );
}

async function setupSpatialProof(page: Page, origin: string) {
  const label = (key: Message) => translate(key, 'en');
  const dialog = page.locator('dialog');
  const button = (key: Message) =>
    (key.startsWith('gallery.videoReview.spatialTool')
      ? dialog.locator('[data-ui="gallery.videoReview.spatialTools"]')
      : dialog
    ).getByRole('button', { name: label(key), exact: true });
  await applyHarnessBootstrap(page, {
    preserveMediaLibrary: true,
    storage: { 'sniptale-locale-preference': 'en' },
  });
  await page.goto(`${origin}${GALLERY_HARNESS_PATH}`);
  await page.locator('[data-ui="gallery.page.root"]').waitFor();
  await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
  await page.reload();
  await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
  await page.locator('[data-ui="gallery.videoReview.enter"]').click();
  await button('gallery.videoReview.advancedEditing').click();
  const number = async (key: Message, value: string) => {
    if (key === 'gallery.videoReview.zoomScale')
      await button('gallery.videoReview.spatialToolPosition').click();
    const input = dialog.getByRole('textbox', { name: label(key), exact: true });
    await input.fill(value);
    await input.press('Enter');
  };
  const enable = async (key: Message) => {
    const tool =
      key === 'gallery.videoReview.perspective'
        ? 'gallery.videoReview.spatialToolTilt'
        : 'gallery.videoReview.spatialToolFocus';
    await button(tool).click();
    if (key === 'gallery.videoReview.depthOfField')
      await button('gallery.videoReview.depthModeArea').click();
    return dialog;
  };
  const seek = async (time: number) => {
    const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
    const box = (await ruler.boundingBox())!;
    const duration = Number(
      await dialog
        .locator('[data-ui="gallery.videoReview.timePlane"]')
        .getAttribute('aria-valuemax')
    );
    await page.mouse.click(box.x + (time * box.width) / duration, box.y + 10);
  };
  return { label, dialog, button, number, enable, seek };
}

for (const scenario of [
  { fps: 30, header: true, follow: false, mode: 'area' },
  { fps: 60, header: true, follow: true, mode: 'depth' },
] as const)
  test(`spatial handle committed target matches mini main and ${scenario.fps}fps export`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    const host = await startHostServer();
    try {
      const ui = await setupSpatialProof(page, host.origin);
      await ui.button('gallery.videoReview.scene').click();
      await ui.button('gallery.videoReview.backgroundSolid').click();
      await ui
        .button(
          scenario.follow
            ? 'gallery.videoReview.backgroundZoomWindow'
            : 'gallery.videoReview.backgroundZoomContent'
        )
        .click();
      await ui.number('gallery.videoReview.backgroundPadding', '12');
      await ui.button(scenario.header ? 'windowHeader.browser' : 'windowHeader.none').click();
      await addReviewFocus(page);
      await ui.enable('gallery.videoReview.perspective');
      await ui.number('gallery.videoReview.perspectiveY', '35');
      const depth = await ui.enable('gallery.videoReview.depthOfField');
      await depth
        .getByRole('button', {
          name: ui.label(
            scenario.mode === 'area'
              ? 'gallery.videoReview.depthModeArea'
              : 'gallery.videoReview.depthModeDepth'
          ),
          exact: true,
        })
        .click();
      await expect
        .poll(async () => (await persistedFocus(page))?.depthOfField?.mode)
        .toBe(scenario.mode);
      const tools = ui.dialog.locator('[data-ui="gallery.videoReview.spatialTools"]');
      await tools
        .getByRole('button', { name: ui.label('gallery.videoReview.spatialToolTilt'), exact: true })
        .click();
      const control = ui.dialog.getByRole('button', {
        name: ui.label('gallery.videoReview.spatialDragTilt'),
        exact: true,
      });
      await control.focus();
      await control.press('ArrowUp');
      await control.press('Enter');
      await expect.poll(async () => (await persistedFocus(page))?.perspective?.rotateX).not.toBe(0);
      const target = (await persistedFocus(page))!;
      const midpoint = (target.start + target.end) / 2;
      // This fixture is 10fps. Sample inside its midpoint frame so neither ruler
      // rounding nor a 30/60fps export sample lands just before the frame boundary.
      const sourceFrameDuration = 0.1;
      expect(midpoint).toBeGreaterThan(target.start + target.enter.duration);
      expect(midpoint + sourceFrameDuration).toBeLessThan(target.end - target.exit.duration);
      await ui.seek(midpoint + sourceFrameDuration * 0.6);
      const preview = ui.dialog.locator('[data-ui="gallery.videoReview.zoomPreview"]');
      await expect(preview).toHaveAttribute('data-status', 'ready');
      const stage = ui.dialog.locator('[data-ui="gallery.videoReview.stage"]');
      const mainCanvas = stage.locator('[data-ui="gallery.videoReview.motionBlurCanvas"]');
      await expect(mainCanvas).toBeVisible();
      const time = await stage
        .locator('video')
        .evaluate((video: HTMLVideoElement) => video.currentTime);
      expect(time).toBeGreaterThan(midpoint);
      expect(time).toBeLessThan(midpoint + sourceFrameDuration);
      const sourceFrameMatches = await stage
        .locator('video')
        .evaluate(async (main: HTMLVideoElement, midpoint) => {
          const reference = document.createElement('video');
          const canvas = document.createElement('canvas');
          canvas.width = main.videoWidth;
          canvas.height = main.videoHeight;
          const context = canvas.getContext('2d')!;
          context.drawImage(main, 0, 0);
          const actual = canvas.toDataURL();
          try {
            reference.src = main.currentSrc;
            await new Promise<void>((resolve, reject) => {
              reference.onloadeddata = () => resolve();
              reference.onerror = () => reject(new Error('Source frame unavailable'));
            });
            reference.currentTime = midpoint + 0.001;
            await new Promise<void>((resolve) => {
              reference.onseeked = () => resolve();
            });
            context.drawImage(reference, 0, 0);
            return canvas.toDataURL() === actual;
          } finally {
            reference.removeAttribute('src');
            reference.load();
          }
        }, midpoint);
      expect(sourceFrameMatches).toBe(true);
      const style = '[data-ui="gallery.videoReview.spatialControls"]{visibility:hidden!important}';
      const mini = await preview
        .locator('canvas')
        .screenshot({ path: info.outputPath('mini-target.png'), style });
      const main = await mainCanvas.screenshot({ path: info.outputPath('main-target.png'), style });
      const miniMain = await compareSpatialRasters(page, mini, main);
      expect(miniMain.firstAspect).toBeCloseTo(miniMain.secondAspect, 1);
      expect(miniMain.mae).toBeLessThan(18);
      await ui
        .button('gallery.videoReview.exportSection')
        .and(page.locator('[data-ui="gallery.videoReview.openExport"]'))
        .click();
      await ui.button('gallery.videoReview.exportFrameRate').click();
      await page.getByRole('option', { name: String(scenario.fps), exact: true }).click();
      const downloading = page.waitForEvent('download');
      await ui.button('gallery.videoReview.downloadVideo').click();
      const download = await downloading;
      const exportPath = info.outputPath(`spatial-${scenario.fps}.webm`);
      await download.saveAs(exportPath);
      const bytes = await readFile(exportPath);
      const media = new Input({
        source: new BlobSource(new Blob([new Uint8Array(bytes)])),
        formats: ALL_FORMATS,
      });
      let packetRate: number;
      try {
        const track = await media.getPrimaryVideoTrack();
        if (!track) throw new Error('Expected exported video track');
        packetRate = (await track.computePacketStats()).averagePacketRate;
        expect(packetRate).toBeCloseTo(scenario.fps, 0);
      } finally {
        media.dispose();
      }
      const encoded = bytes.toString('base64');
      const decoded = await page.evaluate(
        async ({ encoded, time }) => {
          const url = URL.createObjectURL(
            new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], {
              type: 'video/webm',
            })
          );
          const video = document.createElement('video');
          try {
            video.src = url;
            await new Promise<void>((resolve, reject) => {
              video.onloadeddata = () => resolve();
              video.onerror = () => reject(new Error('Export decode failed'));
            });
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const sample = async (at: number) => {
              video.currentTime = at;
              await new Promise<void>((resolve) => {
                video.onseeked = () => resolve();
              });
              canvas.getContext('2d')!.drawImage(video, 0, 0);
              return canvas.toDataURL().split(',')[1]!;
            };
            return { target: await sample(time), previous: await sample(time - 0.1) };
          } finally {
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(url);
          }
        },
        { encoded, time }
      );
      const exported = Buffer.from(decoded.target, 'base64');
      const previous = Buffer.from(decoded.previous, 'base64');
      await writeFile(info.outputPath('export-previous-frame.png'), previous);
      await writeFile(info.outputPath('export-target.png'), exported);
      const mainExport = await compareSpatialRasters(page, main, exported);
      expect(mainExport.mae).toBeLessThan(18);
      const previousFrameError = await compareSpatialRasters(page, main, previous);
      // A global tolerance alone can miss an incorrect burn-in/frame. The intended
      // frame must match more closely than the adjacent preceding source frame.
      expect(mainExport.mae).toBeLessThan(previousFrameError.mae);
      await writeFile(
        info.outputPath('spatial-parity.json'),
        JSON.stringify(
          {
            scenario,
            packetRate,
            sourceFrameMatches,
            midpoint,
            sourceFrameDuration,
            previousFrameError,
            target,
            time,
            miniMain,
            mainExport,
            viewport: page.viewportSize(),
            dpr: await page.evaluate(() => devicePixelRatio),
          },
          null,
          2
        )
      );
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });

test('DPR2 short linked targets keep authored limits through resize and fullscreen', async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 560 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const host = await startHostServer();
  try {
    const ui = await setupSpatialProof(page, host.origin);
    const clips = ui.dialog.locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]');
    const trimEnd = async (clip: Locator, time: number) => {
      const ruler = (await ui.dialog
        .locator('[data-ui="gallery.videoReview.ruler"]')
        .boundingBox())!;
      const duration = Number(
        await ui.dialog
          .locator('[data-ui="gallery.videoReview.timePlane"]')
          .getAttribute('aria-valuemax')
      );
      await clip.hover();
      const grip = (await clip.locator('[data-zoom-edge="end"]').boundingBox())!;
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(ruler.x + (time * ruler.width) / duration, grip.y + grip.height / 2, {
        steps: 8,
      });
      await page.mouse.up();
    };
    await addReviewFocus(page);
    await trimEnd(clips.first(), 0.6);
    await expect.poll(async () => (await persistedRegions(page))[0]!.end).toBeLessThan(0.8);
    await ui.seek(0.8);
    await addReviewFocus(page);
    await expect(clips).toHaveCount(2);
    await trimEnd(clips.last(), 1.4);
    await expect
      .poll(async () => {
        const region = (await persistedRegions(page))[1]!;
        return region.end - region.start;
      })
      .toBeLessThan(0.8);
    const link = ui.dialog.locator('[data-ui="gallery.videoReview.zoomLink"]');
    await link.hover();
    await link.click();
    await expect(link).toHaveAttribute('data-connected', 'true');
    await clips.last().click();
    await ui.enable('gallery.videoReview.perspective');
    await ui.number('gallery.videoReview.perspectiveY', '59');
    await ui.number('gallery.videoReview.zoomScale', '3.95');
    await expect.poll(async () => (await persistedFocus(page))?.transform.scale).toBe(3.95);
    const before = await persistedRegions(page);
    const target = before[1]!;
    await ui.seek(target.start + Math.min(0.02, target.enter.duration / 2));
    const tools = ui.dialog.locator('[data-ui="gallery.videoReview.spatialTools"]');
    await tools
      .getByRole('button', { name: ui.label('gallery.videoReview.spatialToolTilt'), exact: true })
      .click();
    const tilt = ui.dialog.getByRole('button', {
      name: ui.label('gallery.videoReview.spatialDragTilt'),
      exact: true,
    });
    await tilt.focus();
    await tilt.press('ArrowRight');
    await tilt.press('ArrowRight');
    await tilt.press('Enter');
    await expect.poll(async () => (await persistedFocus(page))?.perspective?.rotateY).toBe(60);
    const after = await persistedRegions(page);
    expect(after[0]).toEqual(before[0]);
    expect(after[1]!.transform).toEqual(target.transform);
    expect(after[1]!.start).toBe(target.start);
    expect(after[1]!.end).toBe(target.end);
    await ui.button('gallery.videoReview.undo').click();
    await expect.poll(async () => (await persistedFocus(page))?.perspective?.rotateY).toBe(59);
    await ui.button('gallery.videoReview.redo').click();
    await expect.poll(async () => (await persistedFocus(page))?.perspective?.rotateY).toBe(60);
    await tools
      .getByRole('button', {
        name: ui.label('gallery.videoReview.spatialToolRotation'),
        exact: true,
      })
      .click();
    const rotation = ui.dialog.getByRole('button', {
      name: ui.label('gallery.videoReview.spatialDragRotation'),
      exact: true,
    });
    await rotation.scrollIntoViewIfNeeded();
    const handle = (await rotation.boundingBox())!;
    expect(handle.width).toBeGreaterThanOrEqual(28);
    await page.screenshot({
      path: info.outputPath('spatial-dpr2-short-target.png'),
      fullPage: false,
    });
    await page.setViewportSize({ width: 1536, height: 700 });
    await expect(rotation).toBeVisible();
    expect((await rotation.boundingBox())!.width).toBeCloseTo(handle.width, 1);
    const fullscreen = ui.dialog.locator('[data-ui="gallery.videoReview.fullscreen"]');
    const video = ui.dialog.locator('[data-ui="gallery.videoReview.stage"] video');
    await video.evaluate((node) => {
      node.dataset.spatialIdentity = 'retained';
    });
    await fullscreen.click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await expect(video).toHaveAttribute('data-spatial-identity', 'retained');
    await page.screenshot({
      path: info.outputPath('spatial-dpr2-fullscreen.png'),
      fullPage: false,
    });
    await fullscreen.click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await expect(rotation).toBeVisible();
    expect(await persistedRegions(page)).toEqual(after);
    await writeFile(
      info.outputPath('spatial-dpr2-authority.json'),
      JSON.stringify(
        {
          before,
          after,
          dpr: await page.evaluate(() => devicePixelRatio),
          initialViewport: { width: 1280, height: 560 },
          resizedViewport: page.viewportSize(),
          handleCssWidth: handle.width,
        },
        null,
        2
      )
    );
  } finally {
    await context.close();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
