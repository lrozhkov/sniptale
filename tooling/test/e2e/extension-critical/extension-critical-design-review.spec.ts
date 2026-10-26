import { expect, test } from '../support/extension-fixture';
import { saveWebSnapshotThroughPopup } from '../security/support';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import type { Page } from 'playwright';

import { openDesignReview } from './extension-critical-page-toolbar.helpers';

async function expectPrivateReport(page: Page) {
  const exposure = await page.evaluate(() => {
    const roots: (Document | ShadowRoot)[] = [document];
    const reports: HTMLIFrameElement[] = [];
    for (let index = 0; index < roots.length; index++) {
      for (const element of roots[index]!.querySelectorAll('*')) {
        if (element.shadowRoot) roots.push(element.shadowRoot);
        if (
          element instanceof HTMLIFrameElement &&
          element.dataset['ui'] === 'content.design-review.print-report'
        )
          reports.push(element);
      }
    }
    return reports.flatMap((frame) =>
      Array.from(frame.contentDocument?.images ?? [], (image) =>
        image.src.startsWith('data:image/png')
      )
    );
  });
  expect(exposure.length).toBe(0);
  expect(await page.evaluate(() => document.documentElement.dataset['reportPageHookCalls'])).toBe(
    '0'
  );
  const host = page.locator('[data-ui="content.design-review.print-host"]');
  await expect(host).toHaveCount(1);
  expect(
    await host.evaluate((node) => ({
      open: node.shadowRoot !== null,
      cloned: node.cloneNode(true).textContent,
      serializedImage: node.outerHTML.includes('data:image/png'),
    }))
  ).toEqual({ open: false, cloned: '', serializedImage: false });
  expect(
    await page.evaluate(() => {
      for (let index = 0; index < window.length; index++) {
        try {
          if (window[index]!.document.querySelector('article img[src^="data:image/png"]'))
            return true;
        } catch {
          /* Cross-origin source frames remain inaccessible. */
        }
      }
      return false;
    })
  ).toBe(false);
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Design Review exports human PDF cards and preserves Markdown at ${viewport.name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const preferences = await context.newPage();
    await preferences.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
    await preferences.evaluate(async (small) => {
      await chrome.storage.local.set({
        'sniptale-locale-preference': small ? 'ru' : 'en',
        'sniptale-theme-preference': small ? 'dark' : 'light',
      });
    }, viewport.name === '1280x560');
    await preferences.close();
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport.size);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: hostOrigin });
    await page.evaluate(() => {
      const target = document.getElementById('measurement-target')!;
      const neighbor = target.nextElementSibling as HTMLElement;
      neighbor.id = 'report-neighbor';
      neighbor.textContent = 'Secondary action';
      document.body.style.minHeight = '1800px';
    });
    await page.route('http://report-private.test/frame', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<style>html,body{margin:0;background:rgb(145,79,219)}</style>Private frame',
      })
    );
    await page.evaluate(() => {
      const neighbor = document.getElementById('report-neighbor')!;
      const frame = document.createElement('iframe');
      frame.id = 'report-cross-origin';
      frame.src = 'http://report-private.test/frame';
      frame.style.cssText = 'display:block;width:160px;height:50px;border:0';
      neighbor.append(frame);
    });
    await expect(page.frameLocator('#report-cross-origin').locator('body')).toContainText(
      'Private frame'
    );
    expect(
      await page
        .locator('#report-cross-origin')
        .evaluate((node) => node instanceof HTMLIFrameElement && node.contentDocument === null)
    ).toBe(true);
    const target = page.locator('#measurement-target');
    const popover = page.locator('[data-ui="content.design-review.popover"]');
    const panel = page.locator('[data-ui="content.design-review.tool-panel"]');
    const inspect = page.locator('[data-ui="content.toolbar.review-tool.inspect"]');
    const chooseTarget = async (selector: string) => {
      const box = (await page.locator(selector).boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };
    const notes = [
      'Improve button contrast and give this action more space.',
      'Align this secondary action with the adjacent button.',
    ];
    await page.locator('[data-ui="content.toolbar.review-tool.comment"]').click();
    for (const [index, selector] of ['#measurement-target', '#report-neighbor'].entries()) {
      await chooseTarget(selector);
      const comment = popover.getByRole('textbox', {
        name: /Element comment|Комментарий к элементу/u,
      });
      await comment.fill(notes[index]!);
      await comment.press('Enter');
      await expect(popover).toHaveCount(0);
    }
    await inspect.click();
    await chooseTarget('#measurement-target');
    await panel.locator('[data-ui="content.design-review.css-section"] > summary').click();
    await panel
      .getByRole('textbox', { name: /CSS declarations|Декларации CSS/u })
      .fill('color: rgb(20, 40, 60); width: 140px;');
    await panel.getByRole('button', { name: /^(Apply CSS|Применить CSS)$/u }).click();
    await expect(target).toHaveCSS('width', '140px');
    await expect(target).toHaveCSS('color', 'rgb(20, 40, 60)');
    await page.screenshot({ path: info.outputPath('review-report-source.png'), fullPage: false });
    const copyMarkdown = async () => {
      await page.locator('[data-ui="content.toolbar.annotation-export-button"]').click();
      await page.locator('[data-ui="content.toolbar.annotation-export.copy"]').click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toContain(notes[0]);
      return page.evaluate(() => navigator.clipboard.readText());
    };
    const markdown = await copyMarkdown();
    for (const note of notes) expect(markdown).toContain(note);
    expect(markdown).toContain('width');
    expect(markdown).toContain('140px');
    const source = await page.evaluate(() => ({
      x: scrollX,
      y: scrollY,
      title: document.title,
      url: location.href,
    }));
    await page.locator('[data-ui="content.toolbar.annotation-export-button"]').click();
    await page.evaluate(() => {
      document.documentElement.dataset['reportPageHookCalls'] = '0';
      const attachShadow = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (options) {
        const calls = Number(document.documentElement.dataset['reportPageHookCalls']);
        document.documentElement.dataset['reportPageHookCalls'] = String(calls + 1);
        return attachShadow.call(this, options);
      };
    });
    await page.locator('[data-ui="content.toolbar.annotation-export.pdf"]').click();
    await expect
      .poll(() => page.frames().filter((frame) => frame.url() === 'about:blank').length)
      .toBe(1);
    const report = page.frames().find((frame) => frame.url() === 'about:blank')!;
    await expect(report.locator('article')).toHaveCount(2);
    for (const note of notes) await expect(report.locator('body')).toContainText(note);
    await expect(report.locator('.source')).toHaveText(source.title);
    await expect(report.locator('.cover')).toContainText(source.url);
    await expect(report.locator('table')).toContainText('width');
    await expect(report.locator('table')).toContainText('140px');
    await expect(report.locator('img')).toHaveCount(2);
    await expectPrivateReport(page);
    await expect
      .poll(() =>
        report
          .locator('img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
            )
          )
      )
      .toBe(true);
    expect(
      await report
        .locator('img')
        .last()
        .evaluate((node) => {
          if (!(node instanceof HTMLImageElement)) return 0;
          const canvas = document.createElement('canvas');
          canvas.width = node.naturalWidth;
          canvas.height = node.naturalHeight;
          const context = canvas.getContext('2d')!;
          context.drawImage(node, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let privatePixels = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index] === 145 && pixels[index + 1] === 79 && pixels[index + 2] === 219)
              privatePixels++;
          }
          return privatePixels;
        })
    ).toBeGreaterThan(100);
    await expect(report.locator('pre')).toHaveCount(0);
    expect(await report.locator('style').textContent()).toContain('@page{size:A4');
    expect(
      await report
        .locator('article')
        .first()
        .evaluate((node) => getComputedStyle(node).breakInside)
    ).toBe('avoid');
    await expect
      .poll(() => page.evaluate(() => ({ x: scrollX, y: scrollY })))
      .toEqual({ x: source.x, y: source.y });
    await expect(inspect).toHaveAttribute('aria-pressed', 'true');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('measurement-target');
    await expect(target).toHaveCSS('width', '140px');
    const printable = await context.newPage();
    await printable.setViewportSize({ width: 900, height: 1100 });
    await printable.setContent(await report.locator('html').evaluate((node) => node.outerHTML));
    await expect(printable.locator('img').first()).toBeVisible();
    await expect(printable.locator('img').last()).toBeVisible();
    await printable.screenshot({
      path: info.outputPath('review-human-report.png'),
      fullPage: false,
    });
    const pdf = await printable.pdf({ path: info.outputPath('review.pdf'), format: 'A4' });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    await printable.close();
    await page.bringToFront();
    expect(await copyMarkdown()).toBe(markdown);
    await page.screenshot({
      path: info.outputPath('review-report-restored-source.png'),
      fullPage: false,
    });
    await popup.close();
    await page.close();
  });
}

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
  await expect(font).toBeFocused();
  await expect(font).toHaveCSS('outline-width', '1px');
  await expect(font).toHaveCSS('outline-style', 'solid');
  await expect(font).toHaveCSS('outline-offset', '2px');
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

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`Contextual reset labels ${theme} ${viewport.name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const setup = await context.newPage();
      await setup.setViewportSize(viewport.size);
      await setup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
      await setup.evaluate(async (theme) => {
        await chrome.storage.local.set({
          'sniptale-locale-preference': 'ru',
          'sniptale-theme-preference': theme,
        });
      }, theme);
      await setup.close();
      const { page, popup } = await openDesignReview(
        context,
        extensionId,
        hostOrigin,
        viewport.size
      );
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
      let confirmationIndex = 0;
      const confirmReset = async (label: string, message: RegExp) => {
        await expect(reset).toHaveAccessibleName(label);
        await expect(reset).toHaveAttribute('title', label);
        await reset.click();
        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toContainText(message);
        await expect(dialog.locator('strong')).toHaveText(label);
        await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
        await expect(reset).toBeEnabled();
        await reset.click();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: info.outputPath(`reset-${confirmationIndex++}.png`),
          fullPage: false,
          animations: 'disabled',
        });
        const bounds = (await dialog.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.size.width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.size.height);
        await dialog.getByRole('button', { name: label, exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(reset).toBeDisabled();
      };
      await confirmReset('Сбросить правки и замечания', /Отменить правки текста и свойств/u);
      await expect
        .poll(() => page.locator('#measurement-target').evaluate((node) => node.style.width))
        .toBe('100px');
      await expect(popover).toBeVisible();
      await expect(
        popover.getByRole('button', { name: /Edit element properties|Изменить свойства элемента/u })
      ).toHaveAttribute('aria-expanded', 'true');
      const restoredWidth = popover.getByRole('textbox', { name: /^(Width|Ширина)$/u });
      await expect(restoredWidth).toHaveValue('100');
      await restoredWidth.fill('50%');
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
      await confirmReset('Очистить рисунки', /Удалить все рисунки/u);
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
      await confirmReset('Очистить аннотации', /Удалить все рамки, эффекты и аннотации/u);
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
      await confirmReset('Восстановить содержимое', /Восстановить исходное содержимое/u);
      await expect(content).toHaveText('Original content');
      await expect.poll(width).toBe('50%');
      await switchMode('cursor');
      await expect(reset).toBeEnabled();
      await confirmReset('Сбросить всё', /текущую сессию/u);
      await expect.poll(width).toBe('100px');
      await popup.close();
      await page.close();
    });
  }
}

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
    await expect(block).toBeFocused();
    await expect(block).toHaveCSS('outline-style', 'none');
    await expect(block).toHaveCSS('box-shadow', 'none');
    await expect(block).toHaveCSS('cursor', 'text');
    const activeFrame = page.locator('.sniptale-quick-edit-active-frame');
    await expect(activeFrame).toHaveCSS('border-top-width', '1px');
    await expect(activeFrame).toHaveCSS('border-top-style', 'dashed');
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
  await page.screenshot({
    path: testInfo.outputPath('content-editing-thin-frame.png'),
    fullPage: false,
  });
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
    .getByRole('button', { name: /^(Comment settings|Настройки комментария)$/u })
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
  const retainedInk = snapshot.locator('canvas[data-sniptale-canvas-rasterized="true"]');
  await expect(retainedInk).toHaveCount(2);
  for (const canvas of await retainedInk.all())
    await expect(canvas).not.toHaveCSS('background-image', 'none');
  const retainedInkBounds = await retainedInk.evaluateAll((nodes) =>
    nodes.map((node) => {
      const bounds = node.getBoundingClientRect();
      return { top: bounds.top + scrollY, bottom: bounds.bottom + scrollY };
    })
  );
  expect(
    Math.max(...retainedInkBounds.map((bounds) => bounds.bottom)) -
      Math.min(...retainedInkBounds.map((bounds) => bounds.top))
  ).toBeGreaterThan(900);
  expect(retainedInkBounds.filter((bounds) => bounds.top > 900)).toHaveLength(1);
  await viewer.screenshot({
    path: testInfo.outputPath('library-annotations.png'),
    fullPage: false,
  });
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
  const standaloneInk = standalone.locator('canvas[data-sniptale-canvas-rasterized="true"]');
  await expect(standaloneInk).toHaveCount(2);
  for (const canvas of await standaloneInk.all())
    await expect(canvas).not.toHaveCSS('background-image', 'none');
  await expect(
    standalone.locator(
      '[data-ui="shared.ui.content-toolbar"], .sniptale-resize-handle, script, [onclick]'
    )
  ).toHaveCount(0);
  const hasOffscreenInk = await standaloneInk.evaluateAll(async (nodes) => {
    const node = nodes.find((canvas) => canvas.getBoundingClientRect().top + scrollY > 900);
    if (!node) return false;
    const background = getComputedStyle(node).backgroundImage;
    const image = new Image();
    image.src = background.slice(5, -2);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 0);
  });
  expect(hasOffscreenInk).toBe(true);
  await standalone.screenshot({
    path: testInfo.outputPath('standalone-annotations.png'),
    fullPage: false,
  });
  await standalone.close();
  await expect(
    snapshot.locator('[data-ui="shared.ui.content-toolbar"], .sniptale-resize-handle')
  ).toHaveCount(0);
  await viewer.close();
  await popup.close();
  await page.close();
});

for (const locale of ['en', 'ru'] as const)
  for (const theme of ['light', 'dark'] as const)
    for (const size of [
      { width: 1280, height: 560 },
      { width: 1920, height: 900 },
    ]) {
      test(`saved review prose uses Text ${locale} ${theme} ${size.width}`, async ({
        context,
        extensionId,
        hostOrigin,
      }, info) => {
        const setup = await context.newPage();
        await setup.setViewportSize(size);
        await setup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
        await setup.evaluate(
          async ({ locale, theme }) => {
            await chrome.storage.local.set({
              'sniptale-locale-preference': locale,
              'sniptale-theme-preference': theme,
            });
          },
          { locale, theme }
        );
        await setup.close();
        const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
        const target = (await page.locator('#measurement-target').boundingBox())!;
        await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
        const popover = page.locator('[data-ui="content.design-review.popover"]');
        const comment = popover.getByRole('textbox', {
          name: /Element comment|Комментарий к элементу/u,
        });
        await comment.fill('Author text: Комментарий 123');
        await comment.press('Enter');
        await expect(popover).toHaveCount(0);
        await page.locator('[data-ui="content.toolbar.design-review-panel-button"]').click();
        const summary = page.locator('[data-ui="content.design-review.feedback-summary"]').first();
        await expect(summary).toHaveText('Author text: Комментарий 123');
        await expect.soft(summary).toHaveCSS('font-family', /Sniptale Text/);
        await page.locator('[data-ui="content.design-review.feedback-item"]').first().hover();
        const preview = page.locator('[data-ui="content.design-review.feedback-preview"]');
        await expect(preview).toBeVisible();
        await expect
          .soft(preview.locator('.sniptale-design-review-authored-text'))
          .toHaveCSS('font-family', /Sniptale Text/);
        await expect(
          preview.getByText('Author text: Комментарий 123', { exact: true })
        ).toBeVisible();
        await expect(
          page.locator('[data-ui="content.design-review.feedback-panel"] header strong')
        ).toHaveCSS('font-family', /Sniptale Interface/);
        await page.screenshot({
          path: info.outputPath('saved-feedback-fonts.png'),
          fullPage: false,
        });
        await popup.close();
        await page.close();
      });
    }
