import type { Page, TestInfo } from '@playwright/test';
import { expect } from '../support/extension-fixture';
import type { BrowserContext } from '@playwright/test';
import {
  dragSimplify,
  waitForSimplify,
  readSimplifyStripes,
  readSimplifyGlyph,
} from './extension-critical-simplify-pixels.helpers';

export type SimplifyNativeMode = 'drawing' | 'crop' | 'video-recording';

export async function grantNativeSimplifyCapture(popup: Page) {
  await popup.evaluate(() => {
    const grant = document.createElement('button');
    grant.textContent = 'Grant Simplify capture proof';
    grant.onclick = async () => {
      grant.dataset['granted'] = String(
        await chrome.permissions.request({ origins: ['<all_urls>'] })
      );
    };
    document.body.append(grant);
  });
  const grant = popup.getByRole('button', {
    name: 'Grant Simplify capture proof',
    exact: true,
  });
  await grant.click();
  await expect(grant).toHaveAttribute('data-granted', 'true');
  await popup.evaluate(async () => {
    const stored = await chrome.storage.sync.get('sniptale_settings');
    const current: unknown = stored['sniptale_settings'];
    await chrome.storage.sync.set({
      sniptale_settings: {
        ...(typeof current === 'object' && current !== null ? current : {}),
        captureAction: 'edit',
      },
    });
  });
}

export async function prepareNativeSimplifySource(page: Page, mode: SimplifyNativeMode) {
  await page.bringToFront();
  await page.evaluate(() => {
    const target = document.createElement('section');
    target.id = 'simplify-source-proof';
    target.style.cssText = [
      'position:fixed;left:450px;top:180px;width:340px;height:160px;',
      'background:#f4f7fa;color:#173b63;font:24px/28px sans-serif;',
      'white-space:pre;padding:16px;z-index:1',
    ].join('');
    target.textContent = 'Account settings\nContact details\nSave your changes';
    document.body.append(target);
  });
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page
    .locator(`[data-ui="content.toolbar.mode-option.${mode === 'crop' ? 'drawing' : mode}"]`)
    .click();
  if (mode === 'crop') await selectSimplifyCrop(page);
}

async function selectSimplifyCrop(page: Page) {
  if (!(await page.locator('[data-ui="content.toolbar.timer-button"]').count())) {
    await page.locator('[data-ui="content.toolbar.settings-button"]').click();
    await page.locator('[data-ui="content.toolbar.settings.show-hidden-buttons"]').click();
    const compact = page.getByRole('button', { name: /^Compact menu view/u });
    if ((await compact.getAttribute('aria-pressed')) !== 'true') await compact.click();
    await page.keyboard.press('Escape');
  }
  await page.locator('[data-ui="content.toolbar.timer-button"]').click();
  await page
    .locator('[data-ui="content.toolbar.timer-menu"]')
    .getByText('No delay', { exact: true })
    .click();
  await page.locator('[data-ui="content.toolbar.capture-selection-button"]').click();
  await dragSimplify(page, { x: 400, y: 150 }, { x: 900, y: 390 });
  if (
    (await page.locator('.sniptale-selection-toolbar').getAttribute('data-crop-mode')) !== 'drawing'
  )
    await page.locator('[data-ui="content.crop.mode.drawing"]').click();
  await expect(page.locator('.sniptale-selection-toolbar')).toHaveAttribute(
    'data-crop-mode',
    'drawing'
  );
}

export async function drawNativeAutomaticSimplify(
  page: Page,
  mode: SimplifyNativeMode,
  info: TestInfo
) {
  const scope = nativeDrawingScope(page, mode);
  await scope.locator('[data-ui="content.toolbar.drawing.simplify"]').click();
  const automaticControl = page.locator(
    '[data-ui="content.toolbar.drawing-options.simplify.automatic"]'
  );
  if ((await automaticControl.getAttribute('aria-pressed')) !== 'true')
    await automaticControl.click();
  await page.locator('[data-ui="content.toolbar.drawing-options.simplify.content-text"]').click();
  await page.locator('[data-ui="content.toolbar.drawing-options.simplify.thickness-0.5"]').click();
  const colorToggle = page.locator('[data-ui="content.toolbar.drawing-options.simplify.color"]');
  if ((await colorToggle.getAttribute('aria-pressed')) === 'true') await colorToggle.click();

  const roi = { x: 460, y: 190, width: 320, height: 120 };
  const beforePixels = await page.screenshot({
    path: info.outputPath(`${mode}-source-region.png`),
    clip: roi,
    fullPage: false,
  });
  const probe = { x: roi.x + 12, y: roi.y + 12, width: 90, height: 30 };
  const beforeProbe = await page.screenshot({ clip: probe, fullPage: false });
  await page.mouse.move(460, 190);
  await page.mouse.down();
  await page.mouse.move(780, 310, { steps: 5 });
  await expect(page.locator('[data-ui="content.drawing.simplify-private"]')).toBeVisible();
  await expect(page.locator('[data-ui="content.drawing.simplify-private"]')).toHaveCSS(
    'backdrop-filter',
    'blur(2px)'
  );
  await expect(page.locator('[data-ui="content.drawing.simplify-private"]')).toHaveCSS(
    'border-style',
    'dashed'
  );
  await expect(page.locator('[data-ui="content.drawing.simplify-private"]')).toHaveCSS(
    'border-color',
    'rgb(37, 99, 235)'
  );
  await page.locator('[data-ui="content.drawing.simplify-private"]').evaluate((node) => {
    const root = node.getRootNode() as ShadowRoot | Document;
    const state = {
      samples: [] as { covered: boolean; present: boolean; capturing: boolean; pending: boolean }[],
      active: true,
    };
    (window as typeof window & { __simplifyFrames?: typeof state }).__simplifyFrames = state;
    const sample = () => {
      if (!state.active) return;
      const mask = root.querySelector<HTMLElement>('[data-ui="content.drawing.simplify-private"]');
      const style = mask && getComputedStyle(mask);
      const capturing =
        root instanceof ShadowRoot
          ? root.host.classList.contains('sniptale-capture-ui-hidden')
          : document.body.classList.contains('sniptale-capture-ui-hidden');
      state.samples.push({
        present: Boolean(mask && mask.getBoundingClientRect().width > 0),
        capturing,
        covered: Boolean(
          mask &&
          style &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          mask.getBoundingClientRect().width > 0
        ),
        pending: Boolean(root.querySelector('[data-ui="content.drawing.simplify-pending"]')),
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const draftPixels = await page.screenshot({ clip: probe, fullPage: false });
  expect(draftPixels.equals(beforeProbe)).toBe(false);
  await page.screenshot({ path: info.outputPath(`${mode}-draft.png`), fullPage: false });
  await page.mouse.up();
  await expect(page.locator('[data-ui="content.drawing.simplify-private"]')).toBeVisible();
  const releasePixels = await page.screenshot({ clip: probe, fullPage: false });
  expect(releasePixels.equals(beforeProbe)).toBe(false);
  await page.screenshot({ path: info.outputPath(`${mode}-release.png`), fullPage: false });
  await waitForSimplify(page);
  const frames = await page.evaluate(() => {
    const state = (
      window as typeof window & {
        __simplifyFrames?: {
          samples: { covered: boolean; present: boolean; capturing: boolean; pending: boolean }[];
          active: boolean;
        };
      }
    ).__simplifyFrames;
    if (!state) throw new Error('Simplify frame observation missing');
    state.active = false;
    return state.samples;
  });
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.every((frame) => frame.present && (frame.covered || frame.capturing))).toBe(true);
  expect(frames.some((frame) => frame.pending)).toBe(true);
  return beforePixels;
}

export async function assertNativeAutomaticRaster(
  page: Page,
  mode: SimplifyNativeMode,
  beforePixels: Buffer,
  info: TestInfo
) {
  const roi = { x: 460, y: 190, width: 320, height: 120 };
  const raster = page.locator('[data-ui="content.drawing.simplify-private"]');
  expect(
    await raster.evaluate(
      (node) => node.shadowRoot === null && !node.querySelector('img,canvas,[src],[href]')
    )
  ).toBe(true);
  await expect(page.locator('#simplify-source-proof')).toHaveText(
    'Account settings\nContact details\nSave your changes'
  );
  await expect(page.locator('#simplify-source-proof')).toHaveCSS(
    'background-color',
    'rgb(244, 247, 250)'
  );
  await expect
    .poll(async () => (await page.screenshot({ clip: roi, fullPage: false })).equals(beforePixels))
    .toBe(false);
  const afterPixels = await page.screenshot({
    path: info.outputPath(`${mode}-automatic-region.png`),
    clip: roi,
    fullPage: false,
  });
  const pixelProof = await page.evaluate(
    async ({ encoded, original }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Pixel proof canvas missing');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      const source = new Image();
      source.src = `data:image/png;base64,${original}`;
      await source.decode();
      context.drawImage(source, 0, 0);
      const previous = context.getImageData(0, 0, image.width, image.height).data;
      let background = 0,
        changed = 0,
        originalColoredInk = 0,
        retainedColoredInk = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const x = (index / 4) % image.width;
        const y = Math.floor(index / (4 * image.width));
        if (x >= 8 && x < image.width - 8 && y >= 8 && y < image.height - 8) {
          // This fixture has saturated blue text; neutral Simplify bars must replace
          // it. A changed/blurred screenshot is not sufficient acceptance evidence.
          if (
            Math.max(previous[index]!, previous[index + 1]!, previous[index + 2]!) -
              Math.min(previous[index]!, previous[index + 1]!, previous[index + 2]!) >
            40
          )
            originalColoredInk++;
          if (
            Math.max(pixels[index]!, pixels[index + 1]!, pixels[index + 2]!) -
              Math.min(pixels[index]!, pixels[index + 1]!, pixels[index + 2]!) >
            40
          )
            retainedColoredInk++;
        }

        if (
          Math.abs(pixels[index]! - previous[index]!) > 8 ||
          Math.abs(pixels[index + 1]! - previous[index + 1]!) > 8 ||
          Math.abs(pixels[index + 2]! - previous[index + 2]!) > 8
        )
          changed++;

        if (
          Math.abs(pixels[index]! - 244) <= 6 &&
          Math.abs(pixels[index + 1]! - 247) <= 6 &&
          Math.abs(pixels[index + 2]! - 250) <= 6
        )
          background++;
      }
      return {
        originalColoredInk,
        retainedColoredInk,
        backgroundRatio: background / (image.width * image.height),
        changedRatio: changed / (image.width * image.height),
      };
    },
    { encoded: afterPixels.toString('base64'), original: beforePixels.toString('base64') }
  );
  expect(pixelProof.originalColoredInk).toBeGreaterThan(100);
  expect(
    pixelProof.retainedColoredInk,
    'Source text must be replaced by neutral bars, not merely blurred'
  ).toBe(0);
  expect(
    pixelProof.backgroundRatio,
    'Automatic Simplify must retain the source background at the requested CSS region'
  ).toBeGreaterThan(0.65);
  expect(
    pixelProof.changedRatio,
    'Automatic Simplify must replace source ink beyond selection handles'
  ).toBeGreaterThan(0.03);
}

export async function assertNativeAutomaticResize(
  page: Page,
  mode: SimplifyNativeMode,
  info: TestInfo
) {
  const scope = nativeDrawingScope(page, mode);
  const raster = page.locator('[data-ui="content.drawing.simplify-private"]');
  let initialStripes: number[] = [];
  await expect
    .poll(async () => {
      initialStripes = await readSimplifyStripes(page);
      return Math.min(...initialStripes);
    })
    .toBeGreaterThan(80);
  await page.screenshot({
    path: info.outputPath(`${mode}-automatic.png`),
    fullPage: false,
    animations: 'disabled',
  });
  await scope.locator('[data-ui="content.toolbar.drawing.select"]').click();
  await page.mouse.click(540, 240);
  const beforeResize = await raster.boundingBox();
  if (!beforeResize) throw new Error('Automatic mask missing before resize');
  await page.mouse.move(780, 250);
  await page.mouse.down();
  await page.mouse.move(820, 250, { steps: 6 });
  await page.screenshot({
    path: info.outputPath(`${mode}-automatic-resize-drag.png`),
    fullPage: false,
  });
  await page.mouse.up();
  await waitForSimplify(page);
  await expect
    .poll(async () => (await raster.boundingBox())?.width ?? 0)
    .toBeGreaterThan(beforeResize.width + 30);
  await expect
    .poll(async () => {
      const resized = await readSimplifyStripes(page);
      return Math.max(...resized.map((width, index) => Math.abs(width - initialStripes[index]!)));
    }, 'Resized automatic masks must recompute original stripe widths instead of stretching them')
    .toBeLessThanOrEqual(2);
  await page.screenshot({
    path: info.outputPath(`${mode}-automatic-resized.png`),
    fullPage: false,
    animations: 'disabled',
  });
}

export async function assertNativeManualMove(page: Page, mode: SimplifyNativeMode, info: TestInfo) {
  const scope = nativeDrawingScope(page, mode);
  const raster = page.locator('[data-ui="content.drawing.simplify-private"]');
  await page.locator('[data-ui="content.toolbar.drawing-options.simplify.automatic"]').click();
  await page.locator('[data-ui="content.toolbar.drawing-options.simplify.manual-image"]').click();
  await waitForSimplify(page);
  const colorToggle = page.locator('[data-ui="content.toolbar.drawing-options.simplify.color"]');
  if ((await colorToggle.getAttribute('aria-pressed')) !== 'true') await colorToggle.click();
  await page
    .locator('[data-ui="content.toolbar.drawing-options.quick-colors"] button[title="#ff7f50"]')
    .click();
  await waitForSimplify(page);
  await scope.locator('[data-ui="content.toolbar.drawing.select"]').click();
  const beforeMove = await raster.boundingBox();
  if (!beforeMove) throw new Error('Accepted Simplify raster missing');
  await dragSimplify(page, { x: 540, y: 240 }, { x: 565, y: 255 });
  await waitForSimplify(page);
  await expect.poll(async () => (await raster.boundingBox())?.x).not.toBe(beforeMove.x);
  if (mode !== 'video-recording') {
    if (mode === 'crop') await page.locator('[data-ui="content.crop.undo"]').click();
    else await page.keyboard.press('Control+z');
    await expect.poll(async () => (await raster.boundingBox())?.x).toBe(beforeMove.x);
    if (mode === 'crop') await page.locator('[data-ui="content.crop.redo"]').click();
    else await page.keyboard.press('Control+Shift+z');
    await expect.poll(async () => (await raster.boundingBox())?.x).not.toBe(beforeMove.x);
  }
  await page.screenshot({
    path: info.outputPath(`${mode}-manual-moved.png`),
    fullPage: false,
  });
}

export async function assertNativeManualResize(
  page: Page,
  mode: SimplifyNativeMode,
  info: TestInfo
) {
  const raster = page.locator('[data-ui="content.drawing.simplify-private"]');
  await page.mouse.click(540, 240);
  const manualBefore = await raster.boundingBox();
  if (!manualBefore) throw new Error('Manual image missing before resize');
  let beforeGlyph = { count: 0, width: 0, height: 0, fillFraction: 0 };
  await expect
    .poll(async () => {
      beforeGlyph = await readSimplifyGlyph(page, manualBefore);
      return (
        beforeGlyph.count > 0 &&
        beforeGlyph.fillFraction > 0.85 &&
        beforeGlyph.width <= 34 &&
        beforeGlyph.height <= 34
      );
    }, 'Large ManualImage tile must contain a capped glyph')
    .toBe(true);
  await page.screenshot({
    path: info.outputPath(`${mode}-manual-before-resize.png`),
    fullPage: false,
    animations: 'disabled',
  });
  const handle = {
    x: manualBefore.x + manualBefore.width,
    y: manualBefore.y + manualBefore.height / 2,
  };
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 120, handle.y, { steps: 6 });
  const manualDuring = await raster.boundingBox();
  if (!manualDuring) throw new Error('Manual resize preview missing');
  expect(
    (await readSimplifyGlyph(page, manualDuring)).count,
    'ManualImage resize preview must keep only flat fill'
  ).toBe(0);
  await page.screenshot({
    path: info.outputPath(`${mode}-manual-resize-drag.png`),
    fullPage: false,
    animations: 'disabled',
  });
  await page.mouse.up();
  await waitForSimplify(page);
  await expect
    .poll(async () => (await raster.boundingBox())?.width ?? 0)
    .toBeGreaterThan(manualBefore.width + 110);
  await expect
    .poll(async () => {
      const bounds = await raster.boundingBox();
      if (!bounds) return Infinity;
      const glyph = await readSimplifyGlyph(page, bounds);
      if (!glyph.count || glyph.fillFraction <= 0.85) return Infinity;
      return Math.max(
        Math.abs(glyph.width - beforeGlyph.width),
        Math.abs(glyph.height - beforeGlyph.height)
      );
    }, 'Width-only ManualImage resize must preserve actual glyph width and height')
    .toBeLessThanOrEqual(2);
  await page.screenshot({
    path: info.outputPath(`${mode}-manual-resized.png`),
    fullPage: false,
    animations: 'disabled',
  });
}

export async function captureSimplifyToEditor(
  context: BrowserContext,
  page: Page,
  mode: SimplifyNativeMode
) {
  let opened: Promise<Page>;
  if (mode === 'crop') {
    await page.locator('.sniptale-selection-capture-menu-trigger').click();
    opened = context.waitForEvent('page', { timeout: 15_000 });
    await page.locator('[data-ui="content.selection.capture-action-option.edit"]').click();
  } else {
    if (!(await page.locator('[data-ui="content.toolbar.capture-visible-button"]').count())) {
      await page.locator('[data-ui="content.toolbar.settings-button"]').click();
      await page.locator('[data-ui="content.toolbar.settings.show-hidden-buttons"]').click();
      const compact = page.getByRole('button', { name: /^Compact menu view/u });
      if ((await compact.getAttribute('aria-pressed')) !== 'true') await compact.click();
      await page.keyboard.press('Escape');
    }
    await page.locator('[data-ui="content.toolbar.capture-visible-settings-button"]').click();
    opened = context.waitForEvent('page', { timeout: 15_000 });
    await page.locator('[data-ui="content.toolbar.capture-visible-action.edit"]').click();
  }
  return opened;
}

function nativeDrawingScope(page: Page, mode: SimplifyNativeMode) {
  return mode === 'crop'
    ? page.locator('[data-ui="content.crop.drawing-slot"]')
    : page.locator('[data-ui="content.toolbar.root"]');
}

async function prepareNestedSimplifySource(page: Page) {
  await page.evaluate(() => {
    for (const child of Array.from(document.body.children))
      if (child instanceof HTMLElement && !child.shadowRoot) child.style.display = 'none';
    Object.assign(document.documentElement.style, { overflow: 'hidden', height: '100%' });
    Object.assign(document.body.style, {
      overflow: 'hidden',
      height: '100%',
      margin: '0',
      padding: '0',
    });
    const fixture = document.createElement('div');
    fixture.style.cssText = 'position:fixed;inset:0;background:white;z-index:1';
    const header = document.createElement('div');
    header.style.cssText =
      'position:absolute;left:420px;top:104px;width:700px;height:60px;background:white;color:#173b63;font:24px/32px sans-serif';
    const title = document.createElement('div');
    title.textContent = 'Account settings';
    title.style.cssText = 'position:absolute;left:40px;top:8px';
    const button = document.createElement('button');
    button.textContent = 'Apply changes';
    button.style.cssText =
      'position:absolute;left:420px;top:8px;width:160px;height:40px;border:0;background:#1b68b3;color:white;font:18px sans-serif';
    header.append(title, button);
    const scroll = document.createElement('div');
    scroll.id = 'simplify-internal-scroll-proof';
    scroll.style.cssText =
      'position:absolute;left:60px;top:180px;width:calc(100% - 120px);height:calc(100% - 200px);overflow:auto;background:#f4f7fa';
    const content = document.createElement('div');
    content.style.cssText = 'height:3000px;position:relative';
    for (const top of [60, 340, 620, 900]) {
      const text = document.createElement('div');
      text.textContent = 'Contact information';
      text.style.cssText = `position:absolute;left:400px;top:${top}px;font:24px/32px sans-serif;color:#173b63`;
      content.append(text);
    }
    scroll.append(content);
    fixture.append(header, scroll);
    document.body.append(fixture);
    scroll.scrollTop = 160;
  });
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
  await page.locator('[data-ui="content.toolbar.drawing.simplify"]').click();
  const automatic = page.locator('[data-ui="content.toolbar.drawing-options.simplify.automatic"]');
  if ((await automatic.getAttribute('aria-pressed')) !== 'true') await automatic.click();
  await page.locator('[data-ui="content.toolbar.drawing-options.simplify.content-text"]').click();
  const color = page.locator('[data-ui="content.toolbar.drawing-options.simplify.color"]');
  if ((await color.getAttribute('aria-pressed')) === 'true') await color.click();
}

async function sampleNativeSimplifyInk(
  page: Page,
  clip: { x: number; y: number; width: number; height: number }
) {
  const png = await page.screenshot({ clip, fullPage: false, animations: 'disabled' });
  return page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Pixel proof context unavailable');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let blue = 0,
      gray = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]!,
        g = pixels[i + 1]!,
        b = pixels[i + 2]!;
      if (r < 100 && b - r > 40 && g - r > 15) blue++;
      if (r >= 100 && r <= 220 && Math.max(r, g, b) - Math.min(r, g, b) <= 45) gray++;
    }
    return { blue, gray };
  }, png.toString('base64'));
}

async function waitForNativeSimplifyCount(page: Page, count: number) {
  await expect(page.locator('[data-ui="content.drawing.simplify-private"]')).toHaveCount(count);
  await expect(page.locator('[data-ui="content.drawing.simplify-pending"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="content.drawing.simplify-feedback"]')).toHaveCount(0);
}

export async function assertNativeNestedScrollSimplify(page: Page, info: TestInfo) {
  page.setDefaultTimeout(15_000);
  await prepareNestedSimplifySource(page);
  const word = { x: 464, y: 116, width: 230, height: 30 };
  const button = { x: 850, y: 120, width: 140, height: 26 };
  const original = await sampleNativeSimplifyInk(page, word);
  const originalButton = await sampleNativeSimplifyInk(page, button);
  expect(original.blue).toBeGreaterThan(100);
  await dragSimplify(page, { x: 450, y: 108 }, { x: 1000, y: 160 });
  await waitForNativeSimplifyCount(page, 1);
  await expect
    .poll(async () => (await sampleNativeSimplifyInk(page, word)).blue)
    .toBeLessThan(original.blue * 0.1);
  expect((await sampleNativeSimplifyInk(page, word)).gray).toBeGreaterThan(100);
  const headerMask = page.locator('[data-ui="content.drawing.simplify-private"]').first();
  const beforeScroll = await headerMask.boundingBox();
  if (!beforeScroll) throw new Error('Header mask unavailable');
  const scroll = page.locator('#simplify-internal-scroll-proof');
  await scroll.evaluate((node) => {
    node.scrollTop = 240;
  });
  await expect.poll(async () => (await headerMask.boundingBox())?.y).toBeCloseTo(beforeScroll.y, 0);
  await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
  await page.mouse.click(540, 135);
  await dragSimplify(page, { x: 1000, y: 134 }, { x: 1020, y: 134 });
  await waitForNativeSimplifyCount(page, 1);
  await expect
    .poll(async () => (await headerMask.boundingBox())?.width ?? 0)
    .toBeGreaterThan(beforeScroll.width + 15);
  await expect
    .poll(async () => (await sampleNativeSimplifyInk(page, button)).blue)
    .toBeGreaterThan(originalButton.blue * 0.6);
  await expect
    .poll(async () => (await sampleNativeSimplifyInk(page, word)).gray)
    .toBeGreaterThan(100);
  await page.screenshot({ path: info.outputPath('nested-header-resized.png'), fullPage: false });
  await page.locator('[data-ui="content.toolbar.drawing.simplify"]').click();
  const body = { x: 464, y: 280, width: 250, height: 30 };
  const originalBody = await sampleNativeSimplifyInk(page, body);
  expect(originalBody.blue).toBeGreaterThan(100);
  await dragSimplify(page, { x: 450, y: 268 }, { x: 800, y: 330 });
  await waitForNativeSimplifyCount(page, 2);
  await expect
    .poll(async () => (await sampleNativeSimplifyInk(page, body)).blue)
    .toBeLessThan(originalBody.blue * 0.1);
  await scroll.evaluate((node) => {
    node.scrollTop = 440;
  });
  await expect.poll(async () => (await headerMask.boundingBox())?.y).toBeCloseTo(beforeScroll.y, 0);
  await expect
    .poll(async () => (await sampleNativeSimplifyInk(page, button)).blue)
    .toBeGreaterThan(originalButton.blue * 0.6);
  await expect
    .poll(async () => (await sampleNativeSimplifyInk(page, word)).gray)
    .toBeGreaterThan(100);
  await page.screenshot({
    path: info.outputPath('nested-body-clipped-header-fixed.png'),
    fullPage: false,
  });
}
