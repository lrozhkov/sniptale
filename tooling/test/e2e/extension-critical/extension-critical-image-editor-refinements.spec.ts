import { translate } from '../../../../apps/extension/src/platform/i18n';
import type { Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

test.use({ actionTimeout: 10000 });

async function openEditor(page: Page, hostOrigin: string, locale: 'en' | 'ru') {
  await applyHarnessBootstrap(page, {
    storage: {
      'sniptale-locale-preference': locale,
      'sniptale-theme-preference': page.viewportSize()?.width === 1920 ? 'dark' : 'light',
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
