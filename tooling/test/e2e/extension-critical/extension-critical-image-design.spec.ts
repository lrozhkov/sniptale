import type { Locator, Page, TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { test, expect } from '../support/extension-fixture';

type Locale = 'ru' | 'en';
type Theme = 'light' | 'dark';
const ui = (page: Page, name: string) => page.locator(`[data-ui="${name}"]`);

test.use({ actionTimeout: 10_000 });

async function openImage(page: Page, extensionId: string, locale: Locale, theme: Theme) {
  const base = `chrome-extension://${extensionId}/apps/extension/src`;
  await page.goto(`${base}/gallery/index.html`);
  await expect(ui(page, 'gallery.page.root')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ]
      )
    )
    .toMatch(/^(ru|en)$/);
  await page.evaluate(
    async ({ locale, theme }) => {
      localStorage.setItem('sniptale-locale-preference', locale);
      await chrome.storage.local.set({
        'sniptale-locale-preference': locale,
        'sniptale-theme-preference': theme,
      });
    },
    { locale, theme }
  );
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#35609c';
    context.fillRect(0, 0, 960, 540);
    context.fillStyle = '#f4c96e';
    context.fillRect(90, 80, 780, 70);
    context.fillStyle = '#d9e6f3';
    context.fillRect(90, 190, 360, 270);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.goto(`${base}/editor/index.html`);
  await expect(ui(page, 'editor.start')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'Image design proof.png',
      mimeType: 'image/png',
      buffer: Buffer.from(bytes, 'base64'),
    });
  await expect(ui(page, 'editor.start')).toHaveCount(0);
  await expect(ui(page, 'editor.floating.document-bar.title')).toBeVisible();
  await expect(ui(page, 'editor.floating.layers.mode.layers')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return bytes;
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  const switches = await page.locator('.sniptale-glass-switch:visible').evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      const thumb = node.querySelector('.sniptale-glass-switch-thumb');
      if (!thumb) return [];
      const target = node.getBoundingClientRect(),
        dot = thumb.getBoundingClientRect();
      return [
        {
          label: node.getAttribute('aria-label'),
          delta: Math.abs(target.y + target.height / 2 - dot.y - dot.height / 2),
        },
      ];
    })
  );
  for (const item of switches)
    expect(item.delta, `${name}: ${item.label} thumb center`).toBeLessThanOrEqual(0.5);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: false,
    animations: 'disabled',
  });
}

async function inViewport(target: Locator) {
  await expect(target).toBeVisible();
  await expect(target).toBeInViewport({ ratio: 1 });
}

async function chooseMode(page: Page, mode: string) {
  const target = ui(page, `editor.floating.layers.mode.${mode}`);
  await target.click();
  await expect(target).toHaveAttribute('aria-pressed', 'true');
}

async function chooseProperty(page: Page, scope: Locator, name: string) {
  const dropdown = scope.locator('button[aria-haspopup="listbox"]');
  if (await dropdown.count()) {
    await dropdown.click();
    const option = page.getByRole('option', { name, exact: true });
    await expect(option).toBeVisible();
    await option.click();
    await expect(dropdown).toHaveAttribute('aria-expanded', 'false');
    await expect(dropdown).toContainText(name);
    return;
  }
  const option = scope.getByRole('button', { name, exact: true });
  await option.click();
  await expect(option).toHaveAttribute('aria-pressed', 'true');
}

async function inspectScene(page: Page, locale: Locale, bytes: string, info: TestInfo) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  await chooseMode(page, 'frame');
  const panel = ui(page, 'editor.frame-panel');
  const kinds = ui(page, 'editor.frame.background-mode');
  const choose = async (key: Parameters<typeof translate>[0]) => {
    await chooseProperty(page, kinds, label(key));
  };
  await choose('editor.scene.backgroundNone');
  await expect(panel.locator('[data-ui="shared.ui.paint-selector.trigger"]')).toHaveCount(0);
  await choose('editor.compact.frameBackgroundModeColor');
  await expect(panel.locator('[data-ui="shared.ui.paint-selector.trigger"]').first()).toBeVisible();
  const numericShell = panel
    .locator('[data-ui="shared.ui.compact-inspector.numeric-value-field"]')
    .first();
  await expect(numericShell).toHaveCSS('border-radius', '4px');
  await screenshot(page, info, 'scene-color');
  await panel.locator('[data-ui="shared.ui.paint-selector.trigger"]').first().click();
  const paint = ui(page, 'shared.ui.paint-selector.popup');
  await paint
    .getByRole('button', { name: label('highlighter.paintPicker.linear'), exact: true })
    .click();
  await paint
    .getByRole('button', { name: label('shared.ui.colorSelectorApply'), exact: true })
    .click();
  await expect(ui(page, 'editor.frame.gradient-presets')).toBeVisible();
  await screenshot(page, info, 'scene-gradient');
  await choose('editor.compact.frameBackgroundModeImage');
  const picker = ui(page, 'background.image.picker');
  await expect(picker).toBeVisible();
  await picker.locator('input[type="file"]').setInputFiles({
    name: 'Background proof.png',
    mimeType: 'image/png',
    buffer: Buffer.from(bytes, 'base64'),
  });
  const clear = panel.getByRole('button', { name: label('editor.scene.clearImage'), exact: true });
  await expect(clear).toBeEnabled();
  await clear.scrollIntoViewIfNeeded();
  await screenshot(page, info, 'scene-image');
  await clear.click();
  await expect(clear).toHaveCount(0);
  await choose('editor.scene.backgroundNone');
}

async function inspectBrowserAndSizes(page: Page, locale: Locale, info: TestInfo) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  await chooseMode(page, 'browser-frame');
  const header = ui(page, 'window-header-settings');
  await chooseProperty(
    page,
    header.locator('.sniptale-property-choice').first(),
    label('windowHeader.browser')
  );
  const title = header.getByRole('textbox', { name: label('windowHeader.tabTitle'), exact: true });
  const value =
    locale === 'ru'
      ? 'Подробное название вкладки для проверки ширины'
      : 'A detailed browser tab title for available width';
  await title.fill(value);
  await title.press('Enter');
  await expect(title).toHaveValue(value);
  await title.scrollIntoViewIfNeeded();
  await screenshot(page, info, 'browser-header');
  await chooseMode(page, 'meta');
  const font = ui(page, 'editor.technical-data.font-serif');
  await font.click();
  await expect(font).toHaveAttribute('aria-pressed', 'true');
  await expect(font).toHaveAttribute('data-command-property', 'true');
  const primaryColor = await font.evaluate((node) => {
    const sample = document.createElement('span');
    sample.style.color = 'var(--sniptale-color-text-primary)';
    node.append(sample);
    const color = getComputedStyle(sample).color;
    sample.remove();
    return color;
  });
  await expect(font).toHaveCSS('color', primaryColor);
  await screenshot(page, info, 'metadata');
  for (const mode of ['image-size', 'canvas-size']) {
    await chooseMode(page, mode);
    const dimensions = page.locator('[data-size-panel-dimensions]').first();
    await expect(dimensions).toBeVisible();
    const width = dimensions.getByRole('textbox', {
      name: label('editor.compact.widthDimension'),
      exact: true,
    });
    await width.click();
    await expect(width).toBeFocused();
    await width.press('Escape');
    await screenshot(page, info, mode);
  }
}

async function inspectLayers(page: Page, locale: Locale, info: TestInfo) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  await chooseMode(page, 'layers');
  const unlock = page.getByRole('button', {
    name: label('editor.toolbar.unlockLayer'),
    exact: true,
  });
  if (await unlock.count()) await unlock.first().click();
  const sourceName = 'Image design proof.png';
  const source = ui(page, 'editor.layers.panel-frame').getByRole('button', {
    name: sourceName,
    exact: true,
  });
  await source.hover();
  const actions = ui(page, 'editor.layers.expanded-actions').filter({ visible: true });
  await expect(actions).toBeVisible();
  for (const button of await actions.getByRole('button').all()) {
    await expect(button).toHaveCSS('width', '26px');
    await expect(button).toHaveCSS('height', '26px');
  }
  // Keep at least two ordinary glyphs visible beside the admitted hover actions.
  expect(await source.evaluate((node) => node.clientWidth)).toBeGreaterThanOrEqual(32);
  await actions
    .getByRole('button', {
      name: label('editor.toolbar.renameLayer'),
      exact: true,
    })
    .click();
  const input = page.getByRole('textbox', { name: sourceName, exact: true });
  await expect(input).toBeFocused();
  const name =
    locale === 'ru'
      ? 'Исходное изображение — длинное имя слоя'
      : 'Source image — a long layer name';
  await input.fill(name);
  await input.press('Enter');
  const layer = page.getByRole('button', { name, exact: true });
  await expect(layer).toBeVisible();
  await expect(layer).toHaveAttribute('title', name);
  await layer.hover();
  await ui(page, 'editor.layers.effects-transformations').first().click();
  const effects = ui(page, 'editor.floating.layer-effects-panel');
  await expect(effects).toBeVisible();
  const status = effects.locator('[data-ui="shared.ui.compact-inspector.status-row"]');
  await expect(status).toBeVisible();
  const geometry = await status.evaluate((row) => {
    const parent = row.closest('.sniptale-inspector-surface');
    if (!parent) throw new Error('Layer status has no inspector surface');
    return { row: row.getBoundingClientRect().width, parent: parent.clientWidth };
  });
  // One CSS pixel permits fractional layout rounding, not overflow into the scrollbar.
  expect(geometry.row).toBeLessThanOrEqual(geometry.parent + 1);
  const parameterName = status.locator('.sniptale-parameter-name');
  await expect(parameterName).toHaveCSS('font-size', '13px');
  await expect(parameterName).toHaveCSS('line-height', '18px');
  await expect(parameterName).toHaveCSS('font-weight', '400');
  const firstLines = await status.evaluate((row) => {
    const name = row.querySelector('.sniptale-parameter-name');
    const value = row.querySelector('.sniptale-parameter-value > span');
    if (!name || !value) throw new Error('Layer status is missing its name or value');
    const firstLineTop = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects()[0]?.top ?? element.getBoundingClientRect().top;
    };
    return Math.abs(firstLineTop(name) - firstLineTop(value));
  });
  expect.soft(firstLines).toBeLessThanOrEqual(1);
  await screenshot(page, info, 'layer-effects');
  await ui(page, 'editor.floating.layer-effects-panel.back').click();
  await expect(ui(page, 'editor.floating.layer-effects-panel')).toHaveCount(0);
}

async function inspectDocumentFields(page: Page, locale: Locale, info: TestInfo) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const toolbar = ui(page, 'editor.floating.document-bar.surface');
  const resting = (await toolbar.boundingBox())!;
  const titleTrigger = ui(page, 'editor.floating.document-bar.title');
  await titleTrigger.click();
  const title = page.getByRole('textbox', { name: label('editor.page.renameImage'), exact: true });
  const draft = await title.inputValue();
  const editing = (await toolbar.boundingBox())!;
  const fieldGeometry = await title.evaluate((node) => {
    const css = getComputedStyle(node);
    const parent = node.parentElement!;
    return {
      input: node.getBoundingClientRect().toJSON(),
      parent: parent.getBoundingClientRect().toJSON(),
      display: css.display,
      padding: css.padding,
      minHeight: css.minHeight,
      lineHeight: css.lineHeight,
      border: css.borderWidth,
      fontSize: css.fontSize,
    };
  });
  expect
    .soft(
      Math.abs(editing.height - resting.height),
      JSON.stringify({ resting, editing, fieldGeometry })
    )
    .toBeLessThanOrEqual(1);
  await expect
    .soft(
      page.getByRole('button', {
        name: label('shared.ui.clearField').replace('{field}', label('editor.page.renameImage')),
        exact: true,
      })
    )
    .toHaveCount(0);
  await screenshot(page, info, 'rename-document');
  await title.fill('');
  await expect(title).toBeFocused();
  await title.press('Escape');
  await expect(titleTrigger).toHaveAttribute('title', draft);
  const autosave = page.locator('[data-ui="autosave-control"] button').first();
  await autosave.click();
  const toggle = page.getByRole('switch', {
    name: label('editor.documentActions.autosaveSwitch'),
    exact: true,
  });
  const drawing = toggle.locator('xpath=following-sibling::span');
  await expect.poll(async () => (await drawing.boundingBox())!.width).toBe(40);
  const shape = await drawing.evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    height: node.getBoundingClientRect().height,
    border: getComputedStyle(node).borderTopWidth,
    rail: getComputedStyle(node, '::before').height,
    thumb: getComputedStyle(node, '::after').width,
  }));
  expect.soft(shape).toEqual({ width: 40, height: 28, border: '0px', rail: '2px', thumb: '16px' });
  const enabled = await toggle.isChecked();
  await toggle.press('Space');
  await expect(toggle).toBeChecked({ checked: !enabled });
  await screenshot(page, info, 'autosave-compact-switch');
  await toggle.press('Space');
  await expect(toggle).toBeChecked({ checked: enabled });
  await toggle.press('Escape');
  await expect(toggle).toHaveCount(0);
  await expect(autosave).toBeFocused();
}

async function inspectCommands(page: Page, locale: Locale, info: TestInfo) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const titleTrigger = ui(page, 'editor.floating.document-bar.title');
  await inspectDocumentFields(page, locale, info);
  await page.keyboard.press('Control+k');
  const palette = ui(page, 'editor.command-palette');
  await expect(palette).toBeVisible();
  await expect(palette.getByRole('option').first()).toBeInViewport();
  await screenshot(page, info, 'command-palette');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  await ui(page, 'editor.floating.tool-rail.pencil').click();
  const width = page.locator('[data-ui^="content.toolbar.drawing-options.pencil.width-"]').last();
  await width.click();
  await expect(width).toHaveAttribute('aria-pressed', 'true');
  await expect(width).toHaveAttribute('data-command-property', 'true');
  await expect(width).not.toHaveClass(/sniptale-glass-toolbar-button--active/);
  await screenshot(page, info, 'pencil-properties');
  await ui(page, 'editor.floating.tool-rail.select').click();
  await ui(page, 'editor.floating.document-bar.close-file-button').click();
  const confirm = ui(page, 'editor.floating.document-bar.close-confirm');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: label('common.actions.cancel'), exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(titleTrigger).toBeVisible();
  const previousIds = await page.evaluate(async () =>
    (await chrome.downloads.search({})).map((download) => download.id)
  );
  await ui(page, 'editor.floating.document-bar.save-button').click();
  await expect
    .poll(
      async () => {
        const downloads = await page.evaluate(() => chrome.downloads.search({}));
        return downloads.find((download) => !previousIds.includes(download.id))?.state;
      },
      { timeout: 30_000 }
    )
    .toBe('complete');
  const downloads = await page.evaluate(() => chrome.downloads.search({}));
  const download = downloads.find((candidate) => !previousIds.includes(candidate.id));
  expect(download).toBeDefined();
  expect(download?.mime).toBe('image/png');
  expect(download?.fileSize).toBeGreaterThan(0);
  if (!download) throw new Error('Expected the completed native PNG export');
  const bytes = await readFile(download.filename);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
}

for (const locale of ['ru', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
      test(`image complete composition ${locale} ${theme} ${viewport.name}`, async ({
        page,
        extensionId,
      }, info) => {
        test.setTimeout(120_000);
        await page.setViewportSize(viewport.size);
        const bytes = await openImage(page, extensionId, locale, theme);
        for (const name of [
          'editor.floating.document-bar',
          'editor.floating.tool-rail',
          'editor.floating.view-controls.stack',
          'editor.layers.panel-frame',
        ]) {
          await inViewport(ui(page, name));
        }
        await expect(ui(page, 'editor.floating.document-bar.title')).toHaveCSS('font-size', '13px');
        await screenshot(page, info, 'workspace');
        await inspectLayers(page, locale, info);
        await inspectScene(page, locale, bytes, info);
        await inspectBrowserAndSizes(page, locale, info);
        await inspectCommands(page, locale, info);
      });
    }
  }
}

test('image floating chrome preserves breakpoint reachability and desktop overflow', async ({
  page,
  extensionId,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 900 });
  await openImage(page, extensionId, 'en', 'light');
  for (const width of [1439, 1440, 1441, 1499, 1500, 1501, 1799, 1800, 1801]) {
    await page.setViewportSize({ width, height: 560 });
    for (const name of [
      'editor.floating.tool-rail',
      'editor.floating.document-bar',
      'editor.floating.view-controls.stack',
    ]) {
      await inViewport(ui(page, name));
    }
    await screenshot(page, info, `breakpoint-${width}`);
  }
  await page.setViewportSize({ width: 1100, height: 560 });
  const overflow = await page.locator('.sniptale-image-page').evaluate((owner) => {
    owner.scrollLeft = owner.scrollWidth;
    return { width: owner.scrollWidth, viewport: window.innerWidth, left: owner.scrollLeft };
  });
  expect(overflow.width).toBeGreaterThan(overflow.viewport);
  expect(overflow.left).toBeGreaterThan(0);
  await inViewport(ui(page, 'editor.floating.view-controls.stack'));
  await screenshot(page, info, 'below-desktop-minimum');
});

for (const theme of ['light', 'dark'] as const) {
  test(`image paint portal preserves scoped typography and cancellation in ${theme}`, async ({
    page,
    extensionId,
  }, info) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await openImage(page, extensionId, 'en', theme);
    await chooseMode(page, 'frame');
    await chooseProperty(
      page,
      ui(page, 'editor.frame.background-mode'),
      translate('editor.compact.frameBackgroundModeColor', 'en')
    );
    const trigger = ui(page, 'editor.frame-panel')
      .locator('[data-ui="shared.ui.paint-selector.trigger"]')
      .first();
    const accepted = await trigger.getAttribute('title');
    await trigger.click();
    const layer = ui(page, 'shared.ui.paint-selector.layer');
    const popup = ui(page, 'shared.ui.paint-selector.popup');
    await inViewport(popup);
    await expect(layer).toHaveClass(/sniptale-compact-workspace/);
    const font = await layer.evaluate((node) => getComputedStyle(node).fontFamily);
    expect(font).toContain('Sniptale Interface');
    expect(
      await layer.evaluate((node) =>
        document.querySelector('[data-ui="editor.page.root"]')?.contains(node)
      )
    ).toBe(false);
    const hex = popup.getByRole('textbox', {
      name: translate('shared.ui.colorSelectorHex', 'en'),
      exact: true,
    });
    const previous = await hex.inputValue();
    const replacement = previous.toLowerCase().includes('123456') ? '#654321' : '#123456';
    await hex.fill(replacement);
    await expect
      .poll(async () =>
        [replacement, `${replacement}ff`].includes((await hex.inputValue()).toLowerCase())
      )
      .toBe(true);
    await expect(trigger).not.toHaveAttribute('title', accepted ?? '');
    await screenshot(page, info, `paint-portal-${theme}`);
    await popup
      .getByRole('button', {
        name: translate('shared.ui.colorSelectorCancel', 'en'),
        exact: true,
      })
      .click();
    await expect(popup).toHaveCount(0);
    await expect(trigger).toHaveAttribute('title', accepted ?? '');
    await expect(trigger).toBeFocused();
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`image document fields ${theme} ${viewport.name}`, async ({ page, extensionId }, info) => {
      await page.setViewportSize(viewport.size);
      await openImage(page, extensionId, 'ru', theme);
      await inspectDocumentFields(page, 'ru', info);
    });

    test(`image navigation chrome ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await openImage(page, extensionId, 'ru', theme);
      const magnet = ui(page, 'editor.floating.view-controls.magnet');
      await magnet.click();
      await expect(magnet).toHaveAttribute('aria-pressed', 'true');
      for (const name of ['magnet', 'show-outside-canvas', 'zoom', 'zoom-in', 'zoom-out']) {
        const command = ui(page, `editor.floating.view-controls.${name}`);
        await command.hover();
        await expect(command).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
        await expect(command).toHaveCSS('box-shadow', 'none');
      }
      await ui(page, 'editor.floating.view-controls.map').click();
      await expect(ui(page, 'editor.viewport-preview.surface')).toHaveCSS('border-radius', '0px');
      await expect(ui(page, 'editor.viewport-preview.frame')).toHaveCSS('border-radius', '0px');
      await screenshot(page, info, 'image-navigation-chrome');
    });

    test(`workspace background row ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await openImage(page, extensionId, 'ru', theme);
      await ui(page, 'editor.floating.view-controls.workspace').click();
      const row = ui(page, 'editor.workspace.background-default-row');
      const saveDefault = row.getByRole('button', {
        name: translate('editor.compact.workspaceMakeDefault', 'ru'),
        exact: true,
      });
      await expect(saveDefault).toHaveText('');
      const field = ui(page, 'shared.ui.compact-inspector.color-field');
      await expect(field).toHaveCSS('border-width', '0px');
      const value = row.locator('[data-ui="shared.ui.color-selector.value-trigger"]');
      const swatch = row.locator('[data-ui="shared.ui.color-selector.picker-trigger"]');
      const boxes = await Promise.all(
        [field, value, swatch, saveDefault].map((node) => node.boundingBox())
      );
      const center = (box: NonNullable<(typeof boxes)[number]>) => box.y + box.height / 2;
      for (const box of boxes)
        expect(Math.abs(center(box!) - center(boxes[0]!))).toBeLessThanOrEqual(1);
      expect(boxes[1]!.x + boxes[1]!.width).toBeLessThanOrEqual(boxes[2]!.x + 1);
      expect(boxes[2]!.x + boxes[2]!.width).toBeLessThanOrEqual(boxes[3]!.x + 1);
      await screenshot(page, info, 'workspace-background-row');
    });

    test(`drawing current-color samples ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await openImage(page, extensionId, 'ru', theme);
      for (const tool of ['pencil', 'marker', 'text', 'shape', 'arrow']) {
        await ui(page, `editor.floating.tool-rail.${tool}`).click();
        const samples = page.locator(
          '[data-ui="shared.ui.color-selector.picker-trigger"]:visible > span'
        );
        await expect(samples.first()).toBeVisible();
        for (const sample of await samples.all()) {
          const geometry = await sample.evaluate((node) => {
            const box = node.getBoundingClientRect();
            return {
              width: box.width,
              height: box.height,
              parent: node.parentElement!.getBoundingClientRect().toJSON(),
            };
          });
          expect
            .soft(
              Math.abs(geometry.width - geometry.height),
              `${tool}: ${JSON.stringify(geometry)}`
            )
            .toBeLessThanOrEqual(1);
        }
        await screenshot(page, info, `color-sample-${tool}`);
      }
    });

    test(`image layer miniature commands ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await openImage(page, extensionId, 'ru', theme);
      const list = ui(page, 'editor.layers.list-viewport');
      const insets = await list.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const row = node.querySelector(':scope > div > div')!.getBoundingClientRect();
        return {
          left: row.left - box.left,
          right: box.right - row.right,
          scrollbar: node.offsetWidth - node.clientWidth,
          css: getComputedStyle(node).scrollbarWidth,
        };
      });
      expect
        .soft(Math.abs(insets.left - insets.right), JSON.stringify(insets))
        .toBeLessThanOrEqual(1);
      await page
        .getByRole('button', { name: translate('editor.toolbar.unlockLayer', 'ru'), exact: true })
        .first()
        .click();
      const layer = list.getByRole('button', { name: 'Image design proof.png', exact: true });
      await layer.hover();
      const actions = ui(page, 'editor.layers.expanded-actions').filter({ visible: true });
      for (const command of await actions.getByRole('button').all()) {
        if (await command.isEnabled()) {
          await command.hover();
          await expect.soft(command).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
          await expect.soft(command).toHaveCSS('box-shadow', 'none');
        }
      }
      const navigate = ui(page, 'editor.layers.auto-navigate');
      await navigate.hover();
      await expect.soft(navigate).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
      await layer.hover();
      await screenshot(page, info, 'layer-miniature-commands');
      const rowWidth = await list
        .locator(':scope > div')
        .first()
        .evaluate((node) => node.clientWidth);
      await inspectLayers(page, 'ru', info);
      for (let index = 0; index < 8; index += 1) {
        await list.locator(':scope > div').last().hover();
        await list
          .locator(':scope > div')
          .last()
          .getByRole('button', {
            name: translate('editor.toolbar.duplicateLayer', 'ru'),
            exact: true,
          })
          .click();
      }
      const scrolling = await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
        return { top: node.scrollTop, height: node.clientHeight, total: node.scrollHeight };
      });
      expect(scrolling.total).toBeGreaterThan(scrolling.height);
      expect(scrolling.top).toBeGreaterThan(0);
      expect(
        Math.abs(
          (await list
            .locator(':scope > div')
            .first()
            .evaluate((node) => node.clientWidth)) - rowWidth
        )
      ).toBeLessThanOrEqual(1);
      await expect(list.locator(':scope > div').last()).toBeInViewport();
      await screenshot(page, info, 'layer-list-scrolled');
    });

    test(`unified scene background paint ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await openImage(page, extensionId, 'ru', theme);
      await chooseMode(page, 'frame');
      const panel = ui(page, 'editor.frame-panel');
      const kinds = ui(page, 'editor.frame.background-mode');
      await chooseProperty(page, kinds, translate('editor.compact.frameBackgroundModeColor', 'ru'));
      await screenshot(page, info, 'scene-paint-composition');
      await expect(kinds.getByRole('button')).toHaveCount(3);
      const trigger = panel.locator('[data-ui="shared.ui.paint-selector.trigger"]').first();
      const popup = ui(page, 'shared.ui.paint-selector.popup');
      const colors = ui(page, 'editor.frame.quick-colors');
      const gradients = ui(page, 'editor.frame.gradient-presets');
      await expect(colors).toBeVisible();
      await expect(gradients).toBeVisible();
      await gradients.getByRole('button').first().click();
      await expect(gradients.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
      await expect(colors.locator('[aria-pressed="true"]')).toHaveCount(0);
      await colors.getByRole('button').first().click();
      await expect(colors.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
      await expect(gradients.locator('[aria-pressed="true"]')).toHaveCount(0);
      await expect(trigger).toBeInViewport();
      await expect(colors).toBeInViewport();
      await expect(gradients).toBeInViewport();
      await expect(colors.getByRole('button')).toHaveCount(5);
      await expect(gradients.getByRole('button')).toHaveCount(5);
      await screenshot(page, info, 'scene-immediate-palette');
      for (const accept of [false, true]) {
        await trigger.click();
        await popup
          .getByRole('button', {
            name: translate('highlighter.paintPicker.linear', 'ru'),
            exact: true,
          })
          .click();
        await popup
          .getByRole('button', {
            name: translate(
              accept ? 'shared.ui.colorSelectorApply' : 'shared.ui.colorSelectorCancel',
              'ru'
            ),
            exact: true,
          })
          .click();
        await expect(trigger).toHaveAttribute('title', accept ? /Линейный/ : /^#/);
      }
      await chooseProperty(page, kinds, translate('editor.compact.frameBackgroundModeImage', 'ru'));
      await expect(ui(page, 'background.image.picker')).toBeVisible();
      await chooseProperty(page, kinds, translate('editor.compact.frameBackgroundModeColor', 'ru'));
      await expect(ui(page, 'editor.frame.gradient-presets')).toBeVisible();
      await screenshot(page, info, 'scene-paint-gradient-restored');
      await chooseProperty(page, kinds, translate('editor.scene.backgroundNone', 'ru'));
      await expect(trigger).toHaveCount(0);
    });

    test(`scene padding parameter rhythm ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await openImage(page, extensionId, 'ru', theme);
      await chooseMode(page, 'frame');
      const panel = ui(page, 'editor.frame-panel');
      await chooseProperty(
        page,
        ui(page, 'editor.frame.background-mode'),
        translate('editor.compact.frameBackgroundModeColor', 'ru')
      );
      const names = [
        'editor.scene.placementSection',
        'highlighter.editor.paddingLabel',
        'editor.compact.cornerRadius',
      ] as const;
      const geometry = await Promise.all(
        names.map((name) =>
          panel.getByText(translate(name, 'ru'), { exact: true }).evaluate((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            const box = range.getClientRects()[0]!;
            const css = getComputedStyle(node);
            return {
              x: box.x,
              y: box.y,
              fontSize: css.fontSize,
              fontWeight: css.fontWeight,
              lineHeight: css.lineHeight,
            };
          })
        )
      );
      for (const item of geometry) {
        expect.soft(item.fontSize, JSON.stringify(geometry)).toBe('13px');
        expect.soft(item.fontWeight).toBe('400');
        expect.soft(item.lineHeight).toBe('18px');
        expect.soft(Math.abs(item.x - geometry[0]!.x)).toBeLessThanOrEqual(1);
      }
      expect
        .soft(
          Math.abs(geometry[1]!.y - geometry[0]!.y - (geometry[2]!.y - geometry[1]!.y)),
          JSON.stringify(geometry)
        )
        .toBeLessThanOrEqual(1);
      const padding = ui(page, 'editor.frame.padding-fields');
      await padding
        .getByText(translate('highlighter.editor.paddingLabel', 'ru'), { exact: true })
        .hover();
      const range = padding.getByRole('slider');
      await expect(range).toBeVisible();
      await screenshot(page, info, 'scene-padding-rhythm');
    });
  }
}
