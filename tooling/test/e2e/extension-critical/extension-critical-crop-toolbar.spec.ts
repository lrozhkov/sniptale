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
  const modeMenu = page.locator('.sniptale-mode-wrapper .sniptale-toolbar-menu');
  await modeMenu.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const menuGap = await modeMenu.evaluate((element) => {
    const shell = element.closest('.sniptale-toolbar')!.getBoundingClientRect();
    const menu = element.getBoundingClientRect();
    return Math.max(shell.top - menu.bottom, menu.top - shell.bottom);
  });
  await page.locator('[data-ui="content.toolbar.mode-option.cursor"]').click();
  if ((await page.locator('[data-ui="content.toolbar.timer-button"]').count()) === 0) {
    await page.locator('[data-ui="content.toolbar.settings-button"]').click();
    await page.locator('[data-ui="content.toolbar.settings.show-hidden-buttons"]').click();
    await page.keyboard.press('Escape');
  }
  await page.locator('[data-ui="content.toolbar.timer-button"]').click();
  await page.locator('[data-ui="content.toolbar.timer-menu"]').getByRole('button').first().click();
  const capture = page.locator('[data-ui="content.toolbar.capture-selection-button"]');
  const mainGeometry = await capture.evaluate((button) => ({
    height: button.getBoundingClientRect().height,
    icon: button.querySelector('svg')!.getBoundingClientRect().width,
    shell: button.closest('.sniptale-toolbar-root')!.getBoundingClientRect().height,
  }));
  return { ...opened, mainGeometry: { ...mainGeometry, menuGap } };
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

for (const theme of ['light', 'dark']) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`region and crop resize chrome ${theme} ${viewport.name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup } = await openCropWorkspace(
        context,
        extensionId,
        hostOrigin,
        viewport.size,
        theme
      );
      const overlayMessage = async (show: boolean) =>
        popup.evaluate(
          async ({ url, show }) => {
            const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
            if (tab?.id === undefined) throw new Error('Region test tab unavailable');
            return chrome.tabs.sendMessage(
              tab.id,
              show
                ? {
                    type: 'SHOW_REGION_SELECTOR',
                    regionSelectionCapabilityToken: crypto.randomUUID(),
                    regionSelectionRequestGeneration: crypto.randomUUID(),
                    regionSelectionRequestId: crypto.randomUUID(),
                  }
                : { type: 'HIDE_REGION_SELECTOR' }
            );
          },
          { url: page.url(), show }
        );
      try {
        await overlayMessage(true);
        const region = page.locator('#sniptale-region');
        const panel = page.locator('#sniptale-region-selector-root .sniptale-content-size-tooltip');
        await expect(region).toHaveCSS('border-top-style', 'dashed');
        await expect(region).toHaveCSS('cursor', 'move');
        await expect(panel).toHaveAttribute('data-variant', 'frame-edit');
        const ratio = page.locator('[data-ui="content.region-aspect-ratio"] button');
        await expect(panel.locator('select')).toHaveCount(0);
        await expect(panel.locator('.sniptale-selection-size-confirm-button')).toHaveAccessibleName(
          /Start recording|Начать запись/
        );
        const confirm = panel.locator('.sniptale-selection-size-confirm-button');
        await page.mouse.move(viewport.size.width - 4, viewport.size.height - 4);
        const idleColor = await confirm.evaluate((element) => getComputedStyle(element).color);
        const idleBounds = (await confirm.boundingBox())!;
        await confirm.hover();
        await expect(confirm).not.toHaveCSS('color', idleColor);
        await confirm.evaluate(async (element) => {
          await Promise.all(element.getAnimations().map((animation) => animation.finished));
        });
        const hoverColor = await confirm.evaluate((element) => getComputedStyle(element).color);
        const hoverBounds = (await confirm.boundingBox())!;
        expect(Math.abs(idleBounds.width - hoverBounds.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(idleBounds.height - hoverBounds.height)).toBeLessThanOrEqual(1);
        const chooseRatio = async (value: string) => {
          await ratio.click();
          await expect(ratio).toHaveAttribute('aria-expanded', 'true');
          await expect(ratio.locator('svg')).toHaveClass(/rotate-180/);
          const menu = page.getByRole('listbox');
          await expect(menu).toBeVisible();
          const menuMetrics = await menu.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return {
              scrollHeight: element.scrollHeight,
              clientHeight: element.clientHeight,
              availableHeight:
                getComputedStyle(element).transform === 'none'
                  ? innerHeight - bounds.top - 8
                  : bounds.bottom - 8,
            };
          });
          if (menuMetrics.availableHeight >= menuMetrics.scrollHeight) {
            expect(menuMetrics.scrollHeight - menuMetrics.clientHeight).toBeLessThanOrEqual(1);
          } else {
            await expect(menu).toHaveCSS('overflow-y', 'auto');
            expect(menuMetrics.clientHeight).toBeLessThanOrEqual(menuMetrics.availableHeight + 1);
          }
          await expect(menu.getByRole('option').first()).toHaveCSS('font-weight', '400');
          expect(await menu.evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
            'Sniptale Interface'
          );
          await expect(menu.getByRole('option', { selected: true })).toHaveCount(1);
          await menu.getByRole('option', { name: value, exact: true }).click();
          await expect(ratio).toHaveText(value);
          expect(await ratio.evaluate((element) => element.matches(':focus-visible'))).toBe(false);
        };
        for (const value of ['16:9', '4:3', '1:1', '9:16']) {
          await chooseRatio(value);
          const [width, height] = value.split(':').map(Number);
          const bounds = (await region.boundingBox())!;
          expect(bounds.width % 2).toBe(0);
          expect(bounds.height % 2).toBe(0);
          expect(Math.abs(bounds.width - (bounds.height * width!) / height!)).toBeLessThanOrEqual(
            2
          );
        }
        await chooseRatio('16:9');
        await ratio.click();
        await ratio.locator('svg').evaluate(async (element) => {
          await Promise.all(element.getAnimations().map((animation) => animation.finished));
        });
        await page.screenshot({ path: info.outputPath('region-ratio-menu.png'), fullPage: false });
        await ratio.click();
        const lock = panel.locator('.sniptale-selection-size-ratio-button');
        await lock.click();
        expect(await lock.evaluate((element) => element.matches(':focus-visible'))).toBe(false);
        await chooseRatio('16:9');
        await ratio.focus();
        await page.keyboard.press('ArrowDown');
        await expect(page.getByRole('option', { name: '16:9', exact: true })).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(ratio).toBeFocused();
        await expect(page.getByRole('listbox')).toHaveCount(0);
        await ratio.press('ArrowDown');
        await expect(page.getByRole('listbox')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('listbox')).toHaveCount(0);
        await expect(panel).toBeVisible();
        const handle = region.locator('[data-corner="se"]');
        await ratio.click();
        await expect(page.getByRole('listbox')).toBeVisible();
        const start = (await handle.boundingBox())!;
        await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
        await page.mouse.down();
        await expect(region).toHaveCSS('opacity', '0');
        await expect(page.getByRole('listbox')).toHaveCount(0);
        await expect(panel).toHaveCSS('visibility', 'hidden');
        await page.mouse.move(start.x + 41, start.y + 29);
        await page.screenshot({ path: info.outputPath('region-resizing.png'), fullPage: false });
        await page.mouse.up();
        await expect(region).toHaveCSS('opacity', '1');
        await expect(panel).toHaveCSS('visibility', 'visible');
        const resized = (await region.boundingBox())!;
        expect(Math.abs(resized.width - (resized.height * 16) / 9)).toBeLessThanOrEqual(2);
        expect(resized.width % 2).toBe(0);
        expect(resized.height % 2).toBe(0);
        const moveX = resized.x + resized.width - 40;
        await ratio.click();
        await expect(page.getByRole('listbox')).toBeVisible();
        await page.mouse.move(moveX, resized.y + 40);
        await page.mouse.down();
        await page.mouse.move(moveX + 20, resized.y + 55);
        await expect(region).toHaveCSS('cursor', 'move');
        await expect(page.getByRole('listbox')).toHaveCount(0);
        await expect(region).toHaveCSS('opacity', '0');
        await expect(panel).toHaveCSS('visibility', 'hidden');
        await page.mouse.up();
        await expect(region).toHaveCSS('opacity', '1');
        await expect(panel).toHaveCSS('visibility', 'visible');
        await page.screenshot({ path: info.outputPath('region-controls.png'), fullPage: false });
        const panelBounds = (await panel.boundingBox())!;
        expect(panelBounds.height).toBeLessThanOrEqual(52);
        expect(panelBounds.x).toBeGreaterThanOrEqual(0);
        expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(viewport.size.width);
        await ratio.click();
        await overlayMessage(false);
        await expect(page.getByRole('listbox')).toHaveCount(0);
        await page.setViewportSize({ width: viewport.size.width, height: 220 });
        await overlayMessage(true);
        await ratio.click();
        const constrainedMenu = page.getByRole('listbox');
        expect(
          await constrainedMenu.evaluate((element) => element.scrollHeight - element.clientHeight)
        ).toBeGreaterThan(1);
        await constrainedMenu.getByRole('option').last().scrollIntoViewIfNeeded();
        expect(await constrainedMenu.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        await page.screenshot({
          path: info.outputPath('region-ratio-constrained.png'),
          fullPage: false,
        });
        await constrainedMenu.getByRole('option').last().click();
        await expect(ratio).toHaveText('9:16');
        await overlayMessage(false);
        await page.setViewportSize(viewport.size);
        await selectCrop(page, { x: 300, y: 100, width: 321, height: 181 });
        await page.locator('[data-ui="content.crop.mode.resize"]').click();
        const frame = page.locator('.sniptale-selection-final-frame');
        const cropPanel = page.locator('.sniptale-selection-toolbar');
        const cropConfirm = cropPanel.locator('.sniptale-selection-size-confirm-button');
        await page.mouse.move(viewport.size.width - 4, viewport.size.height - 4);
        await expect(cropConfirm).toHaveCSS('color', idleColor);
        await cropConfirm.hover();
        await expect(cropConfirm).toHaveCSS('color', hoverColor);
        expect((await frame.boundingBox())!.width).toBe(321);
        const corner = (await frame.locator('[data-direction="se"]').boundingBox())!;
        await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
        await page.mouse.down();
        await expect(frame).toHaveCSS('opacity', '0');
        await expect(cropPanel).toHaveCSS('visibility', 'hidden');
        await page.mouse.move(corner.x + 33, corner.y + 23);
        await page.screenshot({ path: info.outputPath('crop-resizing.png'), fullPage: false });
        await page.mouse.up();
        await expect(frame).toHaveCSS('opacity', '1');
        await expect(cropPanel).toHaveCSS('visibility', 'visible');
        const moved = (await frame.boundingBox())!;
        await page.mouse.move(moved.x + 40, moved.y + 40);
        await page.mouse.down();
        await expect(frame).toHaveCSS('opacity', '0');
        await expect(cropPanel).toHaveCSS('visibility', 'hidden');
        await page.mouse.move(moved.x + 65, moved.y + 55);
        await page.mouse.up();
        await expect(frame).toHaveCSS('opacity', '1');
        await expect(cropPanel).toHaveCSS('visibility', 'visible');
        await page.keyboard.press('Escape');
        await expect(cropPanel).toHaveCount(0);
        await page.setViewportSize({ width: 960, height: viewport.size.height });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
      } finally {
        await popup.close();
        await page.close();
      }
    });
  }
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`crop drawing keeps compact height after selecting a layer ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openCropWorkspace(
      context,
      extensionId,
      hostOrigin,
      size,
      size.width === 1920 ? 'dark' : 'light'
    );
    try {
      await selectCrop(page, { x: 300, y: 100, width: 480, height: 200 });
      await page.locator('[data-ui="content.crop.mode.drawing"]').click();
      const arrow = page.locator(
        '[data-ui="content.crop.drawing-slot"] [data-ui="content.toolbar.drawing.arrow"]'
      );
      await arrow.click();
      const panel = page
        .locator('.sniptale-drawing-options-popover')
        .filter({ has: page.locator('[data-ui="content.toolbar.drawing-options.arrow"]') });
      await expect(panel).toBeVisible();
      const before = (await panel.boundingBox())!.height;
      expect(before).toBeLessThanOrEqual(42);
      await page.screenshot({
        path: info.outputPath('crop-unselected-height.png'),
        fullPage: false,
      });
      await page.mouse.move(380, 150);
      await page.mouse.down();
      await page.mouse.move(540, 200, { steps: 4 });
      await page.mouse.up();
      const pair = page.locator('[data-ui="content.toolbar.drawing-options.pair"]');
      await expect(pair).toBeVisible();
      for (const surface of await pair.locator('.sniptale-drawing-options-popover').all())
        expect((await surface.boundingBox())!.height).toBeCloseTo(before, 0);
      await page.screenshot({ path: info.outputPath('crop-selected-height.png'), fullPage: false });
    } finally {
      await popup.close();
      await page.close();
    }
  });
}

async function noPointerRing(button: Locator) {
  await expect(button).not.toBeFocused();
  await expect(button).toHaveCSS('outline-style', 'none');
}

async function restPointer(page: Page, toolbar: Locator) {
  const bounds = (await toolbar.boundingBox())!;
  await page.mouse.move(bounds.x + 2, bounds.y + 2);
}

async function buttonAppearance(button: Locator) {
  return button.evaluate(async (node) => {
    await Promise.all(
      node
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined))
    );
    const style = getComputedStyle(node);
    const icon = node.querySelector('svg');
    return {
      background: style.backgroundColor,
      border: style.borderTopColor,
      color: style.color,
      radius: style.borderTopLeftRadius,
      shadow: style.boxShadow,
      weight: style.fontWeight,
      stroke: icon ? getComputedStyle(icon).strokeWidth : null,
      outline: style.outlineStyle,
    };
  });
}

async function choiceAppearance(page: Page, toolbar: Locator, button: Locator) {
  await restPointer(page, toolbar);
  const idle = await buttonAppearance(button);
  await button.hover();
  const hover = await buttonAppearance(button);
  await button.click();
  await restPointer(page, toolbar);
  const selected = await buttonAppearance(button);
  await button.hover();
  const selectedHover = await buttonAppearance(button);
  return { idle, hover, selected, selectedHover };
}

async function drawingSemantics(page: Page, toolbar: Locator) {
  const tools: Record<string, Awaited<ReturnType<typeof choiceAppearance>>> = {};
  const toolButton = (tool: string) =>
    toolbar.locator(`[data-ui="content.toolbar.drawing.${tool}"]`);
  for (const tool of ['select', 'pencil', 'marker', 'text', 'shape', 'arrow', 'blur']) {
    await toolButton(tool === 'select' ? 'pencil' : 'select').click();
    tools[tool] = await choiceAppearance(page, toolbar, toolButton(tool));
  }
  await toolButton('pencil').click();
  if ((await toolButton('pencil').getAttribute('aria-expanded')) !== 'true') {
    await toolButton('pencil').click();
  }
  await toolbar.locator('[data-ui="content.toolbar.drawing-options.pencil.width-2"]').click();
  const property = await choiceAppearance(
    page,
    toolbar,
    toolbar.locator('[data-ui="content.toolbar.drawing-options.pencil.width-4"]')
  );
  const options = toolbar
    .locator('.sniptale-drawing-options-popover')
    .filter({ has: page.locator('[data-ui="content.toolbar.drawing-options.pencil"]') });
  const menu = (await options.boundingBox())!;
  const shell = (await toolbar.boundingBox())!;
  const gap = Math.max(menu.y - shell.y - shell.height, shell.y - menu.y - menu.height);
  await toolButton('blur').click();
  for (const left of [300, 420]) {
    await page.mouse.move(left, 300);
    await page.mouse.down();
    await page.mouse.move(left + 50, 340, { steps: 4 });
    await page.mouse.up();
  }
  const actions: Record<
    string,
    {
      idle: Awaited<ReturnType<typeof buttonAppearance>>;
      hover: Awaited<ReturnType<typeof buttonAppearance>>;
    }
  > = {};
  const reveal = toolbar.locator('[data-ui="drawing.selection.actions.reveal"]');
  if ((await reveal.getAttribute('aria-expanded')) === 'false') await reveal.click();
  for (const action of [
    'front',
    'forward',
    'backward',
    'back',
    'duplicate',
    'delete',
    'deselect',
  ]) {
    const dataUi =
      action === 'deselect'
        ? 'content.toolbar.drawing-options.deselect'
        : `drawing.selection.actions.${action}`;
    const button = toolbar.locator(`[data-ui="${dataUi}"]`);
    await restPointer(page, toolbar);
    const idle = await buttonAppearance(button);
    await button.hover();
    actions[action] = { idle, hover: await buttonAppearance(button) };
  }
  return { tools, property, actions, gap };
}

async function checkCaptureChrome(page: Page, checkMenu = true) {
  const toolbar = page.locator('.sniptale-selection-toolbar');
  const capture = page.locator('.sniptale-selection-size-confirm-button');
  const trigger = page.locator('.sniptale-selection-capture-menu-trigger');
  await restPointer(page, toolbar);
  const idle = await Promise.all([capture, trigger].map(buttonAppearance));
  const close = toolbar.locator('.sniptale-selection-size-cancel-button');
  const closeIdle = await buttonAppearance(close);
  const geometry = await Promise.all([capture, trigger].map((button) => button.boundingBox()));
  await expect(capture.locator('.sniptale-selection-capture-action-label')).toHaveCSS(
    'font-weight',
    '400'
  );
  for (const state of idle) {
    expect(state.color).toBe(closeIdle.color);
    expect(state.background).toBe('rgba(0, 0, 0, 0)');
    expect(state.border).toBe('rgba(0, 0, 0, 0)');
    expect(state.stroke).toBe('1.75px');
  }
  for (const target of [capture, trigger]) {
    await target.hover();
    const hovered = await buttonAppearance(target);
    const neighbor = await buttonAppearance(target === capture ? trigger : capture);
    expect(hovered.background).toBe('rgba(0, 0, 0, 0)');
    expect(hovered.border).toBe('rgba(0, 0, 0, 0)');
    expect(hovered.weight).toBe('450');
    expect(hovered.stroke).toBe('1.875px');
    expect(hovered.color).not.toBe(idle[target === capture ? 0 : 1]!.color);
    expect(neighbor).toEqual(idle[target === capture ? 1 : 0]);
    await expect(capture.locator('.sniptale-selection-capture-action-label')).toHaveCSS(
      'font-weight',
      target === capture ? '450' : '400'
    );
    const current = await Promise.all([capture, trigger].map((button) => button.boundingBox()));
    for (const index of [0, 1])
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(current[index]![key] - geometry[index]![key])).toBeLessThanOrEqual(1);
      }
  }
  if (!checkMenu) return;
  await trigger.click();
  const menu = page.locator('.sniptale-selection-capture-menu');
  await expect(menu).toBeVisible();
  expect((await buttonAppearance(trigger)).background).toBe('rgba(0, 0, 0, 0)');
  await expect
    .poll(async () => {
      const shell = (await toolbar.boundingBox())!;
      const bounds = (await menu.boundingBox())!;
      return Math.max(shell.y - bounds.y - bounds.height, bounds.y - shell.y - shell.height);
    })
    .toBeGreaterThanOrEqual(0);
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
  expect(mainGeometry).toMatchObject(geometry);
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
  if ((await marker.getAttribute('aria-expanded')) !== 'true') await marker.click();
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
  const panels = pair.locator('.sniptale-drawing-options-popover');
  await expect(panels).toHaveCount(2);
  const propertyPanel = (await panels.nth(0).boundingBox())!;
  const actionsPanel = (await panels.nth(1).boundingBox())!;
  expect(Math.abs(propertyPanel.height - actionsPanel.height)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(propertyPanel.y - actionsPanel.y)).toBeLessThanOrEqual(0.5);
  const toolbar = (await page.locator('.sniptale-selection-toolbar').boundingBox())!;
  expect(overlap(propertyPanel, toolbar)).toBeLessThanOrEqual(1);
  expect(overlap(actionsPanel, toolbar)).toBeLessThanOrEqual(1);
  const bounds = {
    y: Math.min(propertyPanel.y, actionsPanel.y),
    bottom: Math.max(propertyPanel.y + propertyPanel.height, actionsPanel.y + actionsPanel.height),
  };
  expect(
    Math.min(Math.abs(bounds.bottom - toolbar.y), Math.abs(bounds.y - toolbar.y - toolbar.height))
  ).toBeCloseTo(1, 0);
}

test('Crop compacts before scrolling and restores descriptions when space returns', async ({
  context,
  extensionId,
  hostOrigin,
}, info) => {
  const { page, popup, mainGeometry } = await openCropWorkspace(
    context,
    extensionId,
    hostOrigin,
    { width: 1280, height: 360 },
    'dark'
  );
  try {
    await selectCrop(page, { x: 300, y: 8, width: 480, height: 135 });
    await page.locator('[data-ui="content.crop.mode.resize"]').click();
    const toolbar = page.locator('.sniptale-selection-toolbar');
    const trigger = toolbar.locator('.sniptale-selection-capture-menu-trigger');
    await trigger.click();
    const menu = page.locator('.sniptale-selection-capture-menu');
    await expect(menu).toHaveClass(/sniptale-toolbar-menu--compact/);
    await expect(menu.locator('.sniptale-toolbar-menu-item-hint').first()).toBeHidden();
    expect(await menu.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true
    );
    const shell = (await toolbar.boundingBox())!;
    const bounds = (await menu.boundingBox())!;
    expect(
      Math.max(shell.y - bounds.y - bounds.height, bounds.y - shell.y - shell.height)
    ).toBeCloseTo(mainGeometry.menuGap, 0);
    expect(bounds.y).toBeGreaterThanOrEqual(7);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(353);
    await page.screenshot({ path: info.outputPath('compact-scroll.png'), fullPage: false });
    await menu.getByRole('menuitem').first().focus();
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem').last()).toBeFocused();
    expect(await menu.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(menu).not.toHaveClass(/sniptale-toolbar-menu--compact/);
    await expect(menu.locator('.sniptale-toolbar-menu-item-hint').first()).toBeVisible();
    expect(await menu.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
      true
    );
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  } finally {
    await popup.close();
    await page.close();
  }
});

for (const { name, size: viewport } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    test(`Crop capture menu shares toolbar material and animated gap ${name} ${theme}`, async ({
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
      await popup.evaluate(
        async (locale) => {
          await chrome.storage.local.set({ 'sniptale-locale-preference': locale });
        },
        theme === 'dark' ? 'ru' : 'en'
      );
      try {
        for (const side of ['down', 'up', 'middle']) {
          const expectedSide = side === 'up' ? 'up' : 'down';
          await selectCrop(page, {
            x: 300,
            y: 8,
            width: 480,
            height:
              side === 'down'
                ? 60
                : side === 'up'
                  ? viewport.height - 82
                  : Math.floor(viewport.height / 2) - 45,
          });
          const toolbar = page.locator('.sniptale-selection-toolbar');
          for (const mode of ['resize', 'drawing']) {
            await page.locator(`[data-ui="content.crop.mode.${mode}"]`).click();
            const trigger = toolbar.locator('.sniptale-selection-capture-menu-trigger');
            await trigger.click();
            const menu = page.locator('.sniptale-selection-capture-menu');
            await expect(menu).toBeVisible();
            for (const progress of [0, 0.25, 1]) {
              await menu.evaluate(async (element, progress) => {
                element.style.animationFillMode = 'both';
                for (const animation of element.getAnimations()) {
                  const duration = animation.effect?.getComputedTiming().duration;
                  if (typeof duration !== 'number') continue;
                  animation.pause();
                  animation.currentTime = duration * progress;
                }
                await new Promise(requestAnimationFrame);
              }, progress);
              const shell = (await toolbar.boundingBox())!;
              const bounds = (await menu.boundingBox())!;
              const gap =
                expectedSide === 'up'
                  ? shell.y - bounds.y - bounds.height
                  : bounds.y - shell.y - shell.height;
              expect(
                Math.abs(gap - mainGeometry.menuGap),
                `${side}/${mode} phase ${progress}`
              ).toBeLessThanOrEqual(1);
              expect(bounds.x).toBeGreaterThanOrEqual(7);
              expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 7);
            }
            await expect(trigger).toHaveAttribute('data-menu-side', expectedSide);
            if (side === 'middle') {
              if (viewport.height === 560) {
                await expect(menu).toHaveClass(/sniptale-toolbar-menu--compact/);
                await expect(menu.locator('.sniptale-toolbar-menu-item-hint').first()).toBeHidden();
                expect(
                  await menu.evaluate((element) => element.scrollHeight <= element.clientHeight)
                ).toBe(true);
              }
              await menu.getByRole('menuitem').first().focus();
              await page.keyboard.press('End');
              await expect(menu.getByRole('menuitem').last()).toBeFocused();
              expect(
                await menu.evaluate(
                  (element) => element.scrollHeight <= element.clientHeight || element.scrollTop > 0
                )
              ).toBe(true);
            }
            const alpha = await menu.evaluate((element) => {
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = 1;
              const context = canvas.getContext('2d')!;
              context.fillStyle = getComputedStyle(element).backgroundColor;
              context.fillRect(0, 0, 1, 1);
              return context.getImageData(0, 0, 1, 1).data[3];
            });
            expect(alpha).toBe(255);
            await page.screenshot({
              path: info.outputPath(`${side}-${mode}-capture-menu.png`),
              fullPage: false,
            });
            await page.keyboard.press('Escape');
            await expect(menu).toHaveCount(0);
            await expect(trigger).toBeFocused();
          }
          await toolbar.locator('.sniptale-selection-size-cancel-button').click();
          await expect(page.locator('.sniptale-selection-container')).toHaveCount(0);
        }
      } finally {
        await popup.close();
        await page.close();
      }
    });
  }
  for (const theme of ['light', 'dark']) {
    test(`Crop keeps shell spacing across modes ${name} ${theme}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup } = await openCropWorkspace(
        context,
        extensionId,
        hostOrigin,
        viewport,
        theme
      );
      try {
        for (const crop of [
          { x: 400, y: 200, width: 500, height: 180 },
          { x: 400, y: 8, width: 500, height: 180 },
        ]) {
          await selectCrop(page, crop);
          const toolbar = page.locator('.sniptale-selection-toolbar');
          const frame = page.locator('.sniptale-selection-final-frame');
          let shellHeight: number | undefined;
          for (const mode of ['resize', 'drawing', 'resize', 'drawing']) {
            await page.locator(`[data-ui="content.crop.mode.${mode}"]`).click();
            if (mode === 'drawing') {
              const pencil = toolbar.locator('[data-ui="content.toolbar.drawing.pencil"]');
              if ((await pencil.getAttribute('aria-expanded')) !== 'true') await pencil.click();
              await expect(
                page.locator('[data-ui="content.toolbar.drawing-options.pencil"]')
              ).toBeVisible();
            }
            await restPointer(page, toolbar);
            await expect
              .poll(async () => {
                const shell = (await toolbar.boundingBox())!;
                const bounds = (await frame.boundingBox())!;
                return Math.abs(
                  Math.max(bounds.y - shell.y - shell.height, shell.y - bounds.y - bounds.height) -
                    12
                );
              })
              .toBeLessThanOrEqual(1);
            const shell = (await toolbar.boundingBox())!;
            shellHeight ??= shell.height;
            expect(Math.abs(shell.height - shellHeight)).toBeLessThanOrEqual(0.5);
            const action = (await toolbar
              .locator('.sniptale-selection-size-confirm-button')
              .boundingBox())!;
            if (mode === 'resize') {
              for (const input of [
                toolbar.locator('#sniptale-width-input'),
                toolbar.locator('#sniptale-height-input'),
              ]) {
                const numeric = (await input.boundingBox())!;
                expect(Math.abs(numeric.height - action.height)).toBeLessThanOrEqual(0.5);
                expect(Math.abs(numeric.y - action.y)).toBeLessThanOrEqual(0.5);
              }
            } else {
              const panel = toolbar.locator('.sniptale-drawing-options-popover').filter({
                has: page.locator('[data-ui="content.toolbar.drawing-options.pencil"]'),
              });
              await expect
                .poll(async () => {
                  const bounds = (await panel.boundingBox())!;
                  const current = (await toolbar.boundingBox())!;
                  return Math.abs(
                    Math.max(
                      current.y - bounds.y - bounds.height,
                      bounds.y - current.y - current.height
                    ) - 1
                  );
                })
                .toBeLessThanOrEqual(1);
            }
            await page.screenshot({
              path: info.outputPath(`shell-spacing-${crop.y}-${mode}.png`),
              fullPage: false,
            });
          }
          await checkCaptureChrome(page, false);
          await page.locator('[data-ui="content.crop.mode.resize"]').click();
          await page.keyboard.press('Escape');
          await expect(page.locator('.sniptale-selection-container')).toHaveCount(0);
        }
      } finally {
        await popup.close();
        await page.close();
      }
    });

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
        await popup.evaluate(
          async (locale) => {
            await chrome.storage.local.set({ 'sniptale-locale-preference': locale });
          },
          theme === 'dark' ? 'ru' : 'en'
        );
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
        const mainSemantics = await drawingSemantics(
          page,
          page.locator('[data-ui="content.toolbar.root"]')
        );
        await selectCrop(page, { x: 200, y: 220, width: 400, height: 200 });
        await page.locator('[data-ui="content.crop.mode.drawing"]').click();
        const cropSemantics = await drawingSemantics(
          page,
          page.locator('.sniptale-selection-toolbar')
        );
        expect(cropSemantics.tools).toEqual(mainSemantics.tools);
        expect(cropSemantics.property).toEqual(mainSemantics.property);
        expect(cropSemantics.actions).toEqual(mainSemantics.actions);
        expect(Math.abs(cropSemantics.gap - 1)).toBeLessThanOrEqual(1);
        for (const action of ['undo', 'redo'])
          await expect(page.locator(`[data-ui="content.crop.${action}"]`)).toHaveAttribute(
            'data-command-chrome',
            'true'
          );
        await checkCaptureChrome(page);
        await checkDimensionField(page);
        await checkCaptureChrome(page);
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
        await popup.evaluate(async () => {
          await chrome.storage.local.set({ 'sniptale-locale-preference': 'en' });
        });
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
        if (scenario === 'top') {
          expect(overlap(bounds, crop)).toBeLessThanOrEqual(1);
          expect(bounds.y).toBeGreaterThan(shell.y + shell.height);
        }
        expect(
          Math.min(
            Math.abs(bounds.y + bounds.height - shell.y),
            Math.abs(bounds.y - shell.y - shell.height)
          )
        ).toBeCloseTo(1, 0);
        expect(
          Math.abs(
            bounds.x -
              Math.min(
                Math.max((await pencil.boundingBox())!.x, 8),
                viewport.width - bounds.width - 8
              )
          )
        ).toBeLessThanOrEqual(1);
        const expectedSide = bounds.y + bounds.height <= shell.y ? 'up' : 'down';
        await expect(pencil).toHaveAttribute('data-menu-side', expectedSide);
        await page.screenshot({
          path: info.outputPath('crop-floating-tools.png'),
          fullPage: false,
        });
        for (const tool of ['marker', 'text', 'shape', 'arrow']) {
          const activeButton = toolbar.locator(`[data-ui="content.toolbar.drawing.${tool}"]`);
          await activeButton.click();
          const toolPanel = toolbar.locator('.sniptale-drawing-options-popover').filter({
            has: page.locator(`[data-ui="content.toolbar.drawing-options.${tool}"]`),
          });
          await expect(toolPanel).toBeVisible();
          await expect
            .poll(async () => {
              const panelBounds = (await toolPanel.boundingBox())!;
              const anchorBounds = (await activeButton.boundingBox())!;
              const expectedLeft = Math.min(
                Math.max(anchorBounds.x, 8),
                viewport.width - panelBounds.width - 8
              );
              return Math.abs(panelBounds.x - expectedLeft);
            })
            .toBeLessThanOrEqual(1);
        }
        await page.screenshot({
          path: info.outputPath('crop-floating-tools-arrow.png'),
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

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Crop cancellation preserves compact menu preference ${viewport.name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openCropWorkspace(
      context,
      extensionId,
      hostOrigin,
      viewport.size
    );
    try {
      for (const compact of [true, false]) {
        const settings = page.locator('[data-ui="content.toolbar.settings-button"]');
        await settings.click();
        const toggle = page.getByRole('button', { name: /Compact menu view|Компактный вид меню/u });
        if (
          (await toggle.getAttribute('class'))?.includes('sniptale-popover-item-selected') !==
          compact
        )
          await toggle.click();
        if (compact) await expect(toggle).toHaveClass(/sniptale-popover-item-selected/u);
        else await expect(toggle).not.toHaveClass(/sniptale-popover-item-selected/u);
        await page.keyboard.press('Escape');
        await selectCrop(page, { x: 200, y: 180, width: 400, height: 200 });
        await page.locator('.sniptale-selection-size-cancel-button').click();
        await settings.click();
        if (compact) await expect(toggle).toHaveClass(/sniptale-popover-item-selected/u);
        else await expect(toggle).not.toHaveClass(/sniptale-popover-item-selected/u);
        await page.screenshot({ path: info.outputPath(`compact-${compact}.png`), fullPage: false });
        await page.keyboard.press('Escape');
      }
    } finally {
      await popup.close();
      await page.close();
    }
  });
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Crop session format and toolbar settings indicators ${viewport.name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(120000);
    const { page, popup } = await openCropWorkspace(
      context,
      extensionId,
      hostOrigin,
      viewport.size
    );
    try {
      for (const compact of [true, false]) {
        const settings = page.locator('[data-ui="content.toolbar.settings-button"]');
        await settings.click();
        const toggle = page.getByRole('button', { name: /Compact menu view|Компактный вид меню/u });
        if (
          (await toggle.getAttribute('class'))?.includes('sniptale-popover-item-selected') !==
          compact
        )
          await toggle.click();
        await expect(toggle.locator('.sniptale-popover-check')).toHaveCount(compact ? 1 : 0);
        const show = page.locator('[data-ui="content.toolbar.settings.show-hidden-buttons"]');
        if (await show.count()) {
          await show.focus();
          await show.click();
          expect(await show.evaluate((button) => button.matches(':focus-visible'))).toBe(false);
        }
        const free = page.getByRole('button', {
          name: /Free toolbar placement|Свободное размещение/u,
        });
        if (
          (await page
            .getByRole('button', { name: /Horizontal view|Горизонтальный вид/u })
            .count()) === 0
        )
          await free.click();
        for (const orientation of ['vertical', 'horizontal'] as const) {
          const choice = page.getByRole('button', {
            name:
              orientation === 'vertical'
                ? /Vertical view|Вертикальный вид/u
                : /Horizontal view|Горизонтальный вид/u,
          });
          await choice.click();
          await settings.click();
          await expect(choice.locator('.sniptale-popover-check')).toBeVisible();
          const other = page.getByRole('button', {
            name:
              orientation === 'vertical'
                ? /Horizontal view|Горизонтальный вид/u
                : /Vertical view|Вертикальный вид/u,
          });
          await expect(other.locator('.sniptale-popover-check')).toHaveCount(0);
        }
        await page.keyboard.press('Escape');
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await chrome.storage.sync.get('sniptale_settings'))['sniptale_settings']
                  .contentToolbar.compactMenus
            )
          )
          .toBe(compact);
        await selectCrop(page, { x: 200, y: 180, width: 400, height: 200 });
        const trigger = page.locator('.sniptale-selection-capture-menu-trigger');
        await trigger.click();
        const menu = page.locator('[data-ui="content.selection.capture-action-menu"]');
        await expect(menu.locator('.sniptale-capture-action-icons')).toHaveCount(compact ? 1 : 0);
        const actions = menu.locator('[data-ui^="content.selection.capture-action-option."]');
        await expect(actions).toHaveCount(6);
        if (!compact)
          for (const action of await actions.all())
            await expect(action.locator('.sniptale-toolbar-menu-item-label')).toBeVisible();
        const defaults = await popup.evaluate(async () => {
          const settings = (await chrome.storage.sync.get('sniptale_settings'))[
            'sniptale_settings'
          ];
          return { imageFormat: settings.imageFormat, imageQuality: settings.imageQuality };
        });
        const summary = menu.locator('[data-ui="content.selection.capture-parameters"]');
        await summary.click();
        await menu.locator('[data-ui="content.selection.capture-format.webp"]').click();
        await expect(
          menu.locator('[data-ui="content.selection.capture-format.webp"]')
        ).toHaveAttribute('aria-checked', 'true');
        await expect(
          menu.locator('[data-ui="content.selection.capture-format.webp"] .sniptale-popover-check')
        ).toBeVisible();
        await menu.locator('[data-ui="content.selection.capture-parameters.back"]').click();
        await expect(summary).toContainText('WEBP');
        await page.screenshot({
          path: info.outputPath(`crop-format-compact-${compact}.png`),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
        await trigger.click();
        await expect(summary).toContainText('WEBP');
        await page.keyboard.press('Escape');
        expect(
          await popup.evaluate(async () => {
            const settings = (await chrome.storage.sync.get('sniptale_settings'))[
              'sniptale_settings'
            ];
            return { imageFormat: settings.imageFormat, imageQuality: settings.imageQuality };
          })
        ).toEqual(defaults);
        await page.locator('.sniptale-selection-size-cancel-button').click();
      }
    } finally {
      await popup.close();
      await page.close();
    }
  });
}
