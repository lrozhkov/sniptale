import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';

async function stroke(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

async function readCapturedPixels(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-ui="editor.canvas.layer"] canvas.lower-canvas'
    );
    if (!canvas || !canvas.width || !canvas.height) return { ink: 0, blurred: 0, red: 0 };
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    let blurred = 0;
    let red = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const [r, g, b, alpha] = [
        pixels[offset]!,
        pixels[offset + 1]!,
        pixels[offset + 2]!,
        pixels[offset + 3]!,
      ];
      if (alpha < 250) continue;
      if (r - b > 60 && g - b > 20) ink++;
      if (r > 70 && r < 185 && Math.abs(r - g) < 3 && Math.abs(g - b) < 3) blurred++;
      if (r > 245 && g < 10 && b < 10) red++;
    }
    return { ink, blurred, red };
  });
}

async function readMainDrawingPixels(page: Page) {
  return page
    .locator('[data-ui="content.drawing.surface"]')
    .first()
    .evaluate((surface) => {
      const canvas = surface.querySelector<HTMLCanvasElement>('canvas.sniptale-drawing-canvas');
      if (!canvas?.width || !canvas.height) return 0;
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset]) count++;
      return count;
    });
}

async function revealCaptureDelay(page: Page) {
  if (await page.locator('[data-ui="content.toolbar.timer-button"]').count()) return;
  await page.locator('[data-ui="content.toolbar.settings-button"]').click();
  await page.locator('[data-ui="content.toolbar.settings.show-hidden-buttons"]').click();
  const compact = page.getByRole('button', { name: /^Compact menu view/u });
  if ((await compact.getAttribute('aria-pressed')) !== 'true') await compact.click();
  await page.keyboard.press('Escape');
}

async function openImmediateCrop(page: Page) {
  await revealCaptureDelay(page);
  await page.locator('[data-ui="content.toolbar.timer-button"]').click();
  await page
    .locator('[data-ui="content.toolbar.timer-menu"]')
    .getByText('No delay', { exact: true })
    .click();
  await page.locator('[data-ui="content.toolbar.capture-selection-button"]').click();
  await expect(page.locator('.sniptale-selection-container')).toBeVisible();
  await stroke(page, { x: 400, y: 200 }, { x: 1000, y: 420 });
  await expect(page.locator('.sniptale-selection-toolbar')).toBeVisible();
  const bounds = await page.locator('.sniptale-selection-final-frame').boundingBox();
  expect(bounds).toEqual({ x: 400, y: 200, width: 600, height: 220 });
}

async function readStoredCropMode(popup: Page) {
  return popup.evaluate(async () => {
    const stored = await chrome.storage.sync.get('sniptale_settings');
    const settings: unknown = stored['sniptale_settings'];
    if (!settings || typeof settings !== 'object' || !('contentToolbar' in settings)) return null;
    const toolbar = settings.contentToolbar;
    if (!toolbar || typeof toolbar !== 'object' || !('cropMode' in toolbar)) return null;
    return toolbar.cropMode === 'drawing' || toolbar.cropMode === 'resize'
      ? toolbar.cropMode
      : null;
  });
}

async function checkKeyboardDrawingMenuGap(page: Page) {
  const options = page.locator('.sniptale-drawing-options-popover').first();
  const toolbar = page.locator('.sniptale-selection-toolbar');
  await expect(options).toBeVisible();
  await expect
    .poll(async () => {
      const menuBounds = await options.boundingBox();
      const toolbarBounds = await toolbar.boundingBox();
      return menuBounds && toolbarBounds
        ? menuBounds.y + menuBounds.height - toolbarBounds.y
        : Infinity;
    })
    .toBeLessThanOrEqual(0);
  const menuBounds = (await options.boundingBox())!;
  const toolbarBounds = (await toolbar.boundingBox())!;
  expect(menuBounds.y + menuBounds.height - toolbarBounds.y).toBeGreaterThanOrEqual(-2);
}

async function checkCropUndoRedo(page: Page) {
  const undo = page.locator('[data-ui="content.crop.undo"]');
  const redo = page.locator('[data-ui="content.crop.redo"]');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(redo).toBeDisabled();
  const pencil = page.locator(
    '[data-ui="content.crop.drawing-slot"] [data-ui="content.toolbar.drawing.pencil"]'
  );
  await pencil.click();
  if (await page.locator('[data-ui="content.toolbar.drawing-options.pencil"]').isVisible())
    await pencil.click();
  await stroke(page, { x: 530, y: 305 }, { x: 790, y: 305 });
  await page
    .locator('[data-ui="content.crop.drawing-slot"] [data-ui="content.toolbar.drawing.text"]')
    .click();
  await page.mouse.click(540, 245);
  await page.locator('[data-ui="content.drawing.text-input"]').fill('Crop text');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.locator('[data-ui="content.drawing.text-object"]')).toHaveCount(0);
  await redo.click();
  await expect(page.locator('[data-ui="content.drawing.text-object"]')).toContainText('Crop text');
  await page.locator('[data-ui="content.crop.mode.resize"]').click();
  await expect(page.locator('[data-ui="content.drawing.text-object"]')).toContainText('Crop text');
  await page.locator('[data-ui="content.crop.mode.drawing"]').click();
}

async function checkCropCaptureActionMenu(page: Page, info: TestInfo) {
  const captureTrigger = page.locator('.sniptale-selection-capture-menu-trigger');
  const captureMenu = page.locator('[data-ui="content.selection.capture-action-menu"]');
  await captureTrigger.click();
  const captureIcons = captureMenu.locator('.sniptale-capture-action-icons [role="menuitem"]');
  const captureLabels = [
    'Download',
    'Copy image',
    'Open in editor',
    'Save as…',
    'Choose a folder',
    'Save to library',
  ];
  await expect(captureIcons).toHaveCount(captureLabels.length);
  for (const [index, label] of captureLabels.entries()) {
    await expect(captureIcons.nth(index)).toBeVisible();
    await expect(captureIcons.nth(index)).toHaveAttribute('aria-label', label);
    await expect(captureIcons.nth(index)).toHaveAttribute('title', label);
    await expect(captureIcons.nth(index)).toHaveText('');
    await expect(captureIcons.nth(index).locator('svg')).toHaveCount(1);
  }
  const iconBounds = await captureIcons.evaluateAll((buttons) =>
    buttons.map((button) => {
      const bounds = button.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width };
    })
  );
  expect(
    Math.max(...iconBounds.map((bounds) => bounds.y)) -
      Math.min(...iconBounds.map((bounds) => bounds.y))
  ).toBeLessThanOrEqual(1);
  for (let index = 1; index < iconBounds.length; index++) {
    expect(iconBounds[index]!.x).toBeGreaterThanOrEqual(
      iconBounds[index - 1]!.x + iconBounds[index - 1]!.width
    );
  }
  await expect(captureIcons.first()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(captureIcons.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(captureIcons.first()).toBeFocused();
  await page.screenshot({
    path: info.outputPath('crop-capture-action-icons.png'),
    fullPage: false,
  });
  await page.keyboard.press('Escape');
  await expect(captureMenu).toHaveCount(0);
  await expect(captureTrigger).toBeFocused();
  await expect(page.locator('.sniptale-selection-toolbar')).toBeVisible();
}

for (const { size: viewport } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Crop capture icon menu executes the selected action at ${viewport.width}`, async ({
    hostOrigin,
  }, info) => {
    const launched = await launchExtensionBrowser({ viewport });
    try {
      const { context, extensionId } = launched;
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport);
      try {
        await popup.evaluate(() => {
          const grant = document.createElement('button');
          grant.textContent = 'Grant crop capture proof';
          grant.onclick = async () => {
            grant.dataset['granted'] = String(
              await chrome.permissions.request({ origins: ['<all_urls>'] })
            );
          };
          document.body.append(grant);
        });
        const grant = popup.getByRole('button', { name: 'Grant crop capture proof', exact: true });
        await grant.click();
        await expect(grant).toHaveAttribute('data-granted', 'true');
        await page.bringToFront();
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.cursor"]').click();
        await openImmediateCrop(page);
        const frame = page.locator('.sniptale-selection-final-frame');
        const before = await frame.boundingBox();
        await checkCropCaptureActionMenu(page, info);
        expect(await frame.boundingBox()).toEqual(before);
        await page.locator('.sniptale-selection-capture-menu-trigger').click();
        const editorOpened = context.waitForEvent('page');
        await page.locator('[data-ui="content.selection.capture-action-option.edit"]').click();
        const editor = await editorOpened;
        await expect(editor.locator('[data-ui="editor.page.root"]')).toBeVisible();
        await expect(editor.locator('[data-ui="editor.page.open-loading"]')).toBeHidden();
        await expect(page.locator('.sniptale-selection-container')).toHaveCount(0);
        await editor.close();
      } finally {
        await popup.close();
        await page.close();
      }
    } finally {
      await closeExtensionBrowser(launched, { removeUserDataDir: true });
    }
  });

  test(`Crop drawing preserves the independent main mode at ${viewport.width}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(180_000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport);
    try {
      for (const mode of ['cursor', 'design-review', 'highlighter', 'quick-edit', 'drawing']) {
        for (const exit of ['escape', 'cancel']) {
          const trigger = page.locator('[data-ui="content.toolbar.mode-selector-button"]');
          await trigger.click();
          await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
          const label = await trigger.getAttribute('aria-label');
          await openImmediateCrop(page);
          await page.locator('[data-ui="content.crop.mode.drawing"]').click();
          await page
            .locator(
              '[data-ui="content.crop.drawing-slot"] [data-ui="content.toolbar.drawing.pencil"]'
            )
            .click();
          await stroke(page, { x: 550, y: 300 }, { x: 780, y: 320 });
          if (exit === 'cancel') {
            await page.locator('.sniptale-selection-size-cancel-button').click();
          } else {
            for (
              let attempt = 0;
              attempt < 5 && (await page.locator('.sniptale-selection-container').count());
              attempt++
            ) {
              await page.keyboard.press('Escape');
            }
          }
          await expect(page.locator('.sniptale-selection-container')).toHaveCount(0);
          await expect(trigger).toHaveAttribute('aria-label', label!);
          await expect(page.locator('[data-ui="content.crop.drawing-layer"]')).toHaveCount(0);
          await page.screenshot({ path: info.outputPath(`${mode}-${exit}.png`), fullPage: false });
        }
      }
    } finally {
      await popup.close();
      await page.close();
    }
  });

  test(`Crop remembers its mode and restores normal drawing at ${viewport.width}`, async ({
    hostOrigin,
  }, info) => {
    const launched = await launchExtensionBrowser({ viewport });
    const { context, extensionId } = launched;
    try {
      for (const expectedMode of ['drawing', 'resize', 'drawing'] as const) {
        const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport);
        try {
          await page.evaluate(() => {
            const paragraph = document.createElement('p');
            paragraph.textContent = 'Drawing must work over ordinary page text after Crop closes.';
            paragraph.style.cssText =
              'position:absolute;left:480px;top:270px;width:400px;font:24px sans-serif';
            document.body.append(paragraph);
          });
          await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
          await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
          const mainPencil = page.locator('[data-ui="content.toolbar.drawing.pencil"]').first();
          await mainPencil.click();
          if (await page.locator('.sniptale-drawing-options-popover').isVisible())
            await mainPencil.click();
          await openImmediateCrop(page);
          const toolbar = page.locator('.sniptale-selection-toolbar');
          await expect(toolbar).toHaveAttribute('data-crop-mode', expectedMode);
          const nextMode = expectedMode === 'drawing' ? 'resize' : 'drawing';
          await page.locator(`[data-ui="content.crop.mode.${nextMode}"]`).click();
          await expect(toolbar).toHaveAttribute('data-crop-mode', nextMode);
          await expect.poll(() => readStoredCropMode(popup)).toBe(nextMode);
          await page.bringToFront();
          if (nextMode === 'drawing') {
            const cropPencil = page.locator(
              '[data-ui="content.crop.drawing-slot"] [data-ui="content.toolbar.drawing.pencil"]'
            );
            await cropPencil.click();
            if (
              await page.locator('[data-ui="content.toolbar.drawing-options.pencil"]').isVisible()
            )
              await cropPencil.click();
            await stroke(page, { x: 550, y: 300 }, { x: 780, y: 300 });
            await expect(page.locator('[data-ui="content.crop.undo"]')).toBeEnabled();
          }
          for (
            let attempt = 0;
            attempt < 5 && (await page.locator('.sniptale-selection-container').count());
            attempt++
          ) {
            await page.keyboard.press('Escape');
          }
          await expect(page.locator('.sniptale-selection-container')).toHaveCount(0);
          const before = await readMainDrawingPixels(page);
          await stroke(page, { x: 550, y: 300 }, { x: 780, y: 300 });
          await expect.poll(() => readMainDrawingPixels(page)).toBeGreaterThan(before + 100);
          expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
          await expect.poll(() => readStoredCropMode(popup)).toBe(nextMode);
          await page.screenshot({
            path: info.outputPath(`crop-${expectedMode}-recovered.png`),
            fullPage: false,
          });
        } finally {
          await popup.close();
          await page.close();
        }
      }
    } finally {
      await closeExtensionBrowser(launched, { removeUserDataDir: true });
    }
  });

  test(`Crop switches Resize and Drawing and captures annotations at ${viewport.width}`, async ({
    hostOrigin,
  }, info) => {
    const launched = await launchExtensionBrowser({ viewport });
    const { context, extensionId } = launched;
    try {
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport);
      const frozen = viewport.width === 1920;
      try {
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.cursor"]').click();
        await page.evaluate(() => {
          const fixture = document.createElement('div');
          fixture.id = 'crop-drawing-fixture';
          fixture.style.cssText =
            'position:fixed;inset:0;overflow:auto;pointer-events:none;z-index:1;' +
            'background:repeating-linear-gradient(90deg,#000 0 8px,#fff 8px 16px)';
          const tall = document.createElement('div');
          tall.style.height = '2000px';
          fixture.append(tall);
          document.body.append(fixture);
        });
        await revealCaptureDelay(page);
        await page.locator('[data-ui="content.toolbar.timer-button"]').click();
        await page
          .locator('[data-ui="content.toolbar.timer-menu"]')
          .getByText(frozen ? '3 seconds' : 'No delay', { exact: true })
          .click();
        await page.locator('[data-ui="content.toolbar.capture-selection-button"]').click();
        await expect(page.locator('.sniptale-selection-container')).toBeVisible();
        if (frozen) {
          await expect(page.locator('.sniptale-selection-frozen-frame')).toBeAttached();
          await page.evaluate(() => {
            document.querySelector<HTMLElement>('#crop-drawing-fixture')!.style.background =
              '#ff0000';
          });
        }
        await stroke(page, { x: 500, y: 220 }, { x: 820, y: 420 });
        const toolbar = page.locator('.sniptale-selection-toolbar');
        const toggle = page.locator('[data-ui="content.crop.mode-toggle"]');
        const resizeMode = toggle.locator('[data-ui="content.crop.mode.resize"]');
        const drawingMode = toggle.locator('[data-ui="content.crop.mode.drawing"]');
        const frame = page.locator('.sniptale-selection-final-frame');
        const capture = page.locator('.sniptale-selection-size-confirm-button');
        await expect(toggle).toBeVisible();
        await expect(toggle).toHaveJSProperty('tagName', 'BUTTON');
        await expect(toggle.locator('button')).toHaveCount(0);
        await expect(drawingMode.locator('.lucide-pencil')).toBeVisible();
        await expect(resizeMode).toBeVisible();
        await expect(drawingMode).toBeVisible();
        await expect(drawingMode).toHaveAttribute('data-active', 'true');
        await expect(page.locator('[data-ui="content.crop.undo"]')).toBeDisabled();
        await expect(page.locator('[data-ui="content.crop.redo"]')).toBeDisabled();
        await expect(page.locator('[data-ui="content.crop.eraser"]')).toHaveCount(0);
        await expect(page.locator('[data-ui="content.crop.clear"]')).toHaveCount(0);
        await resizeMode.click();
        await expect(resizeMode).toHaveAttribute('data-active', 'true');
        await expect(drawingMode).toHaveAttribute('data-active', 'false');
        await expect(resizeMode).toHaveCSS('border-top-width', '0px');
        await expect(resizeMode).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(toolbar).toHaveAttribute('data-crop-mode', 'resize');
        await expect(page.locator('#sniptale-width-input')).toBeVisible();
        await expect
          .poll(() =>
            toolbar.evaluate((node) => {
              const close = node.querySelector('.sniptale-selection-size-cancel-button');
              return Boolean(
                close &&
                close === close.parentElement?.lastElementChild &&
                close.previousElementSibling?.classList.contains('sniptale-glass-toolbar-divider')
              );
            })
          )
          .toBe(true);
        await capture.hover();
        await expect(capture.locator('svg').first()).toHaveCSS(
          'stroke-width',
          await capture.evaluate(
            (element) =>
              `${Number(getComputedStyle(element).getPropertyValue('--sniptale-control-icon-stroke-hover'))}px`
          )
        );
        await capture.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(capture).toBeFocused();
        await expect(capture).toHaveCSS('outline-style', 'solid');
        await page.screenshot({ path: info.outputPath('crop-modes-resize.png'), fullPage: false });
        await toggle.focus();
        await page.keyboard.press('Enter');
        await expect(drawingMode).toHaveAttribute('data-active', 'true');
        await expect(resizeMode).toHaveAttribute('data-active', 'false');
        await checkKeyboardDrawingMenuGap(page);
        await drawingMode.click();
        await expect(toolbar).toHaveAttribute('data-crop-mode', 'resize');
        await resizeMode.click();
        await expect(toolbar).toHaveAttribute('data-crop-mode', 'drawing');
        await toggle.focus();
        await page.keyboard.press('Space');
        await expect(toolbar).toHaveAttribute('data-crop-mode', 'resize');
        await drawingMode.click();
        await expect(toolbar).toHaveAttribute('data-crop-mode', 'drawing');
        await expect(page.locator('#sniptale-width-input')).toBeHidden();
        await expect(frame).toHaveCSS('pointer-events', 'none');
        await expect(page.locator('.sniptale-resize-handle').first()).toBeHidden();
        const originalFrame = await frame.boundingBox();
        for (const tool of ['select', 'pencil', 'marker', 'text', 'shape', 'arrow', 'blur']) {
          await expect(
            page.locator(
              `[data-ui="content.crop.drawing-slot"] [data-ui="content.toolbar.drawing.${tool}"]`
            )
          ).toBeVisible();
        }
        const pencil = page.locator(
          '[data-ui="content.crop.drawing-slot"] [data-ui="content.toolbar.drawing.pencil"]'
        );
        const options = page.locator('[data-ui="content.toolbar.drawing-options.pencil"]');
        if (!(await options.isVisible())) await pencil.click();
        await expect(options).toBeVisible();
        await expect(pencil).toHaveAttribute('data-menu-side', 'up');
        expect((await options.boundingBox())!.y).toBeLessThan((await toolbar.boundingBox())!.y);
        await options.locator('button[title="#f97316"]').click();
        await pencil.click();
        await stroke(page, { x: 450, y: 300 }, { x: 870, y: 300 });
        expect(await frame.boundingBox()).toEqual(originalFrame);
        const masked = await page.screenshot({
          path: info.outputPath('drawing-mask.png'),
          fullPage: false,
        });
        const colors = await page.evaluate(async (base64) => {
          const image = new Image();
          image.src = `data:image/png;base64,${base64}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          const chroma = (x: number) => {
            const pixels = context.getImageData(x - 1, 298, 3, 5).data;
            let maximum = 0;
            for (let offset = 0; offset < pixels.length; offset += 4) {
              maximum = Math.max(maximum, pixels[offset]! - pixels[offset + 2]!);
            }
            return maximum;
          };
          return { inside: chroma(600), outside: chroma(456) };
        }, masked.toString('base64'));
        expect(colors.inside - colors.outside).toBeGreaterThan(20);
        await resizeMode.click();
        await expect(frame).toHaveCSS('pointer-events', 'auto');
        await expect(page.locator('#sniptale-width-input')).toBeVisible();
        await page.locator('#sniptale-width-input').fill('340');
        await page.locator('#sniptale-width-input').press('Enter');
        await expect(frame).toHaveCSS('width', '340px');
        await drawingMode.click();
        await expect(toolbar).toHaveAttribute('data-crop-mode', 'drawing');
        await checkCropUndoRedo(page);
        await page
          .locator('[data-ui="content.crop.drawing-slot"] [data-ui="content.toolbar.drawing.blur"]')
          .click();
        await stroke(page, { x: 650, y: 340 }, { x: 750, y: 390 });
        await expect(frame).toHaveCSS('pointer-events', 'none');
        await page.screenshot({
          path: info.outputPath('drawing-tools-and-blur.png'),
          fullPage: false,
        });
        const captureTrigger = page.locator('.sniptale-selection-capture-menu-trigger');
        const captureMenu = page.locator('[data-ui="content.selection.capture-action-menu"]');
        for (const mode of ['blur', 'select']) {
          await page
            .locator(
              `[data-ui="content.crop.drawing-slot"] [data-ui="content.toolbar.drawing.${mode}"]`
            )
            .click();
          await captureTrigger.click();
          await expect(captureMenu).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(captureMenu).toHaveCount(0);
          await expect(captureTrigger).toBeFocused();
          await expect(toolbar).toHaveAttribute('data-crop-mode', 'drawing');
          await expect(frame).toHaveCSS('pointer-events', 'none');
          await expect(page.locator('[data-ui="content.drawing.text-object"]')).toContainText(
            'Crop text'
          );
        }
        await checkCropCaptureActionMenu(page, info);
        await captureTrigger.click();
        const editorOpened = context.waitForEvent('page');
        await page.locator('[data-ui="content.selection.capture-action-option.edit"]').click();
        const editor = await editorOpened;
        await editor.setViewportSize(viewport);
        await expect(editor.locator('[data-ui="editor.page.root"]')).toBeVisible();
        await expect
          .poll(async () => {
            const pixels = await readCapturedPixels(editor);
            return pixels.ink > 100 && pixels.blurred > 500;
          })
          .toBe(true);
        const output = await readCapturedPixels(editor);
        expect(output.ink).toBeGreaterThan(100);
        expect(output.blurred).toBeGreaterThan(500);
        expect(output.red).toBe(0);
        await expect(editor.locator('[data-ui="editor.page.open-loading"]')).toBeHidden();
        await editor.screenshot({
          path: info.outputPath('captured-annotations.png'),
          fullPage: false,
        });
        await editor.close();
        await expect(page.locator('.sniptale-selection-container')).toHaveCount(0);
        await expect(page.locator('[data-ui="content.crop.drawing-layer"]')).toHaveCount(0);
        await page.bringToFront();
        await page.locator('[data-ui="content.toolbar.capture-selection-button"]').click();
        await expect(page.locator('.sniptale-selection-container')).toBeVisible();
        await stroke(page, { x: 400, y: 10 }, { x: 720, y: 30 });
        await expect(drawingMode).toHaveAttribute('data-active', 'true');
        await expect(page.locator('[data-ui="content.crop.undo"]')).toBeDisabled();
        await expect(page.locator('[data-ui="content.crop.redo"]')).toBeDisabled();
        await expect(options).toBeVisible();
        await expect(pencil).toHaveAttribute('data-menu-side', 'down');
        expect((await options.boundingBox())!.y).toBeGreaterThan((await toolbar.boundingBox())!.y);
        await page.screenshot({
          path: info.outputPath('top-edge-properties.png'),
          fullPage: false,
        });
        if (!frozen) {
          await page.setViewportSize({ width: 960, height: 560 });
          await expect
            .poll(async () => {
              const bounds = (await toolbar.boundingBox())!;
              return bounds.x >= 0 && bounds.x + bounds.width <= 960;
            })
            .toBe(true);
          await expect
            .poll(() =>
              page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
            )
            .toBe(true);
          await page.screenshot({ path: info.outputPath('crop-960.png'), fullPage: false });
        }
        await page.locator('.sniptale-selection-size-cancel-button').click();
        await expect(page.locator('.sniptale-selection-container')).toHaveCount(0);
        await expect(page.locator('[data-ui="content.crop.drawing-layer"]')).toHaveCount(0);
      } catch (error) {
        await page.screenshot({ path: info.outputPath('crop-failure.png'), fullPage: false });
        throw error;
      } finally {
        await page.close();
        await popup.close();
      }
    } finally {
      await closeExtensionBrowser(launched, { removeUserDataDir: true });
    }
  });
}
