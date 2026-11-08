import { translate } from '../../../../apps/extension/src/platform/i18n';
import type { Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

test.use({ actionTimeout: 10000 });

async function openEditor(
  page: Page,
  hostOrigin: string,
  locale: 'en' | 'ru',
  theme = page.viewportSize()?.width === 1920 ? 'dark' : 'light'
) {
  await applyHarnessBootstrap(page, {
    storage: {
      'sniptale-locale-preference': locale,
      'sniptale-theme-preference': theme,
    },
  });
  await page.addInitScript(
    (value) => localStorage.setItem('sniptale-locale-preference', value),
    locale
  );
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
  await expect(page.locator('[data-ui="editor.page.root"]')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0))
    .toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.ready);
}

async function zoomAndCheckAlignment(page: Page, direction: 'in' | 'out') {
  const error = await page.evaluate(async (nextDirection) => {
    const scene = document.querySelector('[data-ui="editor.frame-annotation-scene"]')!;
    const boundary = document.querySelector('[data-ui="editor.canvas.document-boundary"]')!;
    const offset = () => {
      const projected = scene.getBoundingClientRect();
      const image = boundary.getBoundingClientRect();
      return { x: projected.left - image.left, y: projected.top - image.top };
    };
    const initial = offset();
    document
      .querySelector<HTMLButtonElement>(
        `[data-ui="editor.floating.view-controls.zoom-${nextDirection}"]`
      )!
      .click();
    let maximum = 0;
    for (let frame = 0; frame < 8; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const current = offset();
      maximum = Math.max(maximum, Math.abs(current.x - initial.x), Math.abs(current.y - initial.y));
    }
    return maximum;
  }, direction);
  expect(error).toBeLessThanOrEqual(1);
}

for (const locale of ['en', 'ru'] as const) {
  for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
    test(`image refinements toolbar geometry and workspace menu ${locale} ${name}`, async ({
      page,
      hostOrigin,
    }, info) => {
      await page.setViewportSize(size);
      await openEditor(page, hostOrigin, locale);
      const bars = page.locator(
        '[data-ui="editor.floating.document-bar.surface"], ' +
          '[data-ui="editor.floating.tool-rail"], ' +
          '[data-ui="editor.floating.view-controls"]'
      );
      await expect(bars).toHaveCount(3);
      const heights = await bars.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().height)
      );
      expect
        .soft(Math.max(...heights) - Math.min(...heights), JSON.stringify(heights))
        .toBeLessThanOrEqual(1);
      await page.locator('[data-ui="editor.floating.view-controls.workspace"]').click();
      const menu = page.locator('[data-ui="editor.floating.view-controls.popover.workspace"]');
      const viewport = page.locator('[data-ui="editor.canvas.viewport"]');
      const before = await viewport.evaluate((element) => element.scrollLeft);
      const snap = menu.getByRole('button', {
        name: translate('editor.compact.enableGridSnap', locale),
        exact: true,
      });
      await expect(snap).toBeVisible();
      const sizeField = menu.getByRole('textbox', {
        name: translate('editor.compact.gridSize', locale),
        exact: true,
      });
      await expect(sizeField).toHaveCount(0);
      await snap.click();
      await expect(sizeField).toBeVisible();
      await snap.click();
      await expect(sizeField).toHaveCount(0);
      const toggle = menu.getByRole('button', {
        name: translate('editor.compact.showGrid', locale),
        exact: true,
      });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-ui="editor.canvas.document-grid"]')).toBeVisible();
      const overflow = await menu.evaluate((element) =>
        [element, ...element.querySelectorAll('*')]
          .filter((child) => /^(auto|scroll)$/.test(getComputedStyle(child).overflowX))
          .map((child) => ({
            width: child.scrollWidth - child.clientWidth,
            left: child.scrollLeft,
          }))
          .filter((item) => item.width > 1 || item.left !== 0)
      );
      expect.soft(overflow).toEqual([]);
      expect.soft(await viewport.evaluate((element) => element.scrollLeft)).toBe(before);
      const alpha = await menu.evaluate((element) => {
        const color = getComputedStyle(element).backgroundColor;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return context.getImageData(0, 0, 1, 1).data[3];
      });
      expect.soft(alpha).toBe(255);
      await page.screenshot({ path: info.outputPath('workspace-menu.png'), fullPage: false });
      await toggle.click();
      await expect(page.locator('[data-ui="editor.canvas.document-grid"]')).toHaveCount(0);
    });
  }
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`image refinements frame controls and inspector ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await page.setViewportSize(size);
    await openEditor(page, hostOrigin, 'en');
    await page.locator('[data-ui="content.toolbar.future-frame-style"]').click();
    const calloutToggle = page.locator('[data-ui="content.toolbar.future-frame-callout"]');
    if ((await calloutToggle.getAttribute('aria-pressed')) === 'true') await calloutToggle.click();
    const stepToggle = page.locator('[data-ui="content.toolbar.future-frame-step-badge"]');
    if ((await stepToggle.getAttribute('aria-pressed')) !== 'true') await stepToggle.click();
    const plane = (await page.locator('[data-ui="editor.frame-annotation-plane"]').boundingBox())!;
    const center = { x: plane.x + plane.width / 2, y: plane.y + plane.height / 2 };
    await page.mouse.move(center.x - 100, center.y - 60);
    await page.mouse.down();
    await page.mouse.move(center.x + 100, center.y + 60, { steps: 4 });
    await page.mouse.up();
    const badge = page.locator('.sniptale-step-badge');
    await expect(badge).toBeVisible();
    const badgeOnTop = () =>
      badge.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return top === element || (top !== null && element.contains(top));
      });
    expect(await badgeOnTop()).toBe(true);
    const handle = page.locator('[data-frame-control="resize-handle"][data-direction="se"]');
    const handleBefore = (await handle.boundingBox())!;
    await page.mouse.move(
      handleBefore.x + handleBefore.width / 2,
      handleBefore.y + handleBefore.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(handleBefore.x + 45, handleBefore.y + 30, { steps: 3 });
    await page.mouse.up();
    await zoomAndCheckAlignment(page, 'in');
    await expect
      .poll(async () => (await handle.boundingBox())?.width)
      .toBeCloseTo(handleBefore.width, 0);
    expect(await badgeOnTop()).toBe(true);
    await zoomAndCheckAlignment(page, 'out');
    await page
      .locator('[data-ui="editor.frame-annotation-scene"] > [data-frame-id]')
      .first()
      .click();
    await page
      .locator('.sniptale-action-toolbar')
      .getByRole('button', { name: 'Comments', exact: true })
      .click();
    let editable = page.locator('.sniptale-callout [contenteditable="true"]');
    await editable.fill('First comment');
    await editable.press('Enter');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add another comment', exact: true }).click();
    editable = page.locator('.sniptale-callout [contenteditable="true"]');
    await expect(editable).toBeFocused();
    await expect(page.locator('[data-ui="content.toolbar.future-callout-popover"]')).toHaveCount(0);
    await editable.fill('Second comment');
    await editable.press('Enter');
    await page.screenshot({ path: info.outputPath('frame-controls.png'), fullPage: false });
    await page.locator('[data-ui="editor.floating.layers.mode.image-size"]').click();
    for (const mode of ['image-size', 'canvas-size']) {
      if (mode === 'canvas-size')
        await page.locator('[data-ui="editor.floating.layers.mode.canvas-size"]').click();
      const dimensions = page.locator('[data-size-panel-dimensions]');
      const toggle = dimensions.locator('[data-ui="editor.size-controls.aspect-toggle"]');
      await expect(toggle).toBeVisible();
      const geometry = await dimensions.evaluate((element) => {
        const inputs = [...element.querySelectorAll('input')].map((input) =>
          input.getBoundingClientRect()
        );
        const toggle = element
          .querySelector('[data-ui="editor.size-controls.aspect-toggle"]')!
          .getBoundingClientRect();
        return {
          first: inputs[0]!.y + inputs[0]!.height / 2,
          second: inputs[1]!.y + inputs[1]!.height / 2,
          toggle: toggle.y + toggle.height / 2,
          width: toggle.width,
          height: toggle.height,
          rightDifference: Math.abs(inputs[0]!.right - inputs[1]!.right),
        };
      });
      expect(geometry.toggle).toBeGreaterThan(geometry.first);
      expect(geometry.toggle).toBeLessThan(geometry.second);
      expect(geometry.width).toBeGreaterThanOrEqual(24);
      expect(geometry.height).toBeGreaterThanOrEqual(24);
      expect(geometry.rightDifference).toBeLessThanOrEqual(1);
      const before = await toggle.getAttribute('aria-pressed');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
      await page.screenshot({ path: info.outputPath(`${mode}.png`), fullPage: false });
    }
    await page.locator('[data-ui="editor.floating.layers.mode.frame"]').click();
    await page.locator('[data-ui="editor.frame.background-mode"] button').nth(1).click();
    const palette = page.locator('[data-ui="editor.frame.paint-presets"]');
    await expect(palette).toBeVisible();
    const more = palette.getByRole('button', { name: /Show more|Показать ещё/ });
    await expect(more).toHaveCount(1);
    await more.click();
    await expect(palette.locator('[data-ui="shared.ui.backgroundThumbnails.group"]')).toHaveCount(
      2
    );
    await palette.locator('button[aria-pressed]').last().click();
    const padding = page.locator('[data-ui="editor.frame.padding-fields"]');
    await padding.scrollIntoViewIfNeeded();
    const strip = padding.locator('[data-ui="editor.frame.padding-slider"]');
    const header = padding.locator('[data-padding-hover="all"]').first();
    await strip.scrollIntoViewIfNeeded();
    await header.locator('span').first().hover();
    const track = strip.locator('[data-ui="shared.ui.compact-inspector.numeric-range-track"]');
    await expect(track).toBeVisible();
    expect((await padding.boundingBox())!.height).toBeCloseTo(40, 0);
    const stripRect = (await strip.boundingBox())!;
    const headerRect = (await header.boundingBox())!;
    expect(stripRect.y).toBeGreaterThanOrEqual(headerRect.y + headerRect.height - 1);
    expect((await track.boundingBox())!.y).toBeGreaterThanOrEqual(
      headerRect.y + headerRect.height - 1
    );
    const range = strip.locator('input[type="range"]');
    const previousPadding = Number(await range.inputValue());
    await range.focus();
    await range.press('ArrowRight');
    await expect(range).toHaveValue(String(previousPadding + 1));
    await page.screenshot({
      path: info.outputPath('background-palette-padding.png'),
      fullPage: false,
    });
  });
}

test('image refinements toolbar breakpoints and narrow outer scroll', async ({
  page,
  hostOrigin,
}, info) => {
  await page.setViewportSize({ width: 1438, height: 560 });
  await openEditor(page, hostOrigin, 'ru');
  for (const width of [1438, 1439, 1440, 1498, 1499, 1500, 1638, 1639, 1640]) {
    await page.setViewportSize({ width, height: 560 });
    const heights = await page
      .locator(
        '[data-ui="editor.floating.document-bar.surface"], ' +
          '[data-ui="editor.floating.tool-rail"], ' +
          '[data-ui="editor.floating.view-controls"]'
      )
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
    const pencil = page.locator('[data-ui="editor.floating.tool-rail.pencil"]');
    await pencil.click();
    await expect(pencil).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
  }
  await page.setViewportSize({ width: 1100, height: 560 });
  const outer = page.locator('.sniptale-image-page');
  expect(
    await outer.evaluate((element) => element.scrollWidth - element.clientWidth)
  ).toBeGreaterThanOrEqual(180);
  await outer.evaluate((element) => {
    element.scrollLeft = 180;
  });
  expect(await outer.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('narrow-outer-scroll.png'), fullPage: false });
});

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`inspector aligned controls and window-header states ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await page.setViewportSize(size);
    await openEditor(page, hostOrigin, 'en');
    const mode = (value: string) =>
      page.locator(`[data-ui="editor.floating.layers.mode.${value}"]`);
    await mode('frame').click();
    const panel = page.locator('[data-ui="editor.frame-panel"]');
    const insets = await panel.evaluate((element) => {
      const outer = element
        .closest('.editor-inspector-surface')!
        .parentElement!.getBoundingClientRect();
      const inner = element.getBoundingClientRect();
      return { left: inner.left - outer.left, right: outer.right - inner.right };
    });
    expect(Math.abs(insets.left - insets.right)).toBeLessThanOrEqual(1);
    await panel
      .locator('[data-ui="editor.frame.background-mode"]')
      .getByRole('button')
      .nth(1)
      .click();
    const groups = panel.locator('details[data-level="section"]');
    await expect(groups).toHaveCount(3);
    expect(
      await groups.evaluateAll((nodes) => nodes.every((node) => node.hasAttribute('open')))
    ).toBe(true);
    await expect(
      panel
        .locator('summary')
        .filter({ hasText: translate('editor.scene.backgroundAdvanced', 'en') })
    ).toHaveCount(0);
    for (const kind of ['glow', 'border'])
      await expect(
        panel.locator(`[data-ui="editor.frame.source-${kind}"] details`)
      ).not.toHaveAttribute('open');
    const scroller = page.locator('[data-ui="editor.floating.inspector-scroll"]');
    await scroller.hover();
    await page.mouse.wheel(0, 80);
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const scrollPosition = await scroller.evaluate((element) => element.scrollTop);
    await mode('meta').click();
    await mode('frame').click();
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(scrollPosition);
    await mode('browser-frame').click();
    const header = page.locator('[data-ui="window-header-settings"]');
    await header
      .getByRole('button', { name: translate('windowHeader.none', 'en'), exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: translate('windowHeader.reset', 'en'), exact: true })
    ).toHaveCount(0);
    await expect(
      page.locator('summary').filter({ hasText: translate('editor.scene.placementSection', 'en') })
    ).toHaveCount(0);
    await header
      .getByRole('button', { name: translate('windowHeader.browser', 'en'), exact: true })
      .click();
    const headerGroups = header.locator('details');
    await expect(headerGroups).toHaveCount(2);
    expect(
      await headerGroups.evaluateAll((nodes) => nodes.every((node) => node.hasAttribute('open')))
    ).toBe(true);
    await expect(
      page.locator('[data-ui="editor.inspector.disclosure"]').filter({
        has: page
          .locator('summary')
          .filter({ hasText: translate('editor.scene.placementSection', 'en') }),
      })
    ).not.toHaveAttribute('open');
    const title = header.getByRole('textbox', {
      name: translate('windowHeader.tabTitle', 'en'),
      exact: true,
    });
    await expect(title).toHaveAttribute(
      'placeholder',
      translate('windowHeader.tabTitlePlaceholder', 'en')
    );
    const stacked = await title.evaluate((input) => {
      const row = input.closest('.sniptale-parameter-row')!;
      const label = row.querySelector('.sniptale-parameter-name')!.getBoundingClientRect();
      return input.getBoundingClientRect().top >= label.bottom;
    });
    expect(stacked).toBe(true);
    const address = header.getByRole('textbox', {
      name: translate('windowHeader.address', 'en'),
      exact: true,
    });
    await address.fill('');
    await address.press('Enter');
    await expect(
      header.getByRole('button', { name: translate('windowHeader.favicon', 'en'), exact: true })
    ).toBeDisabled();
    await mode('meta').click();
    const checks = page.locator('.sniptale-boolean-parameter input[type="checkbox"]');
    await expect(checks).toHaveCount(3);
    const content = page.locator('[data-ui="editor.inspector.disclosure"]').filter({
      has: page
        .locator('summary')
        .filter({ hasText: translate('editor.compact.technicalDataFields', 'en') }),
    });
    const appearance = page.locator('[data-ui="editor.inspector.disclosure"]').filter({
      has: page
        .locator('summary')
        .filter({ hasText: translate('editor.compact.technicalDataTextSettings', 'en') }),
    });
    await expect(content).toHaveAttribute('open');
    await expect(appearance).not.toHaveAttribute('open');
    for (let index = 0; index < 3; index++) await checks.nth(index).uncheck();
    await expect(
      page.getByRole('button', {
        name: translate('editor.compact.technicalDataInsert', 'en'),
        exact: true,
      })
    ).toBeDisabled();
    await checks.nth(0).check();
    await checks.nth(1).check();
    await expect(
      page.getByRole('group', {
        name: translate('editor.compact.technicalDataLayout', 'en'),
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: translate('editor.compact.technicalDataPreviewEmpty', 'en') })
    ).toHaveCount(0);
    await expect(
      page
        .getByRole('button', {
          name: translate('editor.compact.technicalDataInsert', 'en'),
          exact: true,
        })
        .locator('svg')
    ).toHaveCount(1);
    await page.screenshot({ path: info.outputPath('inspector-controls.png'), fullPage: false });
    await page.locator('[data-ui="editor.floating.tool-rail.history.reset"]').click();
    const history = page.locator('[data-ui="editor.floating.tool-rail.history.reset-choices"]');
    const overflow = await history.locator('button').evaluateAll((nodes) =>
      nodes.map((node) => {
        const button = node.getBoundingClientRect();
        const content = node.querySelector('span.block')!.getBoundingClientRect();
        return Math.max(content.bottom - button.bottom, button.top - content.top);
      })
    );
    expect(Math.max(...overflow)).toBeLessThanOrEqual(0.5);
    await page.screenshot({ path: info.outputPath('history-reset-layout.png'), fullPage: false });
    await page.keyboard.press('Escape');
    await expect(history).toHaveCount(0);
  });
}

test('inspector keeps settings and layer-list scroll through tabs and collapse', async ({
  page,
  hostOrigin,
}) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await openEditor(page, hostOrigin, 'en');
  const mode = (name: string) => page.locator(`[data-ui="editor.floating.layers.mode.${name}"]`);
  await mode('meta').click();
  await page.locator('[data-ui="editor.technical-data.field-date"]').check();
  await page
    .getByRole('button', {
      name: translate('editor.compact.technicalDataInsert', 'en'),
      exact: true,
    })
    .click();
  await mode('layers').click();
  const list = page.locator('[data-ui="editor.layers.list-viewport"]');
  const duplicate = list
    .getByRole('button', {
      name: translate('editor.toolbar.duplicateLayer', 'en'),
      exact: true,
      disabled: false,
    })
    .first();
  for (let index = 0; index < 8; index++) {
    await list.locator(':scope > div').first().hover();
    await duplicate.click();
  }
  await list.hover();
  await page.mouse.wheel(0, 90);
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const layerPosition = await list.evaluate((element) => element.scrollTop);
  await mode('frame').click();
  await mode('layers').click();
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(layerPosition);
  await page.locator('[data-ui="editor.floating.layers.collapse-button"]').click();
  await mode('layers').click();
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(layerPosition);
  await mode('frame').click();
  await page.locator('[data-ui="editor.frame.background-mode"]').getByRole('button').nth(1).click();
  const scroller = page.locator('[data-ui="editor.floating.inspector-scroll"]');
  await scroller.hover();
  await page.mouse.wheel(0, 90);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const settingsPosition = await scroller.evaluate((element) => element.scrollTop);
  await page.locator('[data-ui="editor.floating.layers.collapse-button"]').click();
  await mode('meta').click();
  await mode('frame').click();
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(settingsPosition);
});

for (const locale of ['en', 'ru'] as const) {
  for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
    test(`inspector detail fixes ${locale} ${name}`, async ({ page, hostOrigin }, info) => {
      await page.setViewportSize(size);
      await openEditor(page, hostOrigin, locale);
      const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
      const mode = (value: string) =>
        page.locator(`[data-ui="editor.floating.layers.mode.${value}"]`);
      await mode('image-size').click();
      const dimensions = page.locator('[data-size-panel-dimensions]');
      const lock = dimensions.locator('[data-ui="editor.size-controls.aspect-toggle"]');
      const fields = dimensions.locator(
        '[data-ui="shared.ui.compact-inspector.numeric-value-field"]'
      );
      const centers = await fields.evaluateAll((nodes) =>
        nodes.map((n) => {
          const b = n.getBoundingClientRect();
          return b.y + b.height / 2;
        })
      );
      const lockedBox = (await lock.boundingBox())!;
      expect(
        Math.abs(lockedBox.y + lockedBox.height / 2 - (centers[0]! + centers[1]!) / 2)
      ).toBeLessThanOrEqual(0.5);
      expect((await lock.locator('svg').boundingBox())!.width).toBeGreaterThanOrEqual(14);
      if ((await lock.getAttribute('aria-pressed')) === 'true') await lock.click();
      await page.mouse.move(500, 100);
      await expect(lock).toHaveAttribute('aria-pressed', 'false');
      expect(await lock.locator('..').evaluate((n) => getComputedStyle(n).backgroundColor)).toBe(
        'rgba(0, 0, 0, 0)'
      );
      const width = dimensions.getByRole('textbox', {
        name: label('editor.compact.widthDimension'),
        exact: true,
      });
      const height = dimensions.getByRole('textbox', {
        name: label('editor.compact.heightDimension'),
        exact: true,
      });
      await width.fill('1237');
      await width.press('Enter');
      await height.fill('731');
      await height.press('Enter');
      for (const key of [
        'editor.compact.sizePreset',
        'editor.compact.aspectRatioPreset',
      ] as const) {
        const trigger = page.getByRole('button', { name: label(key), exact: true });
        await expect(trigger).toContainText(label('editor.compact.customSizePreset'));
        await trigger.click();
        await expect(
          page.getByRole('option', { name: label('editor.compact.customSizePreset'), exact: true })
        ).toHaveCount(0);
        await page.keyboard.press('Escape');
      }
      await page.screenshot({
        path: info.outputPath('dimensions-unlinked-custom.png'),
        fullPage: false,
      });
      await mode('frame').click();
      const panel = page.locator('[data-ui="editor.frame-panel"]');
      const kinds = panel.locator('[data-ui="editor.frame.background-mode"] button');
      await kinds.nth(1).click();
      const presets = panel.locator('[data-ui="editor.frame.paint-presets"]');
      await expect(presets.locator('[data-ui="shared.ui.backgroundThumbnails.group"]')).toHaveCount(
        0
      );
      expect(await presets.locator('button[style*="background-color"]').count()).toBeGreaterThan(0);
      expect(await presets.locator('button[style*="background-image"]').count()).toBeGreaterThan(0);
      const tile = (await presets.locator('button').first().boundingBox())!;
      await expect(presets.locator('button').first()).toHaveCSS('background-clip', 'padding-box');
      const checkPicker = async (picker: ReturnType<Page['locator']>) => {
        await expect(picker).toBeVisible();
        const box = (await picker.boundingBox())!;
        const owner = (await page
          .locator('[data-ui="editor.floating.layers-panel"]')
          .boundingBox())!;
        expect(owner.x - box.x - box.width).toBeGreaterThanOrEqual(7);
        expect(owner.x - box.x - box.width).toBeLessThanOrEqual(9);
        await expect(picker).toHaveCSS('outline-style', 'solid');
        expect(await picker.evaluate((n) => getComputedStyle(n).boxShadow)).not.toBe('none');
        await picker
          .getByRole('button', { name: label('common.actions.cancel'), exact: true })
          .click();
      };
      for (const style of ['background-color', 'background-image']) {
        await presets.locator(`button[style*="${style}"]`).first().click();
        await panel.locator('[data-ui="shared.ui.paint-selector.trigger"]').click();
        await checkPicker(page.locator('[data-ui="shared.ui.paint-selector.popup"]'));
      }
      await kinds.nth(2).click();
      const image = panel
        .locator('[data-ui="background.image.picker"] [role="group"] button')
        .first();
      await expect(image).toBeVisible();
      const imageTile = (await image.boundingBox())!;
      expect(Math.abs(tile.width - imageTile.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(tile.height - imageTile.height)).toBeLessThanOrEqual(1);
      await mode('meta').click();
      const check = page.locator('[data-ui="editor.technical-data.field-date"]');
      expect(
        await check.evaluate((n) => ({
          width: getComputedStyle(n).width,
          round: getComputedStyle(n, '::before').borderRadius,
        }))
      ).toEqual({ width: '28px', round: '50%' });
      await page
        .locator('summary')
        .filter({ hasText: label('editor.compact.technicalDataTextSettings') })
        .click();
      await page
        .locator(
          '[data-ui="editor.technical-data.text-settings"] [data-ui="shared.ui.color-selector.picker-trigger"]'
        )
        .first()
        .click();
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker"]');
      await page.screenshot({ path: info.outputPath('nearby-color-picker.png'), fullPage: false });
      await checkPicker(picker);
    });
  }
}

for (const locale of ['en', 'ru'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`short editor panel consistency ${locale} ${theme}`, async ({
      page,
      hostOrigin,
    }, info) => {
      await page.setViewportSize({ width: 1280, height: 560 });
      await openEditor(page, hostOrigin, locale, theme);
      const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
      const owner = page.locator('[data-ui="editor.floating.layers-panel"]');
      const scroller = page.locator('[data-ui="editor.floating.inspector-scroll"]');
      const checkBounds = async () => {
        const bounds = (await owner.boundingBox())!;
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(560);
        expect(await scroller.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(
          1
        );
      };
      const capture = async (name: string) => {
        await page.mouse.move(400, 200);
        await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
      };
      for (const mode of [
        'frame',
        'browser-frame',
        'meta',
        'image-size',
        'canvas-size',
        'layers',
      ]) {
        await page.locator(`[data-ui="editor.floating.layers.mode.${mode}"]`).click();
        await expect(owner).toBeVisible();
        if (mode === 'layers') {
          await capture('layers');
          continue;
        }
        if (mode === 'frame') {
          await page.locator('[data-ui="editor.frame.background-mode"] button').nth(1).click();
          await expect(page.locator('[data-ui="editor.frame.paint-presets"]')).toBeVisible();
          const tile = page.locator('[data-ui="editor.frame.paint-presets"] button').first();
          await expect(tile).toHaveCSS('background-clip', 'padding-box');
          const paintBounds = (await tile.boundingBox())!;
          await capture('background-paint');
          await page.locator('[data-ui="editor.frame.background-mode"] button').nth(2).click();
          const image = page.locator('[data-ui="background.image.picker"] img').first();
          await expect(image).toBeVisible();
          const imageBounds = (await image.boundingBox())!;
          expect(Math.abs(paintBounds.height - 2 - imageBounds.height)).toBeLessThanOrEqual(1);
          expect(Math.abs(paintBounds.width - 2 - imageBounds.width)).toBeLessThanOrEqual(1);
          await capture('background-image');
        }
        if (mode === 'browser-frame') {
          for (const kind of ['windowHeader.browser', 'windowHeader.application'] as const) {
            const button = page.getByRole('button', { name: label(kind), exact: true });
            await button.click();
            await expect(button).toHaveAttribute('aria-pressed', 'true');
            await capture(kind);
          }
        }
        if (mode === 'meta') {
          await page.locator('[data-ui="editor.technical-data.field-date"]').check();
          await page.locator('[data-ui="editor.technical-data.field-url"]').check();
        }
        const summaries = page.locator('[data-ui="editor.inspector.disclosure"] > summary');
        for (let i = 0; i < (await summaries.count()); i++) {
          const summary = summaries.nth(i);
          if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
        }
        await checkBounds();
        await scroller.evaluate((n) => {
          n.scrollTop = 0;
        });
        await capture(`${mode}-top`);
        const pickerTrigger = owner
          .locator(
            '[data-ui="shared.ui.color-selector.picker-trigger"], [data-ui="shared.ui.paint-selector.trigger"]'
          )
          .first();
        if (await pickerTrigger.count()) {
          await pickerTrigger.click();
          const picker = page
            .locator(
              '[data-ui="shared.ui.color-selector.picker"], [data-ui="shared.ui.paint-selector.popup"]'
            )
            .first();
          await expect(picker).toBeVisible();
          const box = (await picker.boundingBox())!;
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height).toBeLessThanOrEqual(560);
          await capture(`${mode}-picker`);
          await picker
            .getByRole('button', { name: label('common.actions.cancel'), exact: true })
            .click();
          await expect(picker).toHaveCount(0);
        }
        await scroller.evaluate((n) => {
          n.scrollTop = n.scrollHeight;
        });
        await capture(`${mode}-bottom`);
      }
      for (const tool of ['pencil', 'marker', 'text', 'shape', 'arrow', 'blur', 'simplify']) {
        await page.locator(`[data-ui="editor.floating.tool-rail.${tool}"]`).click();
        const options = page.locator('[data-ui="editor.floating.tool-properties"]');
        await expect(options).toBeVisible();
        const box = (await options.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(560);
        await capture(`tool-${tool}`);
        const swatch = options
          .locator('[data-ui="shared.ui.color-selector.picker-trigger"]')
          .first();
        if (await swatch.count()) {
          await swatch.click();
          const picker = page.locator('[data-ui="shared.ui.color-selector.picker"]');
          await expect(picker).toBeVisible();
          const pickerBox = (await picker.boundingBox())!;
          expect(pickerBox.y).toBeGreaterThanOrEqual(0);
          expect(pickerBox.y + pickerBox.height).toBeLessThanOrEqual(560);
          await capture(`tool-${tool}-picker`);
          await picker
            .getByRole('button', { name: label('common.actions.cancel'), exact: true })
            .click();
        }
      }
      await page.locator('[data-ui="editor.floating.view-controls.workspace"]').click();
      const workspace = page.locator('[data-ui="editor.floating.view-controls.popover.workspace"]');
      await expect(workspace).toBeVisible();
      await capture('workspace');
      const value = workspace.locator('[data-ui="shared.ui.color-selector.value-trigger"]');
      const accepted = await value.textContent();
      await workspace
        .locator('[data-ui="shared.ui.color-selector.picker-trigger"]')
        .first()
        .click();
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker"]');
      await expect(picker).toBeVisible();
      await picker.locator('.sniptale-color-plane').click({ position: { x: 80, y: 50 } });
      await expect(workspace).toBeVisible();
      await capture('workspace-picker');
      await picker
        .getByRole('button', { name: label('common.actions.cancel'), exact: true })
        .click();
      await expect(value).toHaveText(accepted ?? '');
    });
  }
}

for (const { size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`canvas crop keeps locked ratio through resize handles ${size.width}x${size.height}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await page.setViewportSize(size);
    await openEditor(page, hostOrigin, 'en');
    await page.locator('[data-ui="editor.floating.layers.mode.canvas-size"]').click();
    const dimensions = page.locator('[data-size-panel-dimensions]');
    const inputs = dimensions.locator('input');
    const documentWidth = Number(await inputs.nth(0).inputValue());
    const documentHeight = Number(await inputs.nth(1).inputValue());
    await inputs.nth(0).fill('305');
    await inputs.nth(0).press('Enter');
    await inputs.nth(1).fill('229');
    await inputs.nth(1).press('Enter');
    const lock = dimensions.locator('[data-ui="editor.size-controls.aspect-toggle"]');
    await lock.click();
    await expect(lock).toHaveAttribute('aria-pressed', 'true');
    const controls = page.locator('[data-ui="editor.canvas.selection-controls"] circle');
    await expect(controls).toHaveCount(4);
    const drag = async (edge: boolean, dx: number, dy: number) => {
      const points = await controls.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })
      );
      const x = Math.max(...points.map((point) => point.x));
      const bottom = Math.max(...points.map((point) => point.y));
      const top = Math.min(...points.map((point) => point.y));
      const y = edge ? (bottom + top) / 2 : bottom;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 8 });
      await page.mouse.up();
    };
    const checkRatio = async (ratio: number) => {
      await expect
        .poll(async () =>
          Math.abs(
            Number(await inputs.nth(0).inputValue()) -
              Number(await inputs.nth(1).inputValue()) * ratio
          )
        )
        .toBeLessThanOrEqual((1 + ratio) / 2 + 0.01);
    };
    await drag(true, 55, 0);
    await checkRatio(4 / 3);
    const beforeCenteredWidth = Number(await inputs.nth(0).inputValue());
    await page.keyboard.down('Control');
    await drag(false, -30, 0);
    await page.keyboard.up('Control');
    await expect
      .poll(async () => Number(await inputs.nth(0).inputValue()))
      .toBeLessThan(beforeCenteredWidth);
    await checkRatio(4 / 3);
    await page.keyboard.down('Shift');
    await drag(false, -40, -8);
    await page.keyboard.up('Shift');
    await checkRatio(4 / 3);
    const modes = page.locator('[data-ui="shared.ui.compact-inspector.segmented-row"] button');
    await modes.nth(1).click();
    await expect(inputs.nth(0)).toHaveValue(String(documentWidth));
    await expect(inputs.nth(1)).toHaveValue(String(documentHeight));
    await expect(controls).toHaveCount(4);
    await drag(false, -25, -5);
    await checkRatio(documentWidth / documentHeight);
    await modes.nth(0).click();
    await page.locator('[data-ui="editor.floating.layers.collapse-button"]').click();
    await page
      .locator(
        '[data-ui="editor.floating.layers-collapsed-toolbar"] [data-ui="editor.floating.layers.mode.canvas-size"]'
      )
      .click();
    await expect(lock).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByRole('button', {
        name: translate('editor.compact.aspectRatioPreset', 'en'),
        exact: true,
      })
      .click();
    await page.getByRole('option', { name: '16:9', exact: true }).click();
    await checkRatio(16 / 9);
    await expect
      .poll(async () => {
        const points = await controls.evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          })
        );
        const width =
          Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
        const height =
          Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
        return Math.abs(width / height - 16 / 9);
      })
      .toBeLessThan(0.02);
    await drag(false, 20, 12);
    await checkRatio(16 / 9);
    await page.screenshot({ path: info.outputPath('crop-ratio-locked.png'), fullPage: false });
    await lock.click();
    const beforeWidth = Number(await inputs.nth(0).inputValue());
    const beforeHeight = Number(await inputs.nth(1).inputValue());
    await drag(true, -30, 0);
    await expect
      .poll(async () => Number(await inputs.nth(0).inputValue()))
      .toBeLessThan(beforeWidth);
    expect(Number(await inputs.nth(1).inputValue())).toBe(beforeHeight);
  });
}
