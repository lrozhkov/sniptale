import type { BrowserContext, Locator, Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

async function openCropWorkspace(
  context: BrowserContext,
  extensionId: string,
  hostOrigin: string,
  viewport: { width: number; height: number },
  theme = 'light'
) {
  const opened = await openDesignReview(context, extensionId, hostOrigin, viewport);
  await opened.popup.evaluate(async (nextTheme) => {
    await chrome.storage.local.set({ 'sniptale-theme-preference': nextTheme });
  }, theme);
  const page = opened.page;
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.cursor"]').click();
  await page.locator('[data-ui="content.toolbar.timer-button"]').click();
  await page
    .locator('[data-ui="content.toolbar.timer-menu"]')
    .getByText('No delay', { exact: true })
    .click();
  const capture = page.locator('[data-ui="content.toolbar.capture-selection-button"]');
  const mainGeometry = await capture.evaluate((button) => ({
    height: button.getBoundingClientRect().height,
    icon: button.querySelector('svg')!.getBoundingClientRect().width,
    shell: button.closest('.sniptale-toolbar-root')!.getBoundingClientRect().height,
  }));
  return { ...opened, mainGeometry };
}

async function selectCrop(
  page: Page,
  rect: { x: number; y: number; width: number; height: number }
) {
  await page.locator('[data-ui="content.toolbar.capture-selection-button"]').click();
  await expect(page.locator('.sniptale-selection-container')).toBeVisible();
  await page.mouse.move(rect.x, rect.y);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width, rect.y + rect.height, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.sniptale-selection-toolbar')).toBeVisible();
}

async function noPointerRing(button: Locator) {
  await expect(button).not.toBeFocused();
  await expect(button).toHaveCSS('outline-style', 'none');
}

async function checkCaptureChrome(page: Page) {
  const toolbar = page.locator('.sniptale-selection-toolbar');
  const capture = page.locator('.sniptale-selection-size-confirm-button');
  const trigger = page.locator('.sniptale-selection-capture-menu-trigger');
  for (const target of [capture, trigger]) {
    await target.hover();
    const readChrome = () =>
      toolbar.evaluate((root) => {
        const buttons = [
          '.sniptale-selection-size-confirm-button',
          '.sniptale-selection-capture-menu-trigger',
        ];
        return buttons.map((selector) => {
          const style = getComputedStyle(root.querySelector(selector)!);
          return { background: style.backgroundColor, border: style.borderTopColor };
        });
      });
    await expect
      .poll(async () => {
        const chrome = await readChrome();
        return (
          chrome[0]!.background !== 'rgba(0, 0, 0, 0)' &&
          chrome[0]!.background === chrome[1]!.background &&
          chrome[0]!.border === chrome[1]!.border
        );
      })
      .toBe(true);
  }
  await trigger.click();
  const menu = page.locator('.sniptale-selection-capture-menu');
  await expect(menu).toBeVisible();
  await expect
    .poll(async () => {
      const shell = (await toolbar.boundingBox())!;
      const bounds = (await menu.boundingBox())!;
      return Math.max(shell.y - bounds.y - bounds.height, bounds.y - shell.y - shell.height);
    })
    .toBeGreaterThanOrEqual(9);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press('Escape');
}

async function checkDimensionField(page: Page) {
  await page.locator('[data-ui="content.crop.mode.resize"]').click();
  const input = page.locator('#sniptale-width-input');
  await input.click();
  await input.fill('1000');
  await expect(input).toHaveCSS('box-shadow', 'none');
  const geometry = await input.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return {
      width: element.parentElement!.getBoundingClientRect().width,
      available:
        element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      text: context.measureText(element.value).width,
    };
  });
  expect(geometry.width).toBeLessThanOrEqual(64);
  expect(geometry.available).toBeGreaterThanOrEqual(geometry.text);
  await input.press('Tab');
  await expect(input).toHaveValue('1000');
}

async function checkToolFocus(
  page: Page,
  mainGeometry: { height: number; icon: number; shell: number }
) {
  const drawing = page.locator('[data-ui="content.crop.mode.drawing"]');
  await drawing.click();
  await noPointerRing(drawing);
  const pencil = page.locator(
    '[data-ui="content.crop.drawing-slot"] [data-ui="content.toolbar.drawing.pencil"]'
  );
  await pencil.click();
  await noPointerRing(pencil);
  const geometry = await pencil.evaluate((button) => ({
    height: button.getBoundingClientRect().height,
    icon: button.querySelector('svg')!.getBoundingClientRect().width,
    shell: button.closest('.sniptale-toolbar-root')!.getBoundingClientRect().height,
  }));
  expect(geometry).toEqual(mainGeometry);
  await pencil.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(pencil).toBeFocused();
  await expect(pencil).toHaveCSS('outline-style', 'solid');
  await pencil.click();
  await noPointerRing(pencil);
  const marker = page.locator(
    '[data-ui="content.crop.drawing-slot"] [data-ui="content.toolbar.drawing.marker"]'
  );
  await marker.click();
  await noPointerRing(marker);
  const option = page.locator('[data-ui="content.toolbar.drawing-options.marker"] button').first();
  await option.click();
  await noPointerRing(option);
}

function overlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number }
) {
  return (
    Math.max(
      0,
      Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x)
    ) *
    Math.max(
      0,
      Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y)
    )
  );
}

async function checkSelectedPair(
  page: Page,
  crop: { x: number; y: number; width: number; height: number }
) {
  await page
    .locator('[data-ui="content.crop.drawing-slot"] [data-ui="content.toolbar.drawing.blur"]')
    .click();
  await page.mouse.move(crop.x + 40, crop.y + 70);
  await page.mouse.down();
  await page.mouse.move(crop.x + 140, crop.y + 140, { steps: 4 });
  await page.mouse.up();
  const pair = page.locator('[data-ui="content.toolbar.drawing-options.pair"]');
  await expect(pair).toBeVisible();
  const toolbar = (await page.locator('.sniptale-selection-toolbar').boundingBox())!;
  expect(overlap((await pair.boundingBox())!, toolbar)).toBeLessThanOrEqual(1);
  const bounds = (await pair.boundingBox())!;
  expect(
    Math.min(
      Math.abs(bounds.y + bounds.height - toolbar.y),
      Math.abs(bounds.y - toolbar.y - toolbar.height)
    )
  ).toBeCloseTo(10, 0);
}

for (const { name, size: viewport } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    test(`Crop toolbar pointer and keyboard chrome ${name} ${theme}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup, mainGeometry } = await openCropWorkspace(
        context,
        extensionId,
        hostOrigin,
        viewport,
        theme
      );
      try {
        await selectCrop(page, { x: 200, y: 220, width: 400, height: 200 });
        await checkCaptureChrome(page);
        await checkDimensionField(page);
        await checkToolFocus(page, mainGeometry);
        await page.mouse.move(viewport.width - 20, viewport.height - 20);
        await page.screenshot({
          path: info.outputPath('crop-toolbar-drawing.png'),
          fullPage: false,
        });
        await page.locator('[data-ui="content.crop.mode.resize"]').click();
        await page.screenshot({
          path: info.outputPath('crop-toolbar-resize.png'),
          fullPage: false,
        });
        if (viewport.width === 1280) {
          await page.setViewportSize({ width: 960, height: 560 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
          ).toBe(true);
          await page.screenshot({ path: info.outputPath('crop-toolbar-960.png'), fullPage: false });
        }
      } finally {
        await popup.close();
        await page.close();
      }
    });
  }

  for (const scenario of ['top', 'side', 'full'] as const) {
    test(`Crop floating tools stay anchored ${name} ${scenario}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup } = await openCropWorkspace(context, extensionId, hostOrigin, viewport);
      const crop =
        scenario === 'top'
          ? { x: 200, y: 8, width: 500, height: 240 }
          : {
              x: 8,
              y: 8,
              width: scenario === 'side' ? 500 : viewport.width - 16,
              height: viewport.height - 16,
            };
      try {
        await selectCrop(page, crop);
        await page.locator('[data-ui="content.crop.mode.drawing"]').click();
        const toolbar = page.locator('.sniptale-selection-toolbar');
        const pencil = page.locator(
          '[data-ui="content.crop.drawing-slot"] [data-ui="content.toolbar.drawing.pencil"]'
        );
        const options = page.locator('[data-ui="content.toolbar.drawing-options.pencil"]');
        if (!(await options.isVisible())) await pencil.click();
        await expect(options).toBeVisible();
        const surface = page.locator('.sniptale-drawing-options-popover').filter({ has: options });
        await expect
          .poll(async () => {
            const bounds = (await surface.boundingBox())!;
            const shell = (await toolbar.boundingBox())!;
            return overlap(bounds, shell);
          })
          .toBeLessThanOrEqual(1);
        const bounds = (await surface.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(7);
        expect(bounds.y).toBeGreaterThanOrEqual(7);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 7);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 7);
        const shell = (await toolbar.boundingBox())!;
        expect(
          Math.min(
            Math.abs(bounds.y + bounds.height - shell.y),
            Math.abs(bounds.y - shell.y - shell.height)
          )
        ).toBeCloseTo(10, 0);
        expect(
          Math.abs(bounds.x - Math.min(Math.max(shell.x, 8), viewport.width - bounds.width - 8))
        ).toBeLessThanOrEqual(1);
        const expectedSide = bounds.y + bounds.height <= shell.y ? 'up' : 'down';
        await expect(pencil).toHaveAttribute('data-menu-side', expectedSide);
        await page.screenshot({
          path: info.outputPath('crop-floating-tools.png'),
          fullPage: false,
        });
        if (scenario === 'top') {
          await checkSelectedPair(page, crop);
          await page.screenshot({
            path: info.outputPath('crop-selected-pair.png'),
            fullPage: false,
          });
        }
      } finally {
        await popup.close();
        await page.close();
      }
    });
  }
}
