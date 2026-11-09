import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

async function inkAt(canvas: Locator, x: number, y: number) {
  return canvas.evaluate(
    (node, point) => {
      if (!(node instanceof HTMLCanvasElement)) throw new Error('Missing drawing canvas');
      const rect = node.getBoundingClientRect();
      const scale = node.width / rect.width;
      const data = node
        .getContext('2d')!
        .getImageData(
          Math.round((point.x - rect.x - 2) * scale),
          Math.round((point.y - rect.y - 2) * scale),
          Math.ceil(4 * scale),
          Math.ceil(4 * scale)
        ).data;
      return data.filter((channel, index) => index % 4 === 3 && channel > 80).length;
    },
    { x, y }
  );
}

async function drawShape(
  page: Page,
  kind: string,
  x: number,
  y: number,
  width: number,
  height: number
) {
  await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
  await page.mouse.click(1100, 480);
  const tool = page.locator('[data-ui="content.toolbar.drawing.shape"]');
  const option = page.locator(`[data-ui="content.toolbar.drawing-options.shape.kind-${kind}"]`);
  if ((await tool.getAttribute('aria-pressed')) !== 'true') await tool.click();
  if (!(await option.isVisible())) await tool.click();
  await option.click();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + width, y + height, { steps: 5 });
  await expect(page.locator('[data-ui="content.drawing.alignment-guides"]')).toHaveCount(0);
  await page.mouse.up();
}

async function expectGuide(page: Page, axis: string, coordinate: number) {
  const guide = page.locator(`[data-ui="content.drawing.alignment-guides"] [data-axis="${axis}"]`);
  await expect(page.locator('[data-ui="content.drawing.alignment-guides"]')).toBeVisible();
  await expect(guide).toBeAttached();
  const attribute = axis === 'x' ? 'x1' : 'y1';
  await expect
    .poll(async () => Number(await guide.getAttribute(attribute)))
    .toBeCloseTo(coordinate, 0);
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`page drawing aligns existing shapes and text ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await popup.evaluate(
        async (theme) => chrome.storage.local.set({ 'sniptale-theme-preference': theme }),
        size.width === 1280 ? 'light' : 'dark'
      );
      await page.evaluate(() => {
        const target = document.createElement('div');
        target.id = 'drawing-alignment-target';
        target.style.cssText =
          'position:absolute;left:600px;top:260px;width:160px;height:100px;background:#ddd;border-radius:8px';
        document.body.append(target);
      });
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
      const ink = page.locator(
        '[data-ui="content.drawing.surface"] canvas.sniptale-drawing-canvas'
      );
      const guides = page.locator('[data-ui="content.drawing.alignment-guides"]');
      await drawShape(page, 'rectangle', 300, 160, 100, 60);
      await page.mouse.move(320, 160);
      await page.mouse.down();
      await page.mouse.move(624, 264, { steps: 8 });
      await expectGuide(page, 'x', 600);
      await expectGuide(page, 'y', 260);
      await expect(guides.locator('[data-ui="content.drawing.alignment-marker"]')).not.toHaveCount(
        0
      );
      await expect(guides.locator('path[d="M 596 356 L 604 364 M 604 356 L 596 364"]')).toHaveCount(
        1
      );
      await page.screenshot({ path: info.outputPath('dom-alignment.png'), fullPage: false });
      await page.mouse.up();
      await expect(guides).toHaveCount(0);
      await expect.poll(() => inkAt(ink, 600, 275)).toBeGreaterThan(0);
      await page.keyboard.press('Control+z');
      await expect.poll(() => inkAt(ink, 300, 175)).toBeGreaterThan(0);
      await expect.poll(() => inkAt(ink, 600, 275)).toBe(0);
      await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
      await page.mouse.click(320, 160);
      await page.mouse.move(320, 160);
      await page.mouse.down();
      await page.mouse.move(624, 264, { steps: 5 });
      await expect(guides).toBeVisible();
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(guides).toHaveCount(0);
      await expect.poll(() => inkAt(ink, 300, 175)).toBeGreaterThan(0);
      await drawShape(page, 'rectangle', 800, 260, 200, 160);
      await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
      await page.mouse.click(320, 160);
      await page.mouse.move(320, 160);
      await page.mouse.down();
      await page.mouse.move(824, 264, { steps: 8 });
      await expectGuide(page, 'x', 800);
      await expectGuide(page, 'y', 260);
      await page.screenshot({ path: info.outputPath('neighbor-alignment.png'), fullPage: false });
      await page.mouse.up();
      await drawShape(page, 'ellipse', 500, 260, 200, 160);
      await drawShape(page, 'triangle', 250, 260, 200, 160);
      await expect.poll(() => inkAt(ink, 500, 340)).toBeGreaterThan(0);
      await page.locator('[data-ui="content.toolbar.drawing.text"]').click();
      await page.mouse.click(420, 350);
      await page.locator('[data-ui="content.drawing.text-input"]').fill('Note');
      await page.keyboard.press('Enter');
      const text = page.locator('[data-ui="content.drawing.text-object"]');
      await expect(text).toContainText('Note');
      for (const target of [
        { kind: 'rectangle', x: 800, centerX: 900 },
        { kind: 'ellipse', x: 500, centerX: 600 },
        { kind: 'triangle', x: 250, centerX: 350 },
      ]) {
        await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
        const before = (await text.boundingBox())!;
        await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
        await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
        await page.mouse.down();
        await page.mouse.move(target.centerX + 4, 343, { steps: 8 });
        await expectGuide(page, 'x', target.centerX);
        await expectGuide(page, 'y', 340);
        const preview = (await text.boundingBox())!;
        expect(Math.abs(preview.x + preview.width / 2 - target.centerX)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(preview.y + preview.height / 2 - 340)).toBeLessThanOrEqual(0.5);
        await page.screenshot({
          path: info.outputPath(`text-${target.kind}-center.png`),
          fullPage: false,
        });
        await page.mouse.up();
        await expect(guides).toHaveCount(0);
        if (target.kind === 'rectangle') {
          const centered = (await text.boundingBox())!;
          await page.mouse.move(target.centerX, 340);
          await page.mouse.down();
          await page.mouse.move(811 + centered.width / 2, 340, { steps: 6 });
          await expectGuide(page, 'x', 808);
          await page.mouse.up();
          expect(Math.abs((await text.boundingBox())!.x - 808)).toBeLessThanOrEqual(0.5);
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await popup.close();
      await page.close();
    }
  });
}

async function readTextLines(element: Locator) {
  return element.evaluate((node) => {
    const content =
      node instanceof HTMLTextAreaElement
        ? node.parentElement!.querySelector('[data-ui="content.drawing.text-mirror"]')!
        : node.querySelector('span')!;
    const range = document.createRange();
    range.selectNodeContents(content);
    const origin = content.getBoundingClientRect();
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
    return {
      text: node instanceof HTMLTextAreaElement ? node.value : content.textContent,
      width: origin.width,
      usedWidth:
        Math.max(...rects.map((rect) => rect.right - origin.left)) +
        parseFloat(getComputedStyle(content).paddingRight),
      lines: rects.map((rect) => ({ width: rect.width, top: rect.top - origin.top })),
    };
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`page drawing fits committed text without changing line breaks ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
      for (const value of [
        'Hi',
        '          Hi',
        'Hi          ',
        'A longer first line\nShort\nFinal line',
        'First\n\nLast',
        'Wrapped words '.repeat(40).trim(),
      ]) {
        await page.locator('[data-ui="content.toolbar.drawing.text"]').click();
        await page.mouse.click(350, 180);
        const input = page.locator('[data-ui="content.drawing.text-input"]');
        await input.fill(value);
        await expect(input).toHaveValue(value);
        const before = await readTextLines(input);
        await page.keyboard.press('Enter');
        const text = page.locator('[data-ui="content.drawing.text-object"]').last();
        await expect(text).toBeVisible();
        const after = await readTextLines(text);
        expect(after.text).toBe(value.trim());
        if (value === value.trim()) expect(after.lines).toEqual(before.lines);
        else expect(after.lines).toHaveLength(1);
        expect(after.width - after.usedWidth).toBeGreaterThanOrEqual(0);
        expect(after.width - after.usedWidth).toBeLessThanOrEqual(1);
        await page.screenshot({
          path: info.outputPath(`text-fit-${value.length}.png`),
          fullPage: false,
        });
        const box = (await text.boundingBox())!;
        await page.mouse.dblclick(box.x + 12, box.y + 12);
        await expect(input).toBeVisible();
        await input.fill('Cancelled edit');
        await page.keyboard.press('Escape');
        expect(await readTextLines(text)).toEqual(after);
        await page.keyboard.press('Control+z');
        await expect(page.locator('[data-ui="content.drawing.text-object"]')).toHaveCount(0);
      }
    } finally {
      await page.close();
      await popup.close();
    }
  });
}

async function drag(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
}
async function expectHandle(page: Page, x: number, y: number, scope?: Locator) {
  await expect
    .poll(async () => {
      const center = await (scope ?? page)
        .locator('[data-ui="content.drawing.selection-chrome"]')
        .evaluate(
          (node, point) => {
            if (!(node instanceof HTMLCanvasElement))
              throw new Error('Selection canvas unavailable');
            const ratio = node.width / innerWidth,
              radius = 11;
            const left = Math.round((point.x - radius) * ratio),
              top = Math.round((point.y - radius) * ratio);
            const data = node
              .getContext('2d')!
              .getImageData(
                left,
                top,
                Math.round(radius * 2 * ratio),
                Math.round(radius * 2 * ratio)
              );
            let minX = data.width,
              minY = data.height,
              maxX = -1,
              maxY = -1;
            for (let yy = 0; yy < data.height; yy++)
              for (let xx = 0; xx < data.width; xx++)
                if (data.data[(yy * data.width + xx) * 4 + 3]! > 0) {
                  minX = Math.min(minX, xx);
                  maxX = Math.max(maxX, xx);
                  minY = Math.min(minY, yy);
                  maxY = Math.max(maxY, yy);
                }
            return maxX < 0
              ? null
              : {
                  x: (left + (minX + maxX + 1) / 2) / ratio,
                  y: (top + (minY + maxY + 1) / 2) / ratio,
                };
          },
          { x, y }
        );
      return center ? Math.max(Math.abs(center.x - x), Math.abs(center.y - y)) : Infinity;
    })
    .toBeLessThanOrEqual(1);
}
async function expectGroupBounds(page: Page) {
  await expect
    .poll(() =>
      page.locator('[data-ui="content.drawing.selection-chrome"]').evaluate((node) => {
        if (!(node instanceof HTMLCanvasElement)) throw new Error('Selection canvas unavailable');
        const ratio = node.width / innerWidth,
          context = node.getContext('2d')!;
        return [
          [520, 219, 20, 3],
          [499, 235, 3, 20],
          [709, 235, 3, 20],
          [660, 269, 20, 3],
        ].map(([x, y, w, h]) => {
          const data = context.getImageData(
            Math.round(x! * ratio),
            Math.round(y! * ratio),
            Math.round(w! * ratio),
            Math.round(h! * ratio)
          ).data;
          return data.some((value, index) => index % 4 === 3 && value > 0);
        });
      })
    )
    .toEqual([true, true, true, true]);
}
async function enterDrawing(page: Page) {
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
  await page.locator('[data-ui="content.toolbar.drawing.shape"]').click();
  await page.locator('[data-ui="content.toolbar.drawing-options.shape.kind-rectangle"]').click();
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`page resize snaps page edges, bypasses with Alt and leaves creation free ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await page.evaluate(() => {
        const target = document.createElement('div');
        target.id = 'resize-alignment-target';
        target.style.cssText =
          'position:absolute;left:620px;top:320px;width:180px;height:140px;background:#dbeafe';
        target.textContent = 'Resize target';
        document.body.append(target);
      });
      await enterDrawing(page);
      await expect(page.locator('[data-ui="content.toolbar.drawing.shape"]')).toHaveAttribute(
        'title',
        /Alt/
      );
      await drag(page, { x: 400, y: 160 }, { x: 616, y: 316 });
      await expectHandle(page, 616, 316);
      await page.mouse.move(616, 316);
      await page.mouse.down();
      await page.mouse.move(624, 324, { steps: 4 });
      const guides = page.locator('[data-ui="content.drawing.alignment-guides"]');
      await expect(guides.locator('[data-axis="x"]')).toHaveAttribute('x1', '620');
      await expect(guides.locator('[data-axis="y"]')).toHaveAttribute('y1', '320');
      await page.screenshot({ path: info.outputPath('resize-snapped.png'), fullPage: false });
      await page.keyboard.down('Alt');
      await expect(guides).toHaveCount(0);
      await page.keyboard.up('Alt');
      await expect(guides.locator('line')).toHaveCount(2);
      await page.mouse.up();
      await expectHandle(page, 400, 160);
      await expectHandle(page, 620, 320);
      await page.mouse.move(620, 240);
      await page.mouse.down();
      await page.mouse.move(796, 240, { steps: 5 });
      await expect(guides.locator('[data-axis="x"]')).toHaveAttribute('x1', '800');
      await expect(guides.locator('[data-axis="y"]')).toHaveCount(0);
      await page.keyboard.down('Alt');
      await expect(guides).toHaveCount(0);
      await page.mouse.up();
      await page.keyboard.up('Alt');
      await expectHandle(page, 796, 240);
      await expectHandle(page, 400, 240);
      await page.screenshot({ path: info.outputPath('resize-alt-release.png'), fullPage: false });
    } finally {
      await popup.close();
      await page.close();
    }
  });

  test(`marquee starts over an unselected filled layer and selects only contained layers ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await enterDrawing(page);
      const fill = page.locator('[data-ui="content.toolbar.drawing-options.shape.fill-toggle"]');
      if ((await fill.getAttribute('aria-pressed')) !== 'true') await fill.click();
      await drag(page, { x: 350, y: 140 }, { x: 900, y: 450 });
      await page.keyboard.press('Escape');
      await drag(page, { x: 500, y: 220 }, { x: 560, y: 270 });
      await page.keyboard.press('Escape');
      await drag(page, { x: 650, y: 220 }, { x: 710, y: 270 });
      await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
      await page.mouse.click(300, 180);
      const actions = page.locator('[data-ui="drawing.selection.actions"]');
      await expect(actions).toHaveCount(0);
      await page.mouse.move(450, 200);
      await page.mouse.down();
      await expect(actions).toHaveCount(0);
      await page.mouse.move(740, 300, { steps: 6 });
      await page.screenshot({
        path: info.outputPath('marquee-over-background.png'),
        fullPage: false,
      });
      await page.mouse.up();
      await expectGroupBounds(page);
      await page.mouse.click(450, 200);
      await expectHandle(page, 350, 140);
      await expectHandle(page, 900, 450);
      await page.keyboard.down('Alt');
      await drag(page, { x: 450, y: 200 }, { x: 470, y: 210 });
      await page.keyboard.up('Alt');
      await expectHandle(page, 370, 150);
      await expectHandle(page, 920, 460);
      await page.screenshot({
        path: info.outputPath('selected-background-still-moves.png'),
        fullPage: false,
      });
    } finally {
      await popup.close();
      await page.close();
    }
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const mode of ['page', 'crop'] as const) {
    test(`selected outline moves from its center and resizes to a lower peer ${mode} ${name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      try {
        if (mode === 'page') await enterDrawing(page);
        if (mode === 'crop') {
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
          await drag(page, { x: 250, y: 120 }, { x: 1050, y: 500 });
          const drawingMode = page.locator('[data-ui="content.crop.mode.drawing"]');
          if ((await drawingMode.getAttribute('data-active')) !== 'true') await drawingMode.click();
        }
        const surface = page.locator(
          mode === 'crop'
            ? '[data-ui="content.crop.drawing-layer"]'
            : '[data-ui="content.drawing.surface"]'
        );
        const toolbar =
          mode === 'crop'
            ? page.locator('[data-ui="content.crop.drawing-slot"]')
            : page.locator('[data-ui="content.toolbar.root"]');
        await toolbar.locator('[data-ui="content.toolbar.drawing.shape"]').click();
        const option = toolbar.locator(
          '[data-ui="content.toolbar.drawing-options.shape.kind-rectangle"]'
        );
        if (!(await option.isVisible()))
          await toolbar.locator('[data-ui="content.toolbar.drawing.shape"]').click();
        await option.click();
        const fill = toolbar.locator(
          '[data-ui="content.toolbar.drawing-options.shape.fill-toggle"]'
        );
        if ((await fill.getAttribute('aria-pressed')) === 'true') await fill.click();
        await drag(page, { x: 400, y: 180 }, { x: 540, y: 240 });
        await expectHandle(page, 400, 180, surface);
        await expectHandle(page, 540, 240, surface);
        await page.keyboard.down('Alt');
        await drag(page, { x: 470, y: 210 }, { x: 490, y: 220 });
        await page.keyboard.up('Alt');
        await expectHandle(page, 420, 190, surface);
        await expectHandle(page, 560, 250, surface);
        await page.screenshot({
          path: info.outputPath('selected-outline-center-move.png'),
          fullPage: false,
        });
        await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
        await page.mouse.click(300, 300);
        await toolbar.locator('[data-ui="content.toolbar.drawing.shape"]').click();
        await drag(page, { x: 400, y: 380 }, { x: 700, y: 440 });
        await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
        await page.mouse.click(490, 220);
        await page.mouse.move(560, 220);
        await page.mouse.down();
        await page.mouse.move(696, 220, { steps: 6 });
        const guides = surface.locator('[data-ui="content.drawing.alignment-guides"]');
        await expect(guides.locator('[data-axis="x"]')).toHaveAttribute('x1', '700');
        await expect(guides.locator('[data-axis="y"]')).toHaveCount(0);
        await expect(
          guides.locator('path[d="M 696 376 L 704 384 M 704 376 L 696 384"]')
        ).toHaveCount(1);
        await page.screenshot({
          path: info.outputPath('peer-width-alignment.png'),
          fullPage: false,
        });
        await page.keyboard.down('Alt');
        await expect(guides).toHaveCount(0);
        await page.keyboard.up('Alt');
        await expect(guides.locator('[data-axis="x"]')).toHaveAttribute('x1', '700');
        await page.mouse.up();
        await expectHandle(page, 700, 220, surface);
        await page.mouse.click(300, 300);
        await toolbar.locator('[data-ui="content.toolbar.drawing.shape"]').click();
        await drag(page, { x: 480, y: 200 }, { x: 620, y: 280 });
        await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
        await page.mouse.click(450, 220);
        await expectHandle(page, 420, 190, surface);
        await page.keyboard.down('Alt');
        await drag(page, { x: 550, y: 220 }, { x: 570, y: 230 });
        await page.keyboard.up('Alt');
        await expectHandle(page, 440, 200, surface);
        await expectHandle(page, 720, 260, surface);
        await page.screenshot({
          path: info.outputPath('selected-layer-under-overlay.png'),
          fullPage: false,
        });
        await page.mouse.click(550, 230);
        await expectHandle(page, 480, 200, surface);
        await expectHandle(page, 620, 280, surface);
        await page.evaluate(() => {
          const target = document.createElement('div');
          target.style.cssText =
            'position:fixed;left:650px;top:200px;width:50px;height:100px;background:#ddd';
          document.body.append(target);
        });
        await page.mouse.move(620, 240);
        await page.mouse.down();
        await page.mouse.move(646, 240, { steps: 6 });
        await expect(guides.locator('[data-axis="x"]')).toHaveAttribute('x1', '650');
        await page.screenshot({
          path: info.outputPath('crop-and-page-dom-target.png'),
          fullPage: false,
        });
        await page.mouse.up();
        await expectHandle(page, 650, 240, surface);
        await expect(toolbar.locator('[data-ui="content.toolbar.drawing.select"]')).toHaveAttribute(
          'title',
          /Alt/
        );
      } finally {
        await popup.close();
        await page.close();
      }
    });
  }
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const mode of ['page', 'crop'] as const) {
    test(`drawing hover outlines and group gap drag ${mode} ${name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      try {
        await page.evaluate(() => {
          const host = document.querySelector('main');
          const measurement = document.getElementById('measurement-target')?.parentElement;
          if (host instanceof HTMLElement) host.style.display = 'none';
          if (measurement) measurement.style.display = 'none';
        });
        if (mode === 'page') await enterDrawing(page);
        else {
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
          await drag(page, { x: 250, y: 120 }, { x: 1050, y: 500 });
          const drawingMode = page.locator('[data-ui="content.crop.mode.drawing"]');
          if ((await drawingMode.getAttribute('data-active')) !== 'true') await drawingMode.click();
          await expect(page.locator('[data-ui="content.crop.drawing-slot"]')).toBeVisible();
        }
        const surface = page.locator(
          mode === 'crop'
            ? '[data-ui="content.crop.drawing-layer"]'
            : '[data-ui="content.drawing.surface"]'
        );
        const toolbar = page.locator(
          mode === 'crop'
            ? '[data-ui="content.crop.drawing-slot"]'
            : '[data-ui="content.toolbar.root"]'
        );
        const shapes = toolbar.locator('[data-ui="content.toolbar.drawing.shape"]');
        const rectangle = toolbar.locator(
          '[data-ui="content.toolbar.drawing-options.shape.kind-rectangle"]'
        );
        if (!(await rectangle.isVisible())) await shapes.click();
        await rectangle.click();
        const fill = toolbar.locator(
          '[data-ui="content.toolbar.drawing-options.shape.fill-toggle"]'
        );
        if ((await fill.getAttribute('aria-pressed')) === 'true') await fill.click();
        await drag(page, { x: 400, y: 180 }, { x: 470, y: 240 });
        await drag(page, { x: 650, y: 180 }, { x: 720, y: 240 });
        await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
        await page.mouse.click(300, 300);
        const chrome = surface.locator('[data-ui="content.drawing.selection-chrome"]');
        const ink = surface.locator('canvas.sniptale-drawing-canvas');
        await page.mouse.move(400, 210);
        await expect.poll(() => inkAt(chrome, 400, 210)).toBeGreaterThan(0);
        expect(await inkAt(chrome, 397, 177)).toBe(0);
        await page.screenshot({ path: info.outputPath('hover-outline.png'), fullPage: false });
        await page.mouse.move(300, 300);
        await expect.poll(() => inkAt(chrome, 400, 210)).toBe(0);
        await page.mouse.click(400, 210);
        await page.keyboard.down('Control');
        await page.mouse.click(650, 210);
        await page.keyboard.up('Control');
        await expect.poll(() => inkAt(chrome, 550, 180)).toBeGreaterThan(0);
        await page.mouse.move(550, 210);
        await expect(ink).toHaveCSS('cursor', 'move');
        await page.mouse.down();
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        );
        await expect(chrome).toHaveCSS('opacity', '1');
        await page.mouse.up();
        await expect(chrome).toHaveCSS('opacity', '1');
        await page.evaluate(() => {
          const target = document.createElement('div');
          target.style.cssText =
            'position:fixed;left:820px;top:340px;width:160px;height:100px;background:#ddd';
          document.body.append(target);
        });
        await page.mouse.down();
        await page.mouse.move(646, 306, { steps: 6 });
        const guides = surface.locator('[data-ui="content.drawing.alignment-guides"]');
        await expect(guides.locator('[data-axis="x"]')).toHaveAttribute('x1', '820');
        await expect(guides.locator('[data-axis="y"]')).toHaveAttribute('y1', '340');
        await expect(chrome).toHaveCSS('opacity', '0');
        await page.keyboard.down('Alt');
        await expect(guides).toHaveCount(0);
        await page.keyboard.up('Alt');
        await expect(guides.locator('[data-axis="x"]')).toHaveAttribute('x1', '820');
        await page.screenshot({
          path: info.outputPath('group-bounds-snapped.png'),
          fullPage: false,
        });
        await page.mouse.up();
        await expect(chrome).toHaveCSS('opacity', '1');
        await expect.poll(() => inkAt(ink, 500, 300)).toBeGreaterThan(0);
        await expect.poll(() => inkAt(ink, 820, 300)).toBeGreaterThan(0);
        await expect.poll(() => inkAt(chrome, 660, 280)).toBeGreaterThan(0);
        await expect.poll(() => inkAt(chrome, 660, 340)).toBeGreaterThan(0);
        if (mode === 'crop') await page.locator('[data-ui="content.crop.undo"]').click();
        else await page.keyboard.press('Control+z');
        await expect.poll(() => inkAt(ink, 400, 210)).toBeGreaterThan(0);
        await expect.poll(() => inkAt(ink, 720, 210)).toBeGreaterThan(0);
        await page.mouse.click(400, 210);
        await page.keyboard.down('Control');
        await page.mouse.click(650, 210);
        await page.keyboard.up('Control');
        await expect.poll(() => inkAt(chrome, 550, 180)).toBeGreaterThan(0);
        await page.keyboard.down('Alt');
        await page.keyboard.down('Shift');
        await page.mouse.move(550, 210);
        await page.mouse.down();
        await page.mouse.move(585, 234, { steps: 6 });
        await expect.poll(() => inkAt(ink, 455, 180)).toBeGreaterThan(0);
        await expect.poll(() => inkAt(ink, 400, 210)).toBe(0);
        await expect.poll(() => inkAt(ink, 455, 205)).toBe(0);
        await page.screenshot({ path: info.outputPath('group-shift-locked.png'), fullPage: false });
        await page.keyboard.up('Shift');
        await page.mouse.move(585, 235);
        await page.mouse.up();
        await page.keyboard.up('Alt');
        await expect.poll(() => inkAt(ink, 435, 230)).toBeGreaterThan(0);
        await expect.poll(() => inkAt(ink, 685, 230)).toBeGreaterThan(0);
        await expect.poll(() => inkAt(ink, 400, 210)).toBe(0);
        await expect.poll(() => inkAt(chrome, 585, 205)).toBeGreaterThan(0);
        await page.screenshot({ path: info.outputPath('group-gap-moved.png'), fullPage: false });
        if (mode === 'crop') await page.locator('[data-ui="content.crop.undo"]').click();
        else await page.keyboard.press('Control+z');
        await expect.poll(() => inkAt(ink, 400, 210)).toBeGreaterThan(0);
        await expect.poll(() => inkAt(ink, 650, 210)).toBeGreaterThan(0);
        await expect.poll(() => inkAt(ink, 435, 230)).toBe(0);
        for (const kind of ['pencil', 'arrow']) {
          await page.mouse.click(300, 300);
          const drawingTool = toolbar.locator(`[data-ui="content.toolbar.drawing.${kind}"]`);
          await drawingTool.click();
          const options = toolbar.locator(`[data-ui="content.toolbar.drawing-options.${kind}"]`);
          if (await options.isVisible()) await drawingTool.click();
          await page.mouse.move(400, 340);
          await page.mouse.down();
          await page.mouse.move(500, 380, { steps: 8 });
          await expect(guides).toHaveCount(0);
          await page.mouse.up();
          await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
          await page.mouse.click(450, 360);
          await page.mouse.move(450, 360);
          await page.mouse.down();
          await expect(chrome).toHaveCSS('opacity', '1');
          await page.mouse.move(904, 394, { steps: 8 });
          await expect(guides.locator('[data-axis="x"]')).toHaveAttribute('x1', '900');
          await expect(guides.locator('[data-axis="y"]')).toHaveAttribute('y1', '390');
          await page.screenshot({
            path: info.outputPath(`${kind}-center-snapped.png`),
            fullPage: false,
          });
          await page.mouse.up();
          await expect(guides).toHaveCount(0);
          await expect(chrome).toHaveCSS('opacity', '1');
          await expect.poll(() => inkAt(ink, 900, 390)).toBeGreaterThan(0);
          await page.keyboard.press('Delete');
        }
      } finally {
        await popup.close();
        await page.close();
      }
    });
  }
}
