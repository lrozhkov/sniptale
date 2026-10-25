import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { translate, type AppLocale } from '../../../../apps/extension/src/platform/i18n';
import { isValidVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import type { QuickEditBorder } from '../../../../apps/extension/src/features/video/project/scene/focus-appearance';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import {
  addReviewFocus,
  persistedFocus,
  seedReviewVideo,
} from '../support/quick-editor-media-fixture';
import { chooseInspectorValue } from '../support/inspector-utilities';
import { readNativeVideoProject } from '../support/native-video-project';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

type Message = Parameters<typeof translate>[0];
type Phase = 'enter' | 'hold' | 'exit';
const phaseKeys = {
  enter: 'gallery.videoReview.zoomTransitionIn',
  hold: 'gallery.videoReview.borderHold',
  exit: 'gallery.videoReview.zoomTransitionOut',
} as const;

function phaseGroup(surface: Locator, locale: AppLocale, phase: Phase) {
  return surface.getByRole('group', { name: translate(phaseKeys[phase], locale), exact: true });
}

async function numberField(surface: Locator, locale: AppLocale, key: Message, value: number) {
  const input = surface.getByRole('textbox', { name: translate(key, locale), exact: true });
  await input.scrollIntoViewIfNeeded();
  await input.fill(String(value));
  await input.press('Enter');
}

async function chooseOrigin(
  surface: Locator,
  locale: AppLocale,
  origin: NonNullable<QuickEditBorder['origin']>
) {
  const control = surface.getByRole('button', {
    name: translate('gallery.videoReview.borderOrigin', locale),
    exact: true,
  });
  await control.scrollIntoViewIfNeeded();
  await control.click();
  await surface
    .page()
    .getByRole('option', {
      name: translate(`gallery.videoReview.borderOrigin_${origin}`, locale),
      exact: true,
    })
    .click();
}

async function seekGallery(page: Page, time: number) {
  const plane = page.locator('[data-ui="gallery.videoReview.timePlane"]');
  const ruler = plane.locator('[data-ui="gallery.videoReview.ruler"]');
  await ruler.scrollIntoViewIfNeeded();
  const box = (await ruler.boundingBox())!;
  const duration = Number(await plane.getAttribute('aria-valuemax'));
  await page.mouse.click(box.x + (box.width * time) / duration, box.y + 12);
  const video = page.locator('[data-ui="gallery.videoReview.stage"] video').first();
  await expect
    .poll(() =>
      video.evaluate(
        (node: HTMLVideoElement, target) =>
          node.readyState >= 2 && !node.seeking && Math.abs(node.currentTime - target) < 0.05,
        time
      )
    )
    .toBe(true);
}

/** The actual playhead remains authoritative when a ruler click rounds to a frame. */
async function seekNative(page: Page, seconds: number) {
  const ruler = page.locator('[data-ui="video-editor.timeline.ruler"]');
  const point = await ruler.evaluate((node, time) => {
    const markers = [...node.querySelectorAll('div > span')]
      .flatMap((span) => {
        const parts = (span.textContent?.trim() ?? '').split(':');
        if (
          parts.length < 2 ||
          parts.length > 3 ||
          parts.some((part) => !part || !Number.isFinite(Number(part)))
        )
          return [];
        return [
          {
            time: parts.map(Number).reduce((total, part) => total * 60 + part, 0),
            x: span.parentElement!.getBoundingClientRect().left,
          },
        ];
      })
      .sort((a, b) => a.time - b.time);
    const a = markers[0],
      b = markers.find((marker) => a && marker.time > a.time);
    if (!a || !b) throw new Error('Native ruler needs two major markers');
    return {
      x: a.x + ((time - a.time) * (b.x - a.x)) / (b.time - a.time),
      y: node.getBoundingClientRect().top + 10,
    };
  }, seconds);
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(async () =>
      Number(
        await page
          .locator('[data-ui="video-editor.timeline.playhead-handle"]')
          .getAttribute('aria-valuenow')
      )
    )
    .toBeCloseTo(seconds, 1);
}

/** Independent square-corner landmarks distinguish two growing branches from one CW stroke. */
function landmarks(width: number, height: number, border: QuickEditBorder) {
  const inset = border.width / 2;
  const left = border.area.x * width + inset;
  const right = (border.area.x + border.area.width) * width - inset;
  const top = border.area.y * height + inset;
  const bottom = (border.area.y + border.area.height) * height - inset;
  return [
    { x: (left + right) / 2, y: top },
    { x: left, y: (top + bottom) / 2 },
    { x: right, y: bottom },
  ];
}

async function galleryStroke(canvas: Locator, border: QuickEditBorder) {
  const dimensions = await canvas.evaluate((node: HTMLCanvasElement) => ({
    width: node.width,
    height: node.height,
  }));
  return canvas.evaluate(
    (node: HTMLCanvasElement, points) => {
      const context = node.getContext('2d')!;
      return points.map(({ x, y }) => {
        const pixels = context.getImageData(Math.round(x) - 1, Math.round(y) - 1, 3, 3).data;
        let alpha = 0;
        for (let i = 3; i < pixels.length; i += 4) alpha = Math.max(alpha, pixels[i]!);
        return alpha > 200;
      });
    },
    landmarks(dimensions.width, dimensions.height, border)
  );
}

async function nativePixels(
  canvas: Locator,
  width: number,
  height: number,
  border: QuickEditBorder
) {
  return canvas.evaluate(
    (node: HTMLCanvasElement, args) => {
      const scale = Math.min(node.width / args.width, node.height / args.height);
      const ox = (node.width - args.width * scale) / 2,
        oy = (node.height - args.height * scale) / 2;
      return args.points.map(({ x, y }) =>
        [
          ...node
            .getContext('2d')!
            .getImageData(Math.round(ox + x * scale), Math.round(oy + y * scale), 1, 1).data,
        ].slice(0, 3)
      );
    },
    { width, height, points: landmarks(width, height, border) }
  );
}

async function nativeStroke(
  canvas: Locator,
  width: number,
  height: number,
  border: QuickEditBorder
) {
  return (await nativePixels(canvas, width, height, border)).map((pixel) =>
    pixel.every((channel) => channel >= 245)
  );
}

async function galleryWidths(
  page: Page,
  dialog: Locator,
  inspector: Locator,
  locale: AppLocale,
  info: TestInfo
) {
  const size = page.viewportSize()!;
  const origin = inspector.getByRole('button', {
    name: translate('gallery.videoReview.borderOrigin', locale),
    exact: true,
  });
  if (size.width === 1280) {
    await page.setViewportSize({ width: 1100, height: size.height });
    await origin.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({ path: info.outputPath('gallery-border-narrow.png'), fullPage: false });
    await page.setViewportSize(size);
    return;
  }
  const scroll = dialog.locator('.review-inspector-scroll');
  const width = () =>
    scroll.evaluate((node) => {
      const style = getComputedStyle(node);
      return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    });
  const original = await width();
  const handle = dialog.locator('[data-ui="gallery.videoReview.resizeInspector"]');
  for (const target of [523, 524, 525, original]) {
    const current = await width(),
      box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + current - target, box.y + box.height / 2);
    await page.mouse.up();
    await expect.poll(width).toBe(target);
    await origin.scrollIntoViewIfNeeded();
    await expect(origin).toBeVisible();
    if (target !== original)
      await page.screenshot({
        path: info.outputPath(`gallery-border-width-${target}.png`),
        fullPage: false,
      });
  }
}

for (const { size } of PRIMARY_BROWSER_VIEWPORTS) {
  const locale: AppLocale = size.width === 1280 ? 'en' : 'ru';
  test(`Border origins and two sides ${size.width}x${size.height} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize(size);
    const host = await startHostServer();
    const label = (key: Message) => translate(key, locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': locale },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 4 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await dialog.locator('[data-review-header-track="zoom"] [data-review-track-select]').click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.focusRangeTool'), exact: true })
        .click();
      const toolbar = dialog.locator('[data-ui="gallery.videoReview.editingTools"]');
      await toolbar
        .getByRole('button', { name: label('gallery.videoReview.focusType'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.focusBorder'), exact: true })
        .click();
      await seekGallery(page, 0.5);
      await addReviewFocus(page);
      const blocks = dialog.locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]');
      await expect(blocks).toHaveCount(1);
      const inspector = dialog.locator('[data-ui="gallery.videoReview.zoomInspector"]');
      const all = dialog.getByRole('button', {
        name: label('scenario.editor.inspectorShowAll'),
        exact: true,
      });
      if (await all.isVisible()) await all.click();
      const enter = phaseGroup(inspector, locale, 'enter');
      const exit = phaseGroup(inspector, locale, 'exit');
      const hold = phaseGroup(inspector, locale, 'hold');
      await chooseInspectorValue(
        page,
        enter,
        label('gallery.videoReview.focusReveal'),
        label('gallery.videoReview.borderBothSides')
      );
      await numberField(enter, locale, 'gallery.videoReview.zoomTransitionDuration', 0.8);
      await chooseInspectorValue(
        page,
        exit,
        label('gallery.videoReview.focusReveal'),
        label('gallery.videoReview.borderBothSides')
      );
      await numberField(exit, locale, 'gallery.videoReview.zoomTransitionDuration', 0.8);
      await numberField(inspector, locale, 'gallery.videoReview.borderWidth', 6);
      await numberField(inspector, locale, 'gallery.videoReview.focusRoundness', 0);
      const color = inspector.getByRole('button', {
        name: label('gallery.videoReview.borderColor'),
        exact: true,
      });
      await color.click();
      const colorInput = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.borderColor'),
        exact: true,
      });
      await colorInput.fill('#ffffffff');
      await colorInput.press('Enter');
      await expect
        .poll(() => persistedFocus(page))
        .toMatchObject({
          border: { reveal: 'draw-both', exitReveal: 'erase-both', width: 6, roundness: 0 },
        });
      await chooseOrigin(inspector, locale, 'top-left');
      await expect
        .poll(() => persistedFocus(page))
        .toMatchObject({
          border: {
            origin: 'top-left',
            reveal: 'draw-both',
            exitReveal: 'erase-both',
            roundness: 0,
            width: 6,
          },
        });
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
        .click();
      await blocks.first().click();
      await expect(
        inspector.getByRole('button', {
          name: label('gallery.videoReview.borderOrigin'),
          exact: true,
        })
      ).toContainText(label('gallery.videoReview.borderOrigin_top-center'));
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.redo'), exact: true })
        .click();
      await blocks.first().click();
      await expect
        .poll(() => persistedFocus(page))
        .toMatchObject({ border: { origin: 'top-left' } });
      await chooseInspectorValue(
        page,
        hold,
        label('gallery.videoReview.focusReveal'),
        label('gallery.videoReview.borderRipple')
      );
      await expect
        .poll(() => persistedFocus(page))
        .toMatchObject({ border: { origin: 'top-left', motion: 'ripple', loop: true } });
      const authored = (await persistedFocus(page))!;
      const border = authored.border!;
      const start = authored.sourceAnchor?.start ?? authored.start;
      const end = authored.sourceAnchor?.end ?? authored.end;
      const times = {
        enter: start + authored.enter.duration / 2,
        hold: start + authored.enter.duration,
        exit: end - authored.exit.duration / 2,
      };
      const overlay = dialog.locator(
        '[data-ui="gallery.videoReview.stage"] [data-ui="gallery.videoReview.border"]'
      );
      for (const [phase, expected] of [
        ['enter', [true, true, false]],
        ['hold', [true, true, true]],
        ['exit', [false, false, true]],
      ] as const) {
        await seekGallery(page, times[phase]);
        await expect.poll(() => galleryStroke(overlay, border)).toEqual(expected);
        await page.screenshot({
          path: info.outputPath(`gallery-border-${phase}.png`),
          fullPage: false,
        });
      }
      await galleryWidths(page, dialog, inspector, locale, info);
      await page.reload();
      await expect(dialog).toBeVisible();
      await blocks.first().click();
      await expect
        .poll(() => persistedFocus(page))
        .toMatchObject({
          border: {
            origin: 'top-left',
            reveal: 'draw-both',
            exitReveal: 'erase-both',
            motion: 'ripple',
          },
        });
      await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
      await dialog.locator('[data-ui="gallery.videoReview.openVideoEditor"]').click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
        )
        .toBe(1);
      const [tab] = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
      const target = new URL(tab!.url!);
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}${target.search}`);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect.poll(() => readNativeVideoProject(page)).toBeDefined();
      const transferred = (await readNativeVideoProject(page))!;
      expect(isValidVideoProject(transferred)).toBe(true);
      expect(transferred.version).toBeGreaterThanOrEqual(48);
      const region = transferred.motionRegions!.find((entry) => entry.border)!;
      expect(region.border).toMatchObject({
        origin: 'top-left',
        reveal: 'draw-both',
        exitReveal: 'erase-both',
        motion: 'ripple',
      });
      // This journey transfers real data; no videoProjects seed can overwrite it on reload.
      await page.locator(`[data-timeline-effect-segment="${region.id}"] button`).first().click();
      const nativeInspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      await nativeInspector
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAppearance'),
          exact: true,
        })
        .click();
      await chooseOrigin(nativeInspector, locale, 'top-right');
      const read = () => readNativeVideoProject(page);
      await expect
        .poll(
          async () => (await read())?.motionRegions?.find((entry) => entry.id === region.id)?.border
        )
        .toMatchObject({ origin: 'top-right' });
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(
          async () => (await read())?.motionRegions?.find((entry) => entry.id === region.id)?.border
        )
        .toMatchObject({ origin: 'top-left' });
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(
          async () => (await read())?.motionRegions?.find((entry) => entry.id === region.id)?.border
        )
        .toMatchObject({ origin: 'top-right' });
      await chooseOrigin(nativeInspector, locale, 'top-left');
      await nativeInspector
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAnimation'),
          exact: true,
        })
        .click();
      const nativeEnter = phaseGroup(nativeInspector, locale, 'enter');
      const nativeExit = phaseGroup(nativeInspector, locale, 'exit');
      await chooseInspectorValue(
        page,
        nativeEnter,
        label('gallery.videoReview.focusReveal'),
        label('gallery.videoReview.borderDrawing')
      );
      await chooseInspectorValue(
        page,
        nativeEnter,
        label('gallery.videoReview.focusReveal'),
        label('gallery.videoReview.borderBothSides')
      );
      await chooseInspectorValue(
        page,
        nativeExit,
        label('gallery.videoReview.focusReveal'),
        label('gallery.videoReview.borderErasing')
      );
      await chooseInspectorValue(
        page,
        nativeExit,
        label('gallery.videoReview.focusReveal'),
        label('gallery.videoReview.borderBothSides')
      );
      const stage = page.locator('[data-preview-stage-canvas]');
      const samples: {
        time: number;
        x: number;
        y: number;
        expected: number[];
        visible: boolean;
      }[] = [];
      for (const [phase, expected] of [
        ['enter', [true, true, false]],
        ['hold', [true, true, true]],
        ['exit', [false, false, true]],
      ] as const) {
        await seekNative(page, times[phase]);
        await expect
          .poll(() => nativeStroke(stage, transferred.width, transferred.height, border))
          .toEqual(expected);
        await page.screenshot({
          path: info.outputPath(`native-border-${phase}.png`),
          fullPage: false,
        });
        if (phase !== 'hold') {
          const pixels = await nativePixels(stage, transferred.width, transferred.height, border);
          for (const [index, point] of landmarks(
            transferred.width,
            transferred.height,
            border
          ).entries()) {
            samples.push({
              time: times[phase],
              x: Math.round(point.x),
              y: Math.round(point.y),
              expected: pixels[index]!,
              visible: expected[index],
            });
          }
        }
      }
      const resize = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
      if (size.width === 1920) {
        for (const width of [359, 360, 361]) {
          const current = (await nativeInspector.boundingBox())!.width;
          const box = (await resize.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + 12);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + current - width, box.y + 12);
          await page.mouse.up();
          await expect
            .poll(async () => Math.round((await nativeInspector.boundingBox())!.width))
            .toBe(width);
          await nativeEnter.scrollIntoViewIfNeeded();
          await expect(nativeEnter).toBeVisible();
          expect(
            await nativeInspector.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
          ).toBe(true);
          await page.screenshot({
            path: info.outputPath(`native-border-width-${width}.png`),
            fullPage: false,
          });
        }
      } else {
        await page.setViewportSize({ width: 1100, height: size.height });
        const workspace = page.locator('[data-ui="video-editor.workspace.root"]');
        await workspace.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        await nativeEnter.scrollIntoViewIfNeeded();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.screenshot({
          path: info.outputPath('native-border-narrow.png'),
          fullPage: false,
        });
        await page.setViewportSize(size);
      }
      await expect
        .poll(
          async () => (await read())?.motionRegions?.find((entry) => entry.id === region.id)?.border
        )
        .toMatchObject({
          origin: 'top-left',
          reveal: 'draw-both',
          exitReveal: 'erase-both',
          motion: 'ripple',
        });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect
        .poll(
          async () => (await read())?.motionRegions?.find((entry) => entry.id === region.id)?.border
        )
        .toMatchObject({ origin: 'top-left', reveal: 'draw-both', exitReveal: 'erase-both' });
      if (size.width === 1280) {
        const final = (await read())!;
        const result = await encodedNativeVideoSamples(page, host.origin, final, 'WEBM', samples, {
          start: 0,
          end: 3,
        });
        await info.attach('encoded-border-origins', {
          body: JSON.stringify(result.samples),
          contentType: 'application/json',
        });
        expect(result.size).toBeGreaterThan(0);
        // Absent strokes expose moving source pixels; their RGB is not a border parity target.
        for (const [index, sample] of result.samples.entries()) {
          if (samples[index]!.visible) expect(sample.error).toBeLessThanOrEqual(10);
          else expect(sample.pixel.slice(0, 3).every((channel) => channel >= 245)).toBe(false);
        }
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
