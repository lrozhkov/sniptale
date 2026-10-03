import { expect, test } from '../support/extension-fixture';
import { saveWebSnapshotThroughPopup } from '../security/support';

import { openDesignReview } from './extension-critical-page-toolbar.helpers';

test('Design Review measurements stay independent and stable through inspector interactions at HD', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
  const basic = page.locator('[data-ui="content.toolbar.design-review-measurements-button"]');
  const additional = page.locator(
    '[data-ui="content.toolbar.design-review-measurement-details-button"]'
  );
  const layer = page.locator('[data-ui="content.design-review.measurements"]');
  const popover = page.locator('[data-ui="content.design-review.popover"]');
  for (const [neighbors, layout] of [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ]) {
    for (const [control, value] of [
      [basic, neighbors],
      [additional, layout],
    ] as const) {
      if ((await control.getAttribute('aria-pressed')) !== String(value)) await control.click();
      await expect(control).toHaveAttribute('aria-pressed', String(value));
      await expect(control).toBeEnabled();
    }
    const target = (await page.locator('#measurement-target').boundingBox())!;
    await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
    await expect(popover).toBeVisible();
    if (neighbors || layout) {
      await expect(layer).toHaveCount(1);
      await expect(layer.locator('[data-scope="neighbor"]')).toHaveCount(neighbors ? 1 : 0);
      await expect(layer.locator('[data-scope="container"]')).toHaveCount(layout ? 4 : 0);
      await expect(layer.locator('[data-scope="viewport"]')).toHaveCount(layout ? 4 : 0);
      await layer.evaluate((node) => node.setAttribute('data-projection-proof', 'retained'));
    } else await expect(layer).toHaveCount(0);
    await popover
      .getByRole('button', { name: /Edit element properties|Изменить свойства элемента/u })
      .click();
    const navigation = popover.getByRole('navigation');
    for (const name of [
      /Borders and corners|Границы и скругление/u,
      /Fill and effects|Фон и эффекты/u,
    ]) {
      await navigation.getByRole('button', { name }).click();
      if (neighbors || layout)
        await expect(layer).toHaveAttribute('data-projection-proof', 'retained');
      else await expect(layer).toHaveCount(0);
      if (await popover.locator('[data-ui="content.design-review.settings-border"]').count()) {
        const borders = popover.locator('[data-ui="content.design-review.settings-border"]');
        await borders.getByRole('textbox').first().fill('3');
        const radius = neighbors ? '9' : '8';
        await borders
          .locator('[data-side-field-label="Radius"], [data-side-field-label="Скругление"]')
          .getByRole('textbox')
          .first()
          .fill(radius);
        await expect(page.locator('#measurement-target')).toHaveCSS(
          'border-top-left-radius',
          `${radius}px`
        );
      } else {
        await popover
          .locator('[data-ui="shared.ui.color-selector.picker-trigger"]')
          .first()
          .click();
        await page.getByRole('textbox', { name: 'HEX', exact: true }).fill('#123456');
        await page.getByRole('button', { name: /^(Apply|Применить)$/u }).click();
        await expect(page.locator('#measurement-target')).toHaveCSS(
          'background-color',
          'rgb(18, 52, 86)'
        );
        await popover.getByRole('button', { name: /^(Shadow|Тень)$/u }).click();
        await page.getByRole('option', { name: /^(Enabled|Включена)$/u }).click();
        await expect(page.locator('#measurement-target')).not.toHaveCSS('box-shadow', 'none');
      }
      if (neighbors || layout)
        await expect(layer).toHaveAttribute('data-projection-proof', 'retained');
      else await expect(layer).toHaveCount(0);
    }
    const comment = popover.getByRole('textbox', {
      name: /Element comment|Комментарий к элементу/u,
    });
    await comment.fill('Review this element');
    if (neighbors || layout)
      await expect(layer).toHaveAttribute('data-projection-proof', 'retained');
    else await expect(layer).toHaveCount(0);
    await expect(page.getByTestId('host-action-status')).toHaveText('Idle');
    await expect(popover).toBeVisible();
    await comment.press('Enter');
    await expect(popover).toHaveCount(0);
    await expect(layer).toHaveCount(0);
  }
  await popup.close();
  await page.close();
});

test('Design Review pointer choices do not inherit keyboard focus paint at HD', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
  const target = (await page.locator('#measurement-target').boundingBox())!;
  await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
  const popover = page.locator('[data-ui="content.design-review.popover"]');
  await popover
    .getByRole('button', { name: /Edit element properties|Изменить свойства элемента/u })
    .click();
  const comment = popover.getByRole('textbox', { name: /Element comment|Комментарий к элементу/u });
  await comment.fill('Focus proof');
  const center = popover.getByRole('button', { name: /^(Center|По центру)$/u });
  await center.click();
  await expect(center).toHaveAttribute('aria-pressed', 'true');
  await expect(center).toHaveCSS('outline-style', 'none');
  await expect(center).toHaveCSS('box-shadow', 'none');
  const settings = popover.locator('[data-ui="content.design-review.settings"]');
  await center.press('Tab');
  await expect(settings.locator('button:focus')).toHaveCSS('outline-width', '2px');
  await expect(settings.locator('button:focus')).toHaveCSS('outline-style', 'solid');
  await center.click();
  await expect(center).toHaveCSS('outline-style', 'none');
  await center.press('Enter');
  await expect(center).toHaveCSS('outline-width', '2px');
  for (const name of [
    /^(Weight|Насыщенность)$/u,
    /^(Style|Наклон)$/u,
    /^(Left|Слева)$/u,
    /^(Right|Справа)$/u,
  ]) {
    await comment.fill('Pointer interaction');
    const button = settings.getByRole('button', { name });
    await button.click();
    await expect(button).toHaveCSS('outline-style', 'none');
    await expect(button).toHaveCSS('box-shadow', 'none');
  }
  const font = settings.getByRole('button', { name: /^(Font|Шрифт)$/u });
  await font.click();
  await page.getByRole('option', { name: 'Inter', exact: true }).click();
  await expect(font).toHaveCSS('outline-style', 'none');
  await expect(font).toHaveCSS('box-shadow', 'none');
  await font.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(font).toHaveCSS('outline-width', '2px');
  const properties = popover.getByRole('button', {
    name: /Edit element properties|Изменить свойства элемента/u,
  });
  await properties.click();
  await expect(settings).toHaveCount(0);
  await expect(properties).toHaveAttribute('aria-expanded', 'false');
  await properties.click();
  await expect(settings).toBeVisible();
  await expect(settings.locator('[data-ui="content.design-review.close-settings"]')).toHaveCount(0);
  await center.click();
  await expect(center).toHaveCSS('outline-style', 'none');
  await settings
    .getByRole('navigation')
    .getByRole('button', { name: /Size and spacing|Размер и отступы/u })
    .click();
  const width = settings.getByRole('textbox', { name: /^(Width|Ширина)$/u });
  await expect(width).toHaveValue('100');
  const widthUnit = await width.getAttribute('aria-describedby');
  await expect(settings.locator(`[id="${widthUnit}"]`)).toHaveText('px');
  await width.fill('50%');
  await expect(width).toHaveValue('50');
  await expect(settings.locator(`[id="${widthUnit}"]`)).toHaveText('%');
  await expect
    .poll(() => page.locator('#measurement-target').evaluate((node) => node.style.width))
    .toBe('50%');
  await width.fill('calc(100% - 20px)');
  await expect(width).toHaveValue('calc(100% - 20px)');
  await expect(width).not.toHaveAttribute('aria-describedby');
  const padding = settings
    .locator('[data-side-field-label="Padding"], [data-side-field-label="Внутренние отступы"]')
    .getByRole('textbox')
    .first();
  await padding.fill('2em');
  await expect(padding).toHaveValue('2');
  const paddingUnit = await padding.getAttribute('aria-describedby');
  await expect(settings.locator(`[id="${paddingUnit}"]`)).toHaveText('em');
  await expect
    .poll(() => page.locator('#measurement-target').evaluate((node) => node.style.paddingTop))
    .toBe('2em');
  const placement = await padding.evaluate((node) => {
    const id = node.getAttribute('aria-describedby');
    const root = node.getRootNode();
    const unit =
      id && (root instanceof Document || root instanceof ShadowRoot)
        ? root.querySelector(`[id="${id}"]`)
        : null;
    const inputRect = node.getBoundingClientRect();
    const unitRect = unit?.getBoundingClientRect();
    return {
      padding: parseFloat(getComputedStyle(node).paddingRight),
      unitWidth: unitRect?.width ?? 0,
      inside: Boolean(
        unitRect && unitRect.right <= inputRect.right && unitRect.left >= inputRect.left
      ),
    };
  });
  expect(placement.inside).toBe(true);
  expect(placement.padding).toBeGreaterThan(placement.unitWidth);
  await popup.close();
  await page.close();
});

test('Reset All becomes available after a real Design Review change at HD', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
  const reset = page.locator('[data-ui="content.toolbar.reset-all-button"]');
  await expect(reset).toBeDisabled();
  const target = (await page.locator('#measurement-target').boundingBox())!;
  await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
  const popover = page.locator('[data-ui="content.design-review.popover"]');
  await popover
    .getByRole('button', { name: /Edit element properties|Изменить свойства элемента/u })
    .click();
  await popover
    .getByRole('navigation')
    .getByRole('button', {
      name: /Size and spacing|Размер и отступы/u,
    })
    .click();
  await popover.getByRole('textbox', { name: /^(Width|Ширина)$/u }).fill('50%');
  await expect
    .poll(() => page.locator('#measurement-target').evaluate((node) => node.style.width))
    .toBe('50%');
  await expect(reset).toBeEnabled();
  const confirmReset = async (message: RegExp) => {
    await reset.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(message);
    await dialog.getByRole('button', { name: /^(Reset all|Сбросить всё)$/u }).click();
    await expect(dialog).toHaveCount(0);
    await expect(reset).toBeDisabled();
  };
  await confirmReset(/Design Review/u);
  await expect
    .poll(() => page.locator('#measurement-target').evaluate((node) => node.style.width))
    .toBe('100px');
  const reopened = (await page.locator('#measurement-target').boundingBox())!;
  await page.mouse.click(reopened.x + reopened.width / 2, reopened.y + reopened.height / 2);
  await popover
    .getByRole('button', { name: /Edit element properties|Изменить свойства элемента/u })
    .click();
  await popover
    .getByRole('navigation')
    .getByRole('button', { name: /Size and spacing|Размер и отступы/u })
    .click();
  await popover.getByRole('textbox', { name: /^(Width|Ширина)$/u }).fill('50%');
  await expect(reset).toBeEnabled();
  const switchMode = async (mode: string) => {
    await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
    await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
  };
  const width = () => page.locator('#measurement-target').evaluate((node) => node.style.width);
  await switchMode('drawing');
  await expect(reset).toBeDisabled();
  await page.locator('[data-ui="content.toolbar.drawing.text"]').click();
  await page.mouse.click(600, 430);
  const textDraft = page.locator('[data-ui="content.drawing.text-input"]');
  await textDraft.fill('Temporary drawing');
  await expect(reset).toBeEnabled();
  await confirmReset(/Drawing/u);
  await expect(page.locator('[data-ui="content.drawing.text-object"]')).toHaveCount(0);
  await expect.poll(width).toBe('50%');
  await switchMode('highlighter');
  await expect(reset).toBeDisabled();
  const currentTarget = (await page.locator('#measurement-target').boundingBox())!;
  await page.mouse.click(
    currentTarget.x + currentTarget.width / 2,
    currentTarget.y + currentTarget.height / 2
  );
  await expect(page.locator('.sniptale-frame-container')).toHaveCount(1);
  await expect(reset).toBeEnabled();
  await confirmReset(/Annotation/u);
  await expect(page.locator('.sniptale-frame-container')).toHaveCount(0);
  await expect.poll(width).toBe('50%');
  await page.evaluate(() => {
    const text = document.createElement('div');
    text.id = 'reset-text';
    text.textContent = 'Original content';
    text.style.cssText = 'position:absolute;left:600px;top:350px;width:180px;height:40px';
    document.body.append(text);
  });
  await switchMode('quick-edit');
  await expect(reset).toBeDisabled();
  await page.mouse.click(640, 365);
  const content = page.locator('#reset-text');
  await expect(content).toHaveAttribute('contenteditable', 'true');
  await content.fill('Edited content');
  const modeSelector = page.locator('[data-ui="content.toolbar.mode-selector-button"]');
  await modeSelector.click();
  await modeSelector.click();
  await expect(reset).toBeEnabled();
  await confirmReset(/Content Editing/u);
  await expect(content).toHaveText('Original content');
  await expect.poll(width).toBe('50%');
  await switchMode('cursor');
  await expect(reset).toBeEnabled();
  await confirmReset(/current session|текущую сессию/u);
  await expect.poll(width).toBe('100px');
  await popup.close();
  await page.close();
});

test('content block editing switches on one click and preserves committed text', async ({
  context,
  extensionId,
  hostOrigin,
}, testInfo) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
  await page.evaluate(() => {
    for (const [index, label] of ['Alpha', 'Beta', 'Gamma'].entries()) {
      const block = document.createElement('p');
      block.id = `quick-edit-block-${index}`;
      block.textContent = label;
      block.style.cssText = `position:absolute;left:600px;top:${300 + index * 90}px;width:200px;height:40px`;
      document.body.append(block);
    }
  });
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.quick-edit"]').click();
  await expect(page.locator('#quick-edit-block-0')).toHaveCSS('cursor', 'default');
  for (let index = 0; index < 3; index += 1) {
    const block = page.locator(`#quick-edit-block-${index}`);
    const bounds = (await block.boundingBox())!;
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(block).toHaveAttribute('contenteditable', 'true');
    await expect(block).toHaveCSS('cursor', 'text');
    const activeFrame = page.locator('.sniptale-quick-edit-active-frame');
    await expect(activeFrame).toHaveCSS('border-top-width', '1px');
    await expect(activeFrame).toHaveCSS('box-shadow', 'none');
    await block.fill(`Edited ${index}`);
    await page.mouse.click(bounds.x + 25, bounds.y + 12);
    await expect(block).toHaveAttribute('contenteditable', 'true');
    if (index > 0) {
      const previous = page.locator(`#quick-edit-block-${index - 1}`);
      await expect(previous).not.toHaveAttribute('contenteditable', 'true');
      await expect(previous).toHaveText(`Edited ${index - 1}`);
    }
  }
  await page.screenshot({ path: testInfo.outputPath('content-editing-thin-frame.png') });
  await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
  await page.locator('[data-ui="content.toolbar.mode-option.cursor"]').click();
  for (let index = 0; index < 3; index += 1) {
    await expect(page.locator(`#quick-edit-block-${index}`)).toHaveText(`Edited ${index}`);
    await expect(page.locator(`#quick-edit-block-${index}`)).not.toHaveAttribute(
      'contenteditable',
      'true'
    );
  }
  await popup.close();
  await page.close();
});

test('web copy retains authored text drawings and frames after Library reopen', async ({
  context,
  extensionId,
  hostOrigin,
}, testInfo) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin);
  const switchMode = async (mode: string) => {
    await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
    await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
  };
  await page.evaluate(() => {
    document.body.style.minHeight = '1800px';
  });
  await switchMode('highlighter');
  const target = (await page.locator('#measurement-target').boundingBox())!;
  await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
  await expect(page.locator('.sniptale-frame-container')).toHaveCount(1);
  const frameTrigger = page.locator('.sniptale-frame-toolbar-trigger');
  await expect
    .poll(
      async () => {
        await page.mouse.move(target.x - 3, target.y + 10);
        return frameTrigger.isVisible();
      },
      { intervals: [150], timeout: 3000 }
    )
    .toBe(true);
  await frameTrigger.click();
  await page
    .getByRole('button', { name: /^(Add comment|Добавить комментарий)$/u })
    .first()
    .click();
  const comment = page.locator('.sniptale-callout [contenteditable="true"]').last();
  await comment.fill('Retained frame comment');
  await comment.press('Escape');
  await switchMode('drawing');
  await page.locator('[data-ui="content.toolbar.drawing.pencil"]').click();
  await page.mouse.move(580, 330);
  await page.mouse.down();
  await page.mouse.move(750, 410, { steps: 10 });
  await page.mouse.up();
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.mouse.move(590, 350);
  await page.mouse.down();
  await page.mouse.move(770, 430, { steps: 10 });
  await page.mouse.up();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('[data-ui="content.toolbar.drawing.text"]').click();
  await page.mouse.click(580, 450);
  await page.locator('[data-ui="content.drawing.text-input"]').fill('Retained drawing note');
  await switchMode('quick-edit');
  const heading = page.locator('h1').first();
  const headingBounds = (await heading.boundingBox())!;
  await page.mouse.click(headingBounds.x + 40, headingBounds.y + headingBounds.height / 2);
  await expect(heading).toHaveAttribute('contenteditable', 'true');
  await heading.fill('Retained edited heading');
  await switchMode('cursor');
  const drawingFont = await page
    .locator('[data-ui="content.drawing.text-object"] span')
    .last()
    .evaluate((node) => getComputedStyle(node).fontFamily);
  const tabId = await popup.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url === url)?.id;
  }, page.url());
  expect(typeof tabId).toBe('number');
  const saved = (await saveWebSnapshotThroughPopup({
    popup,
    tabId: tabId!,
    requestId: 'backlog6-annotations',
  })) as { success: boolean; assetId: string };
  expect(saved.success).toBe(true);
  const viewer = await context.newPage();
  await viewer.goto(
    `chrome-extension://${extensionId}/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=${saved.assetId}`
  );
  const snapshot = viewer.frameLocator('iframe').first();
  await expect(snapshot.locator('body')).toContainText('Retained edited heading');
  await expect(snapshot.locator('body')).toContainText('Retained drawing note');
  await expect(snapshot.locator('[data-ui="content.drawing.text-object"] span').last()).toHaveCSS(
    'font-family',
    drawingFont
  );
  await expect(snapshot.locator('.sniptale-frame-container')).toHaveCount(1);
  await expect(snapshot.locator('body')).toContainText('Retained frame comment');
  await expect(snapshot.locator('.sniptale-drawing-canvas')).toHaveAttribute(
    'data-sniptale-canvas-rasterized',
    'true'
  );
  await expect(snapshot.locator('.sniptale-drawing-canvas')).not.toHaveCSS(
    'background-image',
    'none'
  );
  const retainedDrawingHeight = await snapshot
    .locator('.sniptale-drawing-canvas')
    .evaluate((node) => node.getBoundingClientRect().height);
  expect(retainedDrawingHeight).toBeGreaterThan(900);
  await viewer.screenshot({ path: testInfo.outputPath('library-annotations.png') });
  const downloadPromise = viewer.waitForEvent('download');
  await viewer.getByRole('button', { name: /^(Download HTML|Скачать HTML)$/u }).click();
  const download = await downloadPromise;
  const htmlPath = testInfo.outputPath('annotations.html');
  await download.saveAs(htmlPath);
  const standalone = await context.newPage();
  await standalone.goto(`file://${htmlPath}`);
  await expect(standalone.locator('body')).toContainText('Retained edited heading');
  await expect(standalone.locator('body')).toContainText('Retained drawing note');
  await expect(standalone.locator('body')).toContainText('Retained frame comment');
  await expect(standalone.locator('.sniptale-frame-container')).toHaveCount(1);
  await expect(standalone.locator('.sniptale-drawing-canvas')).not.toHaveCSS(
    'background-image',
    'none'
  );
  await expect(
    standalone.locator(
      '[data-ui="shared.ui.content-toolbar"], .sniptale-resize-handle, script, [onclick]'
    )
  ).toHaveCount(0);
  const hasOffscreenInk = await standalone
    .locator('.sniptale-drawing-canvas')
    .evaluate(async (node) => {
      const background = getComputedStyle(node).backgroundImage;
      const image = new Image();
      image.src = background.slice(5, -2);
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const top = Math.floor(canvas.height / 2);
      const pixels = context.getImageData(0, top, canvas.width, canvas.height - top).data;
      return pixels.some((value, index) => index % 4 === 3 && value > 0);
    });
  expect(hasOffscreenInk).toBe(true);
  await standalone.screenshot({
    path: testInfo.outputPath('standalone-annotations.png'),
    fullPage: true,
  });
  await standalone.close();
  await expect(
    snapshot.locator('[data-ui="shared.ui.content-toolbar"], .sniptale-resize-handle')
  ).toHaveCount(0);
  await viewer.close();
  await popup.close();
  await page.close();
});
