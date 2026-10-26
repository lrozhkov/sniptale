import { checkInspectorUtility, checkInspectorLabels } from '../support/inspector-utilities';
import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import {
  applyHarnessBootstrap,
  EDITOR_HARNESS_PATH,
  SETTINGS_HARNESS_PATH,
} from '../extension-critical.helpers';
import { openVisualHarness } from './scenario-editor-visual.helpers';
const check = expect.configure({ soft: true, timeout: 1000 });

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['ru', 'en'] as const) {
    test(`heading and color geometry in ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      const ru = locale === 'ru';
      await openVisualHarness(
        page,
        hostOrigin,
        theme,
        locale,
        { width: 1600, height: 1000 },
        'compare',
        { tourFixture: '1' }
      );
      const panel = page.locator('#guide-inspector-panel');
      await checkInspectorUtility(
        page,
        panel.locator('.guide-panel-heading > button').last(),
        '4px',
        'secondary'
      );
      await page.screenshot({ path: info.outputPath('inspector-utilities.png'), fullPage: false });
      const mode = page.locator('.tour-representation-switch [aria-pressed="true"]');
      await page.mouse.move(700, 100);
      const idleBorder = await mode.evaluate((node) => getComputedStyle(node).borderTopColor);
      await check(mode).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await check(mode).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      check(await mode.evaluate((node) => getComputedStyle(node, '::before').height)).toBe('2px');
      await check(mode.locator(':scope > .sniptale-command-content > span')).toHaveCSS(
        'font-size',
        '13px'
      );
      await check(mode.locator('svg')).toHaveCSS(
        'color',
        await mode.evaluate((node) => getComputedStyle(node).color)
      );
      await mode.hover();
      await check(mode).toHaveCSS('border-top-color', idleBorder);
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Оформление' : 'Appearance', exact: true })
        .click();
      const nestedStyle = panel.locator('.guide-style-fields > .guide-inspector-group');
      for (const group of await nestedStyle.all()) {
        await check(group).toHaveCSS('border-top-width', '0px');
        await check(group.locator('.guide-inspector-group-heading')).toHaveCSS('font-size', '13px');
        await check(group.locator('button[aria-expanded]').first()).toHaveCSS('min-height', '32px');
      }
      const accent = panel.locator('.guide-style-accent');
      check((await accent.boundingBox())!.height).toBeLessThanOrEqual(40);
      const resetEdge = await accent.evaluate(
        (node) =>
          node.getBoundingClientRect().right -
          node.querySelector(':scope > button')!.getBoundingClientRect().right
      );
      check(Math.abs(resetEdge)).toBeLessThanOrEqual(1);
      const colorTrigger = accent.locator('[data-ui="shared.ui.color-selector.trigger"]');
      await check(colorTrigger).toHaveCSS('border-top-width', '0px');
      await check(colorTrigger).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const picker = accent.locator('[data-ui="shared.ui.color-selector.picker-trigger"]');
      const palette = accent.locator('[data-ui="shared.ui.color-selector.palette-trigger"]');
      await check(palette).toHaveCount(0);
      const value = accent.locator('[data-ui="shared.ui.color-selector.value-trigger"]');
      await check(value).toBeVisible();
      check((await value.boundingBox())!.width).toBeGreaterThan(20);
      const labelColor = await accent
        .locator('[data-ui="shared.ui.compact-inspector.color-field"] > span')
        .evaluate((node) => getComputedStyle(node).color);
      check(labelColor).not.toBe(await picker.evaluate((node) => getComputedStyle(node).color));
      await picker.click();
      const popup = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
      await expect(popup).toBeVisible();
      const triggerBounds = await picker.boundingBox();
      const popupBounds = await popup.boundingBox();
      check(popupBounds!.x + popupBounds!.width).toBeLessThanOrEqual(triggerBounds!.x - 8);
      await page.screenshot({ path: info.outputPath('color-open.png'), fullPage: false });
      await popup.getByRole('button', { name: 'RGB', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(picker).toBeFocused();
      await expect(value).toContainText('RGB(');
      const divider = page.locator('.guide-panel-divider-right');
      await divider.focus();
      await page.keyboard.press('Home');
      for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
      await expect(divider).toHaveAttribute('aria-valuenow', '260');
      await checkInspectorLabels(panel);
      const valueGeometry = await value.evaluate((node) => ({
        width: node.clientWidth,
        content: node.scrollWidth,
        height: node.getBoundingClientRect().height,
      }));
      check(valueGeometry.width).toBeGreaterThan(20);
      await check(value).toHaveCSS('overflow-x', 'hidden');
      await check(value).toHaveCSS('text-overflow', 'ellipsis');
      await check(value).toHaveAttribute('title', (await value.textContent())!);
      const narrowValueBounds = (await value.boundingBox())!;
      const narrowTriggerBounds = (await colorTrigger.boundingBox())!;
      check(narrowValueBounds.x).toBeGreaterThanOrEqual(narrowTriggerBounds.x - 1);
      check(narrowValueBounds.x + narrowValueBounds.width).toBeLessThanOrEqual(
        narrowTriggerBounds.x + narrowTriggerBounds.width + 1
      );
      check(
        await colorTrigger.evaluate((node) => node.scrollWidth - node.clientWidth)
      ).toBeLessThanOrEqual(1);
      check(valueGeometry.height).toBeGreaterThan(1);
      await page.screenshot({ path: info.outputPath('color-value-narrow.png'), fullPage: false });
      await divider.focus();
      await page.keyboard.press('Home');
      await panel
        .getByRole('button', {
          name: ru ? 'Показать все настройки' : 'Show all settings',
          exact: true,
        })
        .click();
      const appearanceHeading = panel.locator('.guide-appearance-heading');
      const spacing = await appearanceHeading.evaluate((node) => {
        const next = node.nextElementSibling!.querySelector('.guide-inspector-group-heading')!;
        return next.getBoundingClientRect().top - node.getBoundingClientRect().bottom;
      });
      check(spacing).toBeGreaterThanOrEqual(12);
      await page
        .getByRole('button', { name: ru ? 'Интерактивный тур' : 'Interactive tour', exact: true })
        .click();
      const all = panel.getByRole('button', {
        name: ru ? 'Показать все настройки' : 'Show all settings',
        exact: true,
      });
      if (await all.count()) await all.click();
      const geometry = await panel.locator('.guide-inspector-disclosure').evaluateAll((nodes) =>
        nodes.map((node) => {
          const label = node.querySelector('span')!;
          const icon = node.querySelector('svg')!;
          const box = label.getBoundingClientRect();
          const svg = icon.getBoundingClientRect();
          const style = getComputedStyle(label);
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const metrics = context.measureText(label.textContent!);
          const baseline =
            box.top +
            (box.height - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 +
            metrics.fontBoundingBoxAscent;
          const inkCenter =
            baseline + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2;
          return {
            title: label.textContent,
            level: node.closest('[data-level]')?.getAttribute('data-level'),
            iconSize: svg.height,
            lineHeight: style.lineHeight,
            boxDelta: box.top + box.height / 2 - svg.top - svg.height / 2,
            inkDelta: inkCenter - svg.top - svg.height / 2,
          };
        })
      );
      await info.attach(`heading-geometry-${locale}-${theme}`, {
        body: JSON.stringify(geometry),
        contentType: 'application/json',
      });
      check(
        geometry.every(({ level, iconSize, lineHeight }) =>
          level === 'group'
            ? iconSize === 14 && lineHeight === '18px'
            : iconSize === 16 && lineHeight === '20px'
        )
      ).toBe(true);
      check(geometry.every(({ boxDelta }) => Math.abs(boxDelta) <= 1)).toBe(true);
      await check(panel.locator('.guide-inspector-disclosure').first()).not.toHaveCSS(
        'border-radius',
        '0px'
      );
      await page.screenshot({ path: info.outputPath('headings.png'), fullPage: false });
      await panel
        .getByRole('button', { name: ru ? 'Точка действия' : 'Hotspot', exact: true })
        .click();
      const textColor = panel.locator(
        '.tour-hint-style-settings [data-ui="shared.ui.compact-inspector.color-field"]'
      );
      check((await textColor.boundingBox())!.height).toBeLessThanOrEqual(40);
      await expect(
        panel.getByText(ru ? 'Скругление' : 'Corner radius', { exact: true })
      ).toHaveCount(0);
      const hintDetails = panel.locator('[data-ui="scenario-editor.hint-style-details"]');
      await expect(hintDetails).not.toHaveAttribute('open', '');
      await hintDetails.locator(':scope > summary').click();
      await expect(hintDetails).toHaveAttribute('open', '');
      const width = panel.getByRole('textbox', {
        name: ru ? 'Ширина пояснения' : 'Explanation width',
        exact: true,
      });
      const padding = panel.getByRole('textbox', {
        name: ru ? 'Внутренний отступ' : 'Inner padding',
        exact: true,
      });
      await expect(width).toBeEnabled();
      await expect(padding).toBeEnabled();
      const widthBounds = (await width.boundingBox())!;
      const paddingBounds = (await padding.boundingBox())!;
      expect(paddingBounds.y - widthBounds.y - widthBounds.height).toBeGreaterThanOrEqual(8);
      expect(paddingBounds.height).toBeCloseTo(widthBounds.height, 1);
      await textColor.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('hotspot-fields.png'), fullPage: false });
      await page
        .locator('#guide-library-panel')
        .getByRole('button', {
          name: ru ? 'Навигационный слайд' : 'Navigation slide',
          exact: true,
        })
        .click();
      const title = panel.getByRole('textbox', { name: ru ? 'Заголовок' : 'Title', exact: true });
      await title.fill('Navigation title');
      const clear = title.locator('..').locator('.sniptale-field-clear');
      await page.mouse.move(0, 0);
      const textColorValue = await title.evaluate((node) => getComputedStyle(node).color);
      await expect(clear).not.toHaveCSS('color', textColorValue);
      await expect(clear).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await clear.hover();
      await expect(clear).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await clear.click();
      await expect(title).toHaveValue('');
      await expect(title).toBeFocused();
      await expect(clear).toHaveCount(0);
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`editor chrome follows document paper in ${theme}`, async ({ page, hostOrigin }) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1600, height: 1000 });
    await page.mouse.move(0, 0);
    const colors = await page
      .locator(
        [
          '.guide-document .guide-block-grip',
          '.guide-document .guide-block-width',
          '.guide-document .guide-block-height',
          '.guide-document .guide-action-menu-anchor > button',
          '.guide-document .guide-image-tools > button',
          '.guide-voice-control > [data-ui="scenario.voice-input"]',
        ].join(', ')
      )
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const transparent = Boolean(
            node.closest('.guide-insertion-chrome, .guide-voice-control')
          );
          const probe = document.createElement('span');
          probe.style.backgroundColor = transparent
            ? 'transparent'
            : 'rgb(from var(--guide-paper) r g b / 0.94)';
          node.append(probe);
          const expected = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return { actual: getComputedStyle(node).backgroundColor, expected };
        })
      );
    expect(colors.length).toBeGreaterThan(3);
    for (const color of colors) expect(color.actual).toBe(color.expected);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`guide text selectors keep neutral selection in ${theme}`, async ({ page, hostOrigin }) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1600, height: 1000 });
    const details = page
      .locator('#guide-inspector-panel [data-ui="shared.information-disclosure"]')
      .filter({ hasText: 'Layouts change block widths' });
    await expect(details).not.toHaveAttribute('open', '');
    check(
      await details.evaluate(
        (node) =>
          node.getBoundingClientRect().top -
          node.previousElementSibling!.getBoundingClientRect().bottom
      )
    ).toBeGreaterThanOrEqual(8);
    await details.locator(':scope > summary').click();
    await expect(details).toHaveAttribute('open', '');
    await expect(details.getByText('Layouts change block widths', { exact: false })).toBeVisible();
    const dropdown = page
      .locator('#guide-inspector-panel [data-ui="shared.ui.compact-select"] > button')
      .first();
    await dropdown.click();
    await page.mouse.move(500, 20);
    const openBorder = await dropdown.evaluate((node) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--sniptale-color-border-strong)';
      node.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await check(dropdown).toHaveCSS('border-top-color', openBorder);
    await dropdown.hover();
    await check(dropdown).toHaveCSS('border-top-color', openBorder);
    await page.keyboard.press('Escape');
    const save = page.getByRole('button', { name: 'Save as layout', exact: true });
    await expect(save).toHaveCSS('justify-content', 'flex-start');
    await save.click();
    const nameInput = page.locator('.guide-template-controls input');
    await expect(nameInput).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(save).toBeFocused();
    await page.locator('.guide-block[data-kind="text"]').first().locator('textarea').focus();
    const panel = page.locator('#guide-inspector-panel');
    const back = panel.locator('.scenario-inspector-navigation');
    await back.hover();
    const backBounds = await back.boundingBox();
    const sectionBounds = await panel
      .locator('.guide-block-inspector .guide-inspector-group')
      .first()
      .boundingBox();
    check(sectionBounds!.y - backBounds!.y - backBounds!.height).toBeGreaterThanOrEqual(8);
    const blockInspector = panel.locator('.guide-block-inspector');
    const categories = blockInspector.locator(
      '[data-ui="scenario-editor.inspector-categories"] > nav'
    );
    const resetAlignments: string[] = [];
    const checkSelected = async (groupName: string, optionName: string) => {
      const selected = blockInspector
        .getByRole('group', { name: groupName, exact: true })
        .locator('button[aria-pressed="true"]');
      await expect(selected).toHaveCount(1);
      await expect(selected).toHaveAccessibleName(optionName);
      await selected.hover();
      await check(selected).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await check(selected).toHaveCSS('box-shadow', 'none');
      await check(selected).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    };
    await categories.getByRole('button', { name: 'Placement', exact: true }).click();
    await checkSelected('Block width', 'Full width');
    const automaticHeight = blockInspector.getByRole('button', {
      name: 'Automatic height',
      exact: true,
    });
    await expect(automaticHeight).toBeVisible();
    resetAlignments.push(
      await automaticHeight.evaluate((node) => getComputedStyle(node).justifyContent)
    );
    await categories.getByRole('button', { name: 'Text', exact: true }).click();
    await checkSelected('Text size', 'Normal');
    await checkSelected('Alignment', 'Start');
    const resetText = blockInspector.getByRole('button', {
      name: 'Reset text appearance',
      exact: true,
    });
    await expect(resetText).toBeVisible();
    resetAlignments.push(await resetText.evaluate((node) => getComputedStyle(node).justifyContent));
    expect(resetAlignments).toHaveLength(2);
    check(new Set(resetAlignments).size).toBe(1);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`palette follows inspector scrolling and closes with clipped anchor in ${theme}`, async ({
    page,
    hostOrigin,
  }) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1600, height: 600 }, 'compare');
    const panel = page.locator('#guide-inspector-panel');
    await panel.getByRole('button', { name: 'Show all settings', exact: true }).click();
    const trigger = panel.locator(
      '.guide-style-accent [data-ui="shared.ui.color-selector.picker-trigger"]'
    );
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const layer = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
    await expect(layer).toBeVisible();
    const scroll = panel.locator('.guide-panel-scroll');
    const previous = await trigger.boundingBox();
    await scroll.evaluate((node) => {
      node.scrollTop -= 40;
    });
    await expect.poll(async () => (await trigger.boundingBox())!.y).not.toBe(previous!.y);
    await expect
      .poll(async () => {
        const anchor = await panel
          .locator('.guide-style-accent [data-ui="shared.ui.color-selector.trigger"]')
          .boundingBox();
        const box = await layer.boundingBox();
        return Math.abs(
          box!.y - Math.min(Math.max(anchor!.y, 8), Math.max(8, 600 - 8 - box!.height))
        );
      })
      .toBeLessThanOrEqual(1);
    await scroll.evaluate((node) => {
      node.scrollTop = 0;
    });
    await expect(layer).toBeHidden();
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['ru', 'en'] as const) {
    test(`color value editing in ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      await openVisualHarness(page, hostOrigin, theme, locale, { width: 1280, height: 720 });
      const panel = page.locator('#guide-inspector-panel');
      await panel
        .getByRole('navigation')
        .getByRole('button', {
          name: locale === 'ru' ? 'Оформление' : 'Appearance',
          exact: true,
        })
        .click();
      const field = panel.locator('.guide-style-accent');
      const swatch = field.locator('[data-ui="shared.ui.color-selector.picker-trigger"]');
      const value = field.locator('[data-ui="shared.ui.color-selector.value-trigger"]');
      await expect(
        field.locator('[data-ui="shared.ui.color-selector.palette-trigger"]')
      ).toHaveCount(0);
      const before = await field.boundingBox();
      await value.click();
      const input = field.getByRole('textbox');
      await expect(input).toBeFocused();
      const inputGeometry = await input.evaluate((element) => {
        const shell = element.parentElement!;
        const style = getComputedStyle(shell);
        return {
          available:
            shell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
          width: element.getBoundingClientRect().width,
          outline: getComputedStyle(element).outlineStyle,
        };
      });
      expect(Math.abs(inputGeometry.width - inputGeometry.available)).toBeLessThanOrEqual(1);
      expect(inputGeometry.outline).toBe('none');
      expect(await field.boundingBox()).toEqual(before);
      await input.fill('#abcdef');
      await input.press('Enter');
      await expect(value).toHaveText('#ABCDEF');
      await expect(value).toBeFocused();
      expect(await field.boundingBox()).toEqual(before);
      await value.click();
      await input.fill('invalid');
      await input.press('Enter');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(field.getByRole('alert')).toBeVisible();
      expect(await field.boundingBox()).toEqual(before);
      await input.press('Escape');
      await expect(value).toHaveText('#ABCDEF');
      await swatch.click();
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
      await expect(picker).toBeVisible();
      const cancel = picker.getByRole('button', {
        name: locale === 'ru' ? 'Отмена' : 'Cancel',
        exact: true,
      });
      const apply = picker.getByRole('button', {
        name: locale === 'ru' ? 'Применить' : 'Apply',
        exact: true,
      });
      expect((await cancel.boundingBox())!.height).toBe(32);
      expect((await apply.boundingBox())!.height).toBe(32);
      expect(await field.boundingBox()).toEqual(before);
      await page.screenshot({ path: info.outputPath('color-picker.png'), fullPage: false });
      await picker.getByRole('button', { name: 'HEX', exact: true }).click();
      await picker.getByRole('textbox', { name: 'HEX', exact: true }).fill('#123456');
      await cancel.click();
      await expect(value).toHaveText('#ABCDEF');
      await expect(swatch).toBeFocused();
      const divider = page.locator('.guide-panel-divider-right');
      await divider.focus();
      await page.keyboard.press('Home');
      const bounds = await field.boundingBox();
      const valueBounds = await value.boundingBox();
      expect(valueBounds!.width).toBeGreaterThan(20);
      expect(valueBounds!.x + valueBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
      await info.attach(`backlog6-${locale}-${theme}`, {
        body: await panel.screenshot({ path: info.outputPath('color-panel.png'), fullPage: false }),
        contentType: 'image/png',
      });
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`drawing color value editing in ${theme}`, async ({ page, hostOrigin }, info) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await applyHarnessBootstrap(page, { storage: { 'sniptale-theme-preference': theme } });
    await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}?theme=${theme}`);
    await expect(page.locator('[data-ui="editor.page.root"]')).toBeVisible();
    await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
    const options = page.locator('[data-ui="editor.drawing.options"]');
    const swatch = options.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').first();
    await expect(swatch.locator('span')).toBeVisible();
    expect((await swatch.locator('span').boundingBox())!.width).toBe(20);
    await expect(
      options.locator('[data-ui="shared.ui.color-selector.value-trigger"]').first()
    ).toBeHidden();
    await swatch.click();
    const picker = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: 'HEX', exact: true }).click();
    await expect(picker.getByRole('textbox', { name: 'HEX', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('drawing-color-picker.png'), fullPage: false });
    await page.keyboard.press('Escape');
    await expect(swatch).toBeFocused();
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['ru', 'en'] as const) {
    test(`fixed drawing palette in ${locale} ${theme}`, async ({ page, hostOrigin }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.addInitScript(
        ({ theme, locale }) => {
          localStorage.setItem('sniptale-theme-preference', theme);
          localStorage.setItem('sniptale-locale-preference', locale);
        },
        { theme, locale }
      );
      await applyHarnessBootstrap(page, {
        storage: { 'sniptale-theme-preference': theme, 'sniptale-locale-preference': locale },
      });
      await page.goto(
        `${hostOrigin}${SETTINGS_HARNESS_PATH}?section=editor-resources&view=palettes`
      );
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(
        page.getByText(
          locale === 'ru'
            ? 'Первые пять цветов — постоянный быстрый набор для рисования.'
            : 'The first five colors are your fixed drawing shortcuts.',
          { exact: false }
        )
      ).toBeVisible();
      const values = page.locator('[data-ui="shared.ui.color-selector.value-trigger"]');
      await expect(values).toHaveCount(10);
      await values.first().click();
      const input = page.locator('[data-ui="shared.ui.color-selector.trigger"] input');
      await input.fill('#123456');
      await input.press('Enter');
      await expect(values.first()).toHaveText('#123456');
      await page.screenshot({
        path: info.outputPath('fixed-palette-settings.png'),
        fullPage: false,
      });
      const saved = await page.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale_drawing_palette')).sniptale_drawing_palette
      );
      expect(saved.colors[0]).toBe('#123456');
      await applyHarnessBootstrap(page, {
        storage: {
          'sniptale-theme-preference': theme,
          'sniptale-locale-preference': locale,
          sniptale_drawing_palette: saved,
        },
      });
      await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
      const options = page.locator('[data-ui="editor.drawing.options"]');
      const quick = options.locator(
        '[data-ui="content.toolbar.drawing-options.quick-colors"] button'
      );
      await expect(quick).toHaveCount(5);
      const colors = () => quick.evaluateAll((buttons) => buttons.map((button) => button.title));
      expect(await colors()).toEqual(saved.colors.slice(0, 5));
      await options.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker-layer"]');
      await picker.getByRole('button', { name: 'HEX', exact: true }).click();
      await picker.getByRole('textbox', { name: 'HEX', exact: true }).fill('#abcdef');
      await picker.getByRole('button', { name: /^(Apply|Применить)$/ }).click();
      expect(await colors()).toEqual(saved.colors.slice(0, 5));
      await page.screenshot({
        path: info.outputPath('fixed-palette-drawing.png'),
        fullPage: false,
      });
      await page.reload();
      await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
      await expect(quick).toHaveCount(5);
      expect(await colors()).toEqual(saved.colors.slice(0, 5));
    });
  }
}
