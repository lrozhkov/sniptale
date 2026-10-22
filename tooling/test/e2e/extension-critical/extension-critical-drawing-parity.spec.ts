import type { Locator, Page } from '@playwright/test';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { expect, test } from '../support/extension-fixture';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';

async function arrowShaftY(canvas: Locator, point: { x: number; y: number }) {
  return canvas.evaluate((node, point) => {
    if (!(node instanceof HTMLCanvasElement)) throw new Error('Drawing canvas unavailable');
    const rect = node.getBoundingClientRect();
    const scaleX = node.width / rect.width;
    const scaleY = node.height / rect.height;
    const column = Math.round((point.x - rect.x) * scaleX);
    const firstRow = Math.round((point.y - rect.y - 24) * scaleY);
    const data = node.getContext('2d')!.getImageData(column, firstRow, 1, Math.round(48 * scaleY));
    let weight = 0;
    let weightedY = 0;
    for (let row = 0; row < data.height; row++) {
      const offset = row * 4;
      const red = data.data[offset]!;
      const green = data.data[offset + 1]!;
      const blue = data.data[offset + 2]!;
      const alpha = data.data[offset + 3]!;
      if (red > green + 40 && red > blue + 40 && alpha > 0) {
        weight += alpha;
        weightedY += (rect.y + (firstRow + row + 0.5) / scaleY) * alpha;
      }
    }
    return weight ? weightedY / weight : null;
  }, point);
}

async function checkFreeArrowEndpoints(
  page: Page,
  canvas: Locator,
  start: { x: number; y: number },
  screenshotPath: string,
  undo?: () => Promise<void>
) {
  const end = { x: start.x + 300, y: start.y + 12 };
  const middle = { x: start.x + 150, y: start.y };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
  await page.screenshot({ path: screenshotPath.replace('.png', '-created.png'), fullPage: false });
  const expectShaft = async (expected: number) => {
    await expect
      .poll(async () => {
        const actual = await arrowShaftY(canvas, middle);
        return actual === null ? Infinity : Math.abs(actual - expected);
      })
      .toBeLessThanOrEqual(1.5);
  };
  await expectShaft(start.y + 6);
  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(end.x, start.y + 8, { steps: 4 });
  await expectShaft(start.y + 4);
  await page.keyboard.down('Shift');
  await page.mouse.move(end.x + 1, start.y + 8);
  await expectShaft(start.y);
  await page.keyboard.up('Shift');
  await page.mouse.move(end.x, start.y + 8);
  await expectShaft(start.y + 4);
  await page.mouse.up();
  await expectShaft(start.y + 4);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  if (undo) {
    await undo();
    await expectShaft(start.y + 6);
    await undo();
  }
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`free arrow creation and endpoint angles across all surfaces ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(120000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      for (const mode of ['drawing', 'video-recording', 'crop']) {
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page
          .locator(`[data-ui="content.toolbar.mode-option.${mode === 'crop' ? 'drawing' : mode}"]`)
          .click();
        if (mode === 'crop') {
          await page.locator('[data-ui="content.toolbar.timer-button"]').click();
          await page
            .locator('[data-ui="content.toolbar.timer-menu"]')
            .getByText('No delay', { exact: true })
            .click();
          await page.locator('[data-ui="content.toolbar.capture-selection-button"]').click();
          await page.mouse.move(200, 180);
          await page.mouse.down();
          await page.mouse.move(950, 440, { steps: 4 });
          await page.mouse.up();
          await page.locator('[data-ui="content.crop.mode.drawing"]').click();
        }
        const scope =
          mode === 'crop'
            ? page.locator('[data-ui="content.crop.drawing-slot"]')
            : page.locator('[data-ui="content.toolbar.root"]');
        await scope.locator('[data-ui="content.toolbar.drawing.arrow"]').click();
        const canvas = page.locator(
          mode === 'crop'
            ? '[data-ui="content.crop.drawing-layer"] canvas.sniptale-drawing-canvas[tabindex="0"]'
            : '[data-ui="content.drawing.surface"] canvas.sniptale-drawing-canvas[tabindex="0"]'
        );
        await expect(canvas).toHaveCSS('pointer-events', 'auto');
        const cropBounds =
          mode === 'crop'
            ? (await page.locator('.sniptale-selection-final-frame').boundingBox())!
            : null;
        await checkFreeArrowEndpoints(
          page,
          canvas,
          cropBounds
            ? {
                x: Math.round(cropBounds.x + 80),
                y: Math.round(cropBounds.y + cropBounds.height / 2),
              }
            : { x: 300, y: mode === 'drawing' ? 230 : 280 },
          info.outputPath(`${mode}-free-arrow.png`),
          mode === 'video-recording'
            ? undefined
            : mode === 'crop'
              ? () => page.locator('[data-ui="content.crop.undo"]').click()
              : () => page.keyboard.press('Control+z')
        );
        if (mode === 'crop') await page.keyboard.press('Escape');
      }
      const editor = await context.newPage();
      try {
        await editor.setViewportSize(size);
        await applyHarnessBootstrap(editor, {});
        await editor.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
        await editor.locator('[data-ui="editor.floating.tool-rail.arrow"]').click();
        const upper = (await editor
          .locator('[data-ui="editor.canvas.layer"] canvas.upper-canvas')
          .boundingBox())!;
        const canvas = editor.locator('[data-ui="editor.canvas.layer"] canvas.lower-canvas');
        await checkFreeArrowEndpoints(
          editor,
          canvas,
          {
            x: Math.round(upper.x + upper.width * 0.3),
            y: Math.round(upper.y + upper.height * 0.5),
          },
          info.outputPath('editor-free-arrow.png')
        );
      } finally {
        await editor.close();
      }
    } finally {
      await popup.close();
      await page.close();
    }
  });
}

async function checkDrawingPlacement(page: Page, editor: boolean) {
  const toolbar = page.locator(
    `[data-ui="${editor ? 'editor.floating.tool-rail' : 'content.toolbar.root'}"]`
  );
  const surfaces = page.locator(
    editor
      ? '[data-ui="editor.floating.tool-properties"], [data-ui="editor.floating.selection-actions"]'
      : '.sniptale-drawing-options-popover:visible'
  );
  await expect(surfaces.first()).toBeVisible();
  await toolbar.evaluate(async (node) => {
    const positioner = node.closest('.sniptale-toolbar-positioner') ?? node;
    const active = () =>
      [...node.getAnimations(), ...positioner.getAnimations()].filter(
        (animation) =>
          animation.playState === 'running' &&
          animation.effect?.getComputedTiming().iterations !== Infinity
      );
    await new Promise(requestAnimationFrame);
    let animations = active();
    while (animations.length) {
      await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
      await new Promise(requestAnimationFrame);
      animations = active();
    }
  });
  await surfaces.first().evaluate(async (node) => {
    await Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished));
  });
  const geometry = await surfaces.evaluateAll((nodes, editor) => {
    const first = nodes[0]!;
    const toolbar = editor
      ? first.ownerDocument.querySelector('[data-ui="editor.floating.tool-rail"]')!
      : first.closest('[data-ui="content.toolbar.root"]')!;
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const boxes = nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
    const active = toolbar.querySelector(
      editor
        ? 'button[aria-pressed="true"]'
        : '[data-ui^="content.toolbar.drawing."][aria-pressed="true"]'
    )!;
    const pair = first.closest('[data-ui="content.toolbar.drawing-options.pair"]');
    return {
      shell: rect(toolbar),
      bounds: rect(first),
      anchor: rect(active),
      vertical: !editor && toolbar.getAttribute('data-display-mode') === 'vertical',
      visibleWidth:
        Math.max(...boxes.map((box) => box.right)) - Math.min(...boxes.map((box) => box.left)),
      wrapper: pair
        ? {
            rect: rect(pair),
            style: pair.getAttribute('style'),
            width: (pair as HTMLElement).offsetWidth,
          }
        : null,
    };
  }, editor);
  const { shell, bounds, vertical, anchor, visibleWidth } = geometry;
  if (!vertical) {
    expect(bounds.x, JSON.stringify(geometry)).toBeCloseTo(
      Math.min(Math.max(anchor.x, 8), page.viewportSize()!.width - visibleWidth - 8),
      0
    );
  }
  if (!editor) {
    const disclosure = toolbar
      .locator('[data-ui^="content.toolbar.drawing."][aria-expanded="true"]')
      .first();
    const trigger = (await disclosure.count())
      ? disclosure
      : toolbar.locator('[data-ui^="content.toolbar.drawing."][aria-pressed="true"]').first();
    await expect(trigger).toHaveAttribute(
      'data-menu-side',
      vertical ? (bounds.x < shell.x ? 'left' : 'right') : bounds.y < shell.y ? 'up' : 'down'
    );
  }
  expect(
    Math.max(
      vertical ? shell.x - bounds.x - bounds.width : shell.y - bounds.y - bounds.height,
      vertical ? bounds.x - shell.x - shell.width : bounds.y - shell.y - shell.height
    )
  ).toBeCloseTo(1, 0);
  for (const surface of await surfaces.all()) {
    const box = (await surface.boundingBox())!;
    expect(vertical ? box.x : box.y).toBeCloseTo(vertical ? bounds.x : bounds.y, 0);
  }
  return bounds;
}

for (const { name, size: viewport } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`shared drawing surface placement ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(120_000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport);
    page.setDefaultTimeout(10_000);
    const theme = viewport.width === 1920 ? 'dark' : 'light';
    await popup.evaluate(
      async (theme) => chrome.storage.local.set({ 'sniptale-theme-preference': theme }),
      theme
    );
    try {
      for (const mode of ['drawing', 'video-recording']) {
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
        if (mode === 'video-recording') {
          await expect(page.locator('[data-ui="content.toolbar.root"]')).toHaveAttribute(
            'data-video-recording',
            'true'
          );
        }
        for (const [edge, x, y] of [
          ['top', viewport.width / 2, 20],
          ['bottom', viewport.width / 2, viewport.height - 20],
          ['left', 20, viewport.height / 2],
          ['right', viewport.width - 20, viewport.height / 2],
        ] as const) {
          await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
          await page.mouse.click(viewport.width * 0.6, viewport.height * 0.6);
          const handle = page.locator('[data-ui="shared.ui.content-toolbar-drag-handle"]');
          const grip = (await handle.boundingBox())!;
          await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
          await page.mouse.down();
          await page.mouse.move(x, y, { steps: 5 });
          await page.mouse.up();
          const arrow = page.locator('[data-ui="content.toolbar.drawing.arrow"]');
          await arrow.click();
          if ((await arrow.getAttribute('aria-expanded')) !== 'true') await arrow.click();
          const unselected = await checkDrawingPlacement(page, false);
          await page.mouse.move(300, 160);
          await page.mouse.down();
          await page.mouse.move(420, 210, { steps: 4 });
          await page.mouse.up();
          await expect(
            page.locator('[data-ui="content.toolbar.drawing-options.pair"]')
          ).toBeVisible();
          const selected = await checkDrawingPlacement(page, false);
          expect(selected.height).toBeCloseTo(unselected.height, 0);
          if (edge === 'top' || edge === 'bottom') {
            expect(selected.height).toBeLessThanOrEqual(42);
            for (const panel of await page
              .locator('.sniptale-drawing-options-popover:visible')
              .all())
              expect((await panel.boundingBox())!.height).toBeCloseTo(unselected.height, 0);
          }
          await page.screenshot({
            path: info.outputPath(`${mode}-${edge}-pair.png`),
            fullPage: false,
          });
        }
      }
      const editor = await context.newPage();
      try {
        await editor.setViewportSize(viewport);
        await applyHarnessBootstrap(editor, { storage: { 'sniptale-theme-preference': theme } });
        await editor.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
        await editor.locator('[data-ui="editor.floating.tool-rail.arrow"]').click();
        const unselected = await checkDrawingPlacement(editor, true);
        const canvas = editor.locator('[data-ui="editor.canvas.layer"] canvas.upper-canvas');
        const box = (await canvas.boundingBox())!;
        await editor.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
        await editor.mouse.down();
        await editor.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.65, { steps: 4 });
        await editor.mouse.up();
        await expect(editor.locator('[data-ui="editor.floating.selection-actions"]')).toBeVisible();
        const selected = await checkDrawingPlacement(editor, true);
        expect(selected.height).toBeCloseTo(unselected.height, 0);
        expect(selected.height).toBeLessThanOrEqual(42);
        expect(
          (await editor.locator('[data-ui="editor.floating.selection-actions"]').boundingBox())!
            .height
        ).toBeCloseTo(unselected.height, 0);
        for (const width of [viewport.width, 960, 719, 720, 721]) {
          await editor.setViewportSize({ width, height: viewport.height });
          await checkDrawingPlacement(editor, true);
          await editor.screenshot({
            path: info.outputPath(`editor-pair-${width}.png`),
            fullPage: false,
          });
          const overflow = await editor.evaluate(() => ({
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            minimumWidth: Number.parseFloat(
              getComputedStyle(document.querySelector('[data-ui="editor.page.root"]')!).minWidth
            ),
          }));
          expect(overflow.scrollWidth).toBeLessThanOrEqual(Math.max(width, overflow.minimumWidth));
        }
      } finally {
        await editor.close();
      }
    } finally {
      await popup.close();
      await page.close();
    }
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`recording cursor shows selection chrome ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await popup.evaluate(
        async (theme) => {
          await chrome.storage.local.set({ 'sniptale-theme-preference': theme });
        },
        size.width === 1920 ? 'dark' : 'light'
      );
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.video-recording"]').click();
      await page.locator('[data-ui="content.toolbar.drawing.pencil"]').click();
      const surface = page.locator('[data-ui="content.drawing.surface"]').first();
      const ink = surface.locator('canvas.sniptale-drawing-canvas');
      await expect(ink).toHaveCSS('pointer-events', 'auto');
      const chrome = surface.locator('[data-ui="content.drawing.selection-chrome"]');
      const visiblePixels = () =>
        chrome.evaluate((canvas) => {
          if (!(canvas instanceof HTMLCanvasElement))
            throw new Error('Selection canvas unavailable');
          const data = canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height).data;
          let count = 0;
          for (let offset = 3; offset < data.length; offset += 4) if (data[offset]! > 0) count++;
          return count;
        });
      await page.mouse.move(500, 260);
      await page.mouse.down();
      await page.mouse.move(660, 320, { steps: 8 });
      await page.mouse.up();
      await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
      await page.mouse.click(900, 440);
      await expect.poll(visiblePixels).toBe(0);
      await page.mouse.move(450, 190);
      await page.mouse.down();
      try {
        await page.mouse.move(720, 380, { steps: 6 });
        await expect.poll(visiblePixels).toBeGreaterThan(0);
        await page.screenshot({
          path: info.outputPath('recording-selection-marquee.png'),
          fullPage: false,
        });
      } finally {
        await page.mouse.up();
      }
      await expect.poll(visiblePixels).toBeGreaterThan(0);
      await expect(page.locator('[data-ui="drawing.selection.actions"]')).toBeVisible();
      await page.mouse.click(900, 440);
      await expect.poll(visiblePixels).toBe(0);
      await page.mouse.click(580, 290);
      await expect.poll(visiblePixels).toBeGreaterThan(0);
      await page.screenshot({
        path: info.outputPath('recording-selected-object.png'),
        fullPage: false,
      });
      const beforeMove = await pixels(ink);
      await page.mouse.move(580, 290);
      await page.mouse.down();
      await page.mouse.move(620, 330, { steps: 5 });
      await page.mouse.up();
      await expect.poll(() => pixels(ink)).not.toBe(beforeMove);
      await expect.poll(visiblePixels).toBeGreaterThan(0);
      await page.locator('[data-ui="content.toolbar.video-recording.navigation"]').click();
      await expect(ink).toHaveCSS('pointer-events', 'none');
      await expect.poll(visiblePixels).toBe(0);
      await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
      await page.mouse.click(620, 330);
      await expect.poll(visiblePixels).toBeGreaterThan(0);
    } finally {
      await page.close();
      await popup.close();
    }
  });
}

async function pixels(canvas: Locator): Promise<string> {
  return canvas.evaluate(async (element) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Drawing canvas unavailable');
    return element.toDataURL();
  });
}

async function stroke(page: Page, canvas: Locator, y: number, long: boolean) {
  await page.mouse.move(100, y);
  await page.mouse.down();
  for (let index = 1; index <= (long ? 90 : 12); index++) {
    await page.mouse.move(100 + index * (long ? 10 : 15), y + Math.sin(index / 3) * 35);
  }
  const live = await pixels(canvas);
  await page.mouse.up();
  expect(await pixels(canvas)).toBe(live);
  await page.mouse.move(1100, 600);
  expect(await pixels(canvas)).toBe(live);
  return live;
}

for (const locale of ['en', 'ru'] as const) {
  for (const mode of ['drawing', 'video-recording'] as const) {
    test(`${mode} ${locale} follows image-editor strokes and Shift-only arrows at HD`, async ({
      context,
      extensionId,
      hostOrigin,
    }, testInfo) => {
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
      const previousLocale = await popup.evaluate(async () => {
        const value = (await chrome.storage.local.get('sniptale-locale-preference'))[
          'sniptale-locale-preference'
        ];
        return typeof value === 'string' ? value : null;
      });
      await popup.evaluate(
        async (locale) => chrome.storage.local.set({ 'sniptale-locale-preference': locale }),
        locale
      );
      await page.bringToFront();
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
      if (mode === 'video-recording') {
        const browser = context.browser();
        if (!browser) throw new Error('Native extension browser unavailable');
        const cdp = await browser.newBrowserCDPSession();
        try {
          const targets = await cdp.send('Target.getTargets', {
            filter: [{ type: 'tab', exclude: false }, { exclude: true }],
          });
          const tab = targets.targetInfos.find((candidate) => candidate.url === page.url());
          if (!tab) throw new Error('Native drawing tab unavailable');
          await cdp.send('Extensions.triggerAction', { id: extensionId, targetId: tab.targetId });
        } finally {
          await cdp.detach();
        }
        await page.bringToFront();
        await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: /^(Continue|Продолжить)$/u })
          .click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toBeVisible(
          { timeout: 30_000 }
        );
      }
      const canvas = page.locator(
        '[data-ui="content.drawing.surface"] canvas.sniptale-drawing-canvas[tabindex="0"]'
      );
      for (const [tool, y] of [
        ['pencil', 320],
        ['marker', 440],
      ] as const) {
        await page.locator(`[data-ui="content.toolbar.drawing.${tool}"]`).click();
        await expect(canvas).toHaveCSS('pointer-events', 'auto');
        await stroke(page, canvas, y, false);
        const committed = await stroke(page, canvas, y + 70, true);
        await page.mouse.move(100, 600);
        await page.mouse.down();
        await page.mouse.move(300, 650);
        await canvas.evaluate((element) =>
          element.dispatchEvent(
            new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'mouse' })
          )
        );
        await page.mouse.up();
        expect(await pixels(canvas)).toBe(committed);
        await stroke(page, canvas, y + 100, false);
      }
      const arrow = page.locator('[data-ui="content.toolbar.drawing.arrow"]');
      await expect(arrow).toHaveAccessibleDescription(
        locale === 'ru' ? 'Свободный угол; Shift — шаг 15°' : 'Free angle; Shift — 15° steps'
      );
      await arrow.click();
      await page.mouse.move(100, 250);
      await page.mouse.down();
      await page.mouse.move(400, 264);
      const free = await pixels(canvas);
      await page.keyboard.down('Shift');
      await page.mouse.move(401, 264);
      const snapped = await pixels(canvas);
      expect(snapped).not.toBe(free);
      await page.keyboard.up('Shift');
      await page.mouse.move(400, 264);
      expect(await pixels(canvas)).toBe(free);
      await page.mouse.up();
      expect(await pixels(canvas)).toBe(free);
      await page.screenshot({ path: testInfo.outputPath(`${mode}-drawing-HD.png`) });
      if (mode === 'video-recording') {
        await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
        await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toHaveCount(
          0,
          { timeout: 30_000 }
        );
        await expect
          .poll(
            () =>
              popup.evaluate(
                async () =>
                  (
                    await chrome.runtime.sendMessage({
                      type: 'GET_RECORDING_STATE',
                      __sniptaleRuntimeFreshness: {
                        issuedAtEpochMs: Date.now(),
                        nonce: crypto.randomUUID(),
                      },
                    })
                  ).state.status
              ),
            { timeout: 30_000 }
          )
          .toBe(VideoRecordingStatus.IDLE);
        const recordingId = await popup.evaluate(async () => {
          const response = await chrome.runtime.sendMessage({
            type: 'GET_RECORDING_STATE',
            __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
          });
          if (typeof response.postRecordResult?.recordingId !== 'string')
            throw new Error('Saved recording identity unavailable');
          return response.postRecordResult.recordingId;
        });
        expect(
          await popup.evaluate(
            async (recordingId) =>
              chrome.runtime.sendMessage({
                type: 'ACKNOWLEDGE_POST_RECORD_RESULT',
                recordingId,
                __sniptaleRuntimeFreshness: {
                  issuedAtEpochMs: Date.now(),
                  nonce: crypto.randomUUID(),
                },
              }),
            recordingId
          )
        ).toMatchObject({ success: true, result: 'acknowledged' });
      }
      await popup.evaluate(async (previous) => {
        if (previous === null) await chrome.storage.local.remove('sniptale-locale-preference');
        else await chrome.storage.local.set({ 'sniptale-locale-preference': previous });
      }, previousLocale);
      await popup.close();
      await page.close();
    });
  }
}

async function verifySelectedFillPaint(toggle: Locator, offColor: string, offBackground: string) {
  if ((await toggle.getAttribute('data-command-property')) === 'true') {
    const expected = await toggle.evaluate((node) => {
      const probe = node.ownerDocument.createElement('span');
      probe.style.cssText = [
        'position:fixed;visibility:hidden',
        'color:var(--sniptale-color-text-primary)',
        'background:var(--sniptale-color-surface-hover)',
      ].join(';');
      node.append(probe);
      const style = getComputedStyle(probe);
      const resolved = { color: style.color, background: style.backgroundColor };
      probe.remove();
      return resolved;
    });
    await expect(toggle).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
    await expect(toggle).toHaveCSS('background-color', expected.background);
    await expect(toggle).toHaveCSS('color', expected.color);
    await expect(toggle).not.toHaveCSS('background-color', offBackground);
  } else {
    await expect(toggle).not.toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
  }
  await expect(toggle).not.toHaveCSS('color', offColor);
}

async function verifyFillControls(page: Page, editor: boolean) {
  for (const [tool, suffix, groupSuffix] of [
    ['shape', 'shape.fill-toggle', 'shape.fill'],
    ['text', 'text.background-none', 'text.background-group'],
  ]) {
    const trigger = editor
      ? `editor.floating.tool-rail.${tool}`
      : `content.toolbar.drawing.${tool}`;
    await page.locator(`[data-ui="${trigger}"]`).click();
    const toggle = page.locator(`[data-ui="content.toolbar.drawing-options.${suffix}"]`);
    const group = page.locator(`[data-ui="content.toolbar.drawing-options.${groupSuffix}"]`);
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeEnabled();
    await toggle.evaluate(async (node) => {
      for (let parent: Element | null = node; parent; parent = parent.parentElement) {
        await Promise.allSettled(parent.getAnimations().map((animation) => animation.finished));
      }
    });
    if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
    await page.mouse.move(0, 0);
    if ((await toggle.getAttribute('data-command-property')) === 'true')
      await expect(toggle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const offColor = await toggle.evaluate((node) => getComputedStyle(node).color);
    const offBackground = await toggle.evaluate((node) => getComputedStyle(node).backgroundColor);
    const offSize = await toggle.boundingBox();
    await toggle.hover();
    await expect(toggle).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
    await toggle.evaluate((node) => {
      const options = node.closest(
        '[data-ui="editor.drawing.options"], .sniptale-drawing-options-menu'
      );
      const controls = Array.from(
        options!.querySelectorAll<HTMLElement>('button, input, select, [tabindex]')
      ).filter(
        (control) =>
          control.tabIndex >= 0 &&
          !control.matches(':disabled') &&
          control.getClientRects().length > 0
      );
      const previous = controls[controls.findIndex((control) => control === node) - 1];
      if (!previous) throw new Error('Fill toggle requires a preceding keyboard control');
      previous.focus();
    });
    await page.keyboard.press('Tab');
    await expect(toggle).toBeFocused();
    await expect.poll(() => toggle.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
    await expect(toggle).toHaveCSS('outline-style', 'solid');
    await toggle.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await verifySelectedFillPaint(toggle, offColor, offBackground);
    const activeSize = await toggle.boundingBox();
    expect(activeSize!.width).toBe(offSize!.width);
    expect(activeSize!.height).toBe(offSize!.height);
    const color = group.locator('button[title="#60a5fa"]');
    await color.click();
    await expect(color).toHaveAttribute('aria-pressed', 'true');
    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.press('Space');
    await expect(color).toHaveAttribute('aria-pressed', 'true');
    await toggle.hover();
    await verifySelectedFillPaint(toggle, offColor, offBackground);
    await expect(toggle).toBeInViewport();
  }
}

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`shared fill switch keeps state and geometry (${variant.locale}, ${variant.theme})`, async ({
    context,
    extensionId,
    hostOrigin,
  }) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
    await popup.evaluate(
      async ({ locale, theme }) =>
        chrome.storage.local.set({
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': theme,
        }),
      variant
    );
    await page.bringToFront();
    for (const mode of ['drawing', 'video-recording']) {
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
      await verifyFillControls(page, false);
    }
    const editor = await context.newPage();
    await applyHarnessBootstrap(editor, {
      storage: {
        'sniptale-locale-preference': variant.locale,
        'sniptale-theme-preference': variant.theme,
      },
    });
    await editor.addInitScript(
      (locale) => localStorage.setItem('sniptale-locale-preference', locale),
      variant.locale
    );
    await editor.setViewportSize({ width: 1280, height: 720 });
    await editor.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
    await expect(editor.locator('[data-ui="editor.page.root"]')).toBeVisible();
    await expect(editor.locator('html')).toHaveAttribute('data-theme', variant.theme);
    await verifyFillControls(editor, true);
    await editor.close();
    await popup.close();
    await page.close();
  });
}

async function verifyDrawingParameterOrder(page: Page, editor: boolean) {
  for (const [tool, lastParameter] of [
    ['pencil', '[data-ui*=".pencil.width-"]'],
    ['marker', '[data-ui*=".marker.opacity-"]'],
    ['shape', '[data-ui*=".shape.width-"]'],
    ['arrow', '[data-ui$=".arrow.from-tip"]'],
    ['text', '[data-ui*=".text.size-"]'],
  ] as const) {
    const trigger = page.locator(
      `[data-ui="${editor ? 'editor.floating.tool-rail' : 'content.toolbar.drawing'}.${tool}"]`
    );
    if (editor || (await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
    const panel = page.locator(
      editor
        ? '[data-ui="editor.drawing.options"]'
        : `[data-ui="content.toolbar.drawing-options.${tool}"]`
    );
    await expect(panel).toBeVisible();
    const ordered = await panel.evaluate((root, selector) => {
      const parameters = root.querySelectorAll(selector);
      const last = parameters[parameters.length - 1];
      const color = root.querySelector('[data-ui="shared.ui.color-selector"]');
      return (
        !!last &&
        !!color &&
        !!(last.compareDocumentPosition(color) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
    }, lastParameter);
    expect(ordered, `${tool} parameters precede color`).toBe(true);
  }
  await page
    .locator(`[data-ui="${editor ? 'editor.floating.tool-rail' : 'content.toolbar.drawing'}.blur"]`)
    .click();
  const blur = page.locator(
    editor
      ? '[data-ui="editor.drawing.options"]'
      : '[data-ui="content.toolbar.drawing-options.blur"]'
  );
  await expect(blur.locator('[data-ui="shared.ui.color-selector"]')).toHaveCount(0);
}

test('image drawing parameters precede color', async ({ page, hostOrigin }) => {
  await applyHarnessBootstrap(page, {});
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
  await verifyDrawingParameterOrder(page, true);
});

for (const mode of ['drawing', 'video-recording'] as const) {
  test(`${mode} selected layer actions follow toolbar orientation`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
    await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
    await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
    await verifyDrawingParameterOrder(page, false);
    await page.locator('[data-ui="content.toolbar.settings-button"]').click();
    const freePlacement = page.getByRole('button', {
      name: /Free toolbar placement|Свободное размещение панели/u,
    });
    if (
      !(await freePlacement.evaluate((node) =>
        node.classList.contains('sniptale-popover-item-selected')
      ))
    )
      await freePlacement.click();
    await expect(freePlacement).toHaveClass(/sniptale-popover-item-selected/u);
    await page.getByRole('button', { name: /Vertical view|Вертикальный вид/ }).click();
    await page.locator('[data-ui="content.toolbar.drawing.shape"]').click();
    const toolbarBox = (await page.locator('[data-ui="content.toolbar.root"]').boundingBox())!;
    const drawingX = toolbarBox.x + toolbarBox.width / 2 < 640 ? 900 : 100;
    await page.mouse.move(drawingX, 280);
    await page.mouse.down();
    await page.mouse.move(drawingX + 170, 400, { steps: 8 });
    await page.mouse.up();
    await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
    await page.mouse.click(drawingX + 50, 300);
    const actions = page.locator('[data-ui="drawing.selection.actions"]');
    await expect(actions).toBeVisible();
    const pair = page.locator('[data-ui="content.toolbar.drawing-options.pair"]');
    const scrollSnapshots = [];
    const readScroll = () =>
      pair.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return {
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
          scrollTop: node.scrollTop,
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
        };
      });
    const checkPairBounds = async () => {
      const state = await readScroll();
      expect(state.left).toBeGreaterThanOrEqual(-1);
      expect(state.top).toBeGreaterThanOrEqual(-1);
      expect(state.right).toBeLessThanOrEqual(state.viewportWidth + 1);
      expect(state.bottom).toBeLessThanOrEqual(state.viewportHeight + 1);
    };
    scrollSnapshots.push({ stage: 'selection-before-scroll', ...(await readScroll()) });
    await actions.scrollIntoViewIfNeeded();
    scrollSnapshots.push({ stage: 'selection-after-scroll', ...(await readScroll()) });
    await checkPairBounds();
    const first = actions.locator('[data-ui="drawing.selection.actions.front"]');
    const second = actions.locator('[data-ui="drawing.selection.actions.forward"]');
    const a = (await first.boundingBox())!;
    const b = (await second.boundingBox())!;
    expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(1);
    expect(b.y).toBeGreaterThan(a.y + a.height);
    const bounds = (await actions.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1280);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
    await page.screenshot({ path: info.outputPath('vertical-layer-actions.png'), fullPage: false });
    const duplicate = actions.locator('[data-ui="drawing.selection.actions.duplicate"]');
    await duplicate.focus();
    await page.keyboard.press('Enter');
    await expect(first).toBeEnabled();
    await first.click();
    const handle = page.locator('[data-ui="shared.ui.content-toolbar-drag-handle"]');
    const handleBox = (await handle.boundingBox())!;
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(1240, 25, { steps: 8 });
    await page.mouse.up();
    await expect(actions).toBeVisible();
    scrollSnapshots.push({ stage: 'edge-before-scroll', ...(await readScroll()) });
    await actions.scrollIntoViewIfNeeded();
    scrollSnapshots.push({ stage: 'edge-after-scroll', ...(await readScroll()) });
    await checkPairBounds();
    await info.attach('drawing-pair-scroll.json', {
      body: JSON.stringify(scrollSnapshots, null, 2),
      contentType: 'application/json',
    });
    const edge = (await actions.boundingBox())!;
    expect(edge.x).toBeGreaterThanOrEqual(0);
    expect(edge.x + edge.width).toBeLessThanOrEqual(1280);
    expect(edge.y + edge.height).toBeLessThanOrEqual(720);
    await page.screenshot({
      path: info.outputPath('vertical-layer-actions-edge.png'),
      fullPage: false,
    });
    await page.setViewportSize({ width: 1280, height: 1080 });
    await page.locator('[data-ui="content.toolbar.settings-button"]').click();
    await page.getByRole('button', { name: /Horizontal view|Горизонтальный вид/ }).click();
    await expect(actions).toBeVisible();
    await expect(actions).toHaveCSS('flex-direction', 'row');
    await checkDrawingPlacement(page, false);
    const horizontal = await actions.evaluate((node) => {
      const first = node
        .querySelector('[data-ui="drawing.selection.actions.front"]')!
        .getBoundingClientRect();
      const second = node
        .querySelector('[data-ui="drawing.selection.actions.forward"]')!
        .getBoundingClientRect();
      return { yOffset: second.y - first.y, gap: second.x - first.right };
    });
    expect(Math.abs(horizontal.yOffset)).toBeLessThanOrEqual(1);
    expect(horizontal.gap).toBeGreaterThan(0);
    await page.screenshot({
      path: info.outputPath('horizontal-layer-actions.png'),
      fullPage: false,
    });
    await popup.close();
    await page.close();
  });
}
