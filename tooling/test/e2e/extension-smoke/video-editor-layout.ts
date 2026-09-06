import { expect, type Page } from '@playwright/test';

/** Actual extension geometry: pane docking changes available timeline space without a second toolbar. */
export async function expectVideoEditorPanelLayout(page: Page): Promise<void> {
  await expectLibraryDrawerPlacement(page);
  const importTrigger = page.locator('[data-ui="video-editor.materials.import"]');
  await importTrigger.click();
  const importMenu = page.locator('[data-ui="video-editor.materials.import-menu"]');
  await expect(importMenu).toBeVisible();
  const menuBox = (await importMenu.boundingBox())!;
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press('Escape');
  await expect(importMenu).toHaveCount(0);
  await expect(importTrigger).toBeFocused();
  const chrome = page.locator('[data-ui="video-editor.floating-workspace"]');
  await expect(chrome).toHaveCount(0);
  const viewerHeader = page.locator('[data-ui="video.preview.header"]');
  expect((await viewerHeader.boundingBox())!.y).toBeLessThan(20);
  await expect(
    viewerHeader.locator('[data-ui="video-editor.floating.document-bar"]')
  ).toBeVisible();
  await expect(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]')).toHaveCount(1);
  await expect(page.locator('[data-ui="video-editor.timeline.toolbar.redo"]')).toHaveCount(1);
  await expect(chrome.locator('[data-ui$=".undo"], [data-ui$=".redo"]')).toHaveCount(0);
  const materials = page.locator('[data-ui="video-editor.materials"]');
  const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
  const timeline = page.locator('[data-ui="video-editor.timeline.surface"]');
  const leftDock = materials.locator('[data-ui="video-editor.materials.dock-toggle"]');
  const rightDock = inspector.locator('[data-ui="video-editor.inspector.dock-toggle"]');
  for (const [left, right] of [
    [false, false],
    [true, false],
    [true, true],
    [false, true],
    [false, false],
  ]) {
    if (((await leftDock.getAttribute('aria-pressed')) === 'true') !== left) await leftDock.click();
    if (((await rightDock.getAttribute('aria-pressed')) === 'true') !== right)
      await rightDock.click();
    await expectTimelineToolbarControls(page);
    if (left && right) await expectTrackMenuPlacement(page);
    const leftBox = (await materials.boundingBox())!;
    const rightBox = (await inspector.boundingBox())!;
    const timelineBox = (await timeline.boundingBox())!;
    expect(timelineBox.x).toBeCloseTo(left ? leftBox.x + leftBox.width + 8 : leftBox.x, 0);
    expect(timelineBox.x + timelineBox.width).toBeCloseTo(
      right ? rightBox.x - 8 : rightBox.x + rightBox.width,
      0
    );
    if (left) expect(leftBox.y + leftBox.height).toBeCloseTo(timelineBox.y + timelineBox.height, 0);
    if (right)
      expect(rightBox.y + rightBox.height).toBeCloseTo(timelineBox.y + timelineBox.height, 0);
  }
  await expectAdaptivePaneDefaults(page);
  const separator = page.locator('[data-ui="video-editor.workspace.timeline-resize-zone"]');
  const viewer = page.locator('[data-ui="video-editor.workspace.viewer"]');
  const initialHeight = (await viewer.boundingBox())!.height;
  await separator.press('ArrowUp');
  expect((await viewer.boundingBox())!.height).toBeLessThan(initialHeight);
  await separator.dblclick();
  expect((await viewer.boundingBox())!.height).toBeCloseTo(initialHeight, 0);
}

async function expectAdaptivePaneDefaults(page: Page): Promise<void> {
  const originalViewport = page.viewportSize()!;
  for (const [width, height, materialsWidth, inspectorWidth] of [
    [1280, 720, 240, 320],
    [1920, 1080, 320, 400],
    [2560, 1440, 360, 440],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expectWidthReset(page, 'video-editor.materials.resize', 'ArrowLeft', materialsWidth);
    await expectWidthReset(
      page,
      'video-editor.floating.context-inspector.resize',
      'ArrowRight',
      inspectorWidth
    );
    await expectTimelineToolbarControls(page);
    const title = (await page
      .locator('[data-ui="video-editor.workspace.sidebar-header-title-row"]')
      .boundingBox())!;
    const viewerHeader = (await page.locator('[data-ui="video.preview.header"]').boundingBox())!;
    expect(title.y + title.height).toBeCloseTo(viewerHeader.y + viewerHeader.height - 1, 0);
    const docks = [
      page.locator('[data-ui="video-editor.materials.dock-toggle"]'),
      page.locator('[data-ui="video-editor.inspector.dock-toggle"]'),
    ];
    for (const dock of docks) await dock.click();
    await expectTimelineToolbarControls(page);
    for (const dock of docks) await dock.click();
  }
  await page.setViewportSize(originalViewport);
}

async function expectWidthReset(
  page: Page,
  selector: string,
  key: string,
  width: number
): Promise<void> {
  const separator = page.locator(`[data-ui="${selector}"]`);
  await expect(separator).toHaveAttribute('aria-valuenow', String(width));
  await separator.press(key);
  await expect(separator).toHaveAttribute('aria-valuenow', String(width - 24));
  await separator.hover();
  expect(await separator.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)'
  );
  await separator.dblclick();
  await expect(separator).toHaveAttribute('aria-valuenow', String(width));
}

async function expectTimelineToolbarControls(page: Page): Promise<void> {
  const toolbar = page.locator('[data-ui="video-editor.timeline.toolbar"]');
  await expect(toolbar.locator('[data-playback-counter]')).toHaveCount(1);
  await expect(page.locator('[data-ui="video-editor.viewer.transport"]')).toHaveCount(0);
  const settings = page.locator('[data-ui="video.preview.controls"]');
  if (await settings.isVisible()) {
    const controlsBox = (await settings.boundingBox())!;
    const viewportBox = (await page.locator('[data-ui="video.preview.viewport"]').boundingBox())!;
    expect(controlsBox.y + controlsBox.height).toBeLessThanOrEqual(viewportBox.y);
  }
  const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
  const rail = inspector.locator('nav').first();
  if (await rail.isVisible()) {
    const panelBox = (await inspector.boundingBox())!;
    const railBox = (await rail.boundingBox())!;
    const iconBox = (await rail.locator('button').first().boundingBox())!;
    const left = iconBox.x - panelBox.x - 1;
    const right = railBox.x + railBox.width - iconBox.x - iconBox.width - 1;
    expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
  }
  const width = (await toolbar.boundingBox())!.width;
  if (width >= 1000) {
    const minimum = width >= 1400 ? 36 : 32;
    const buttons = toolbar.locator('button:visible');
    for (const button of await buttons.all()) {
      if ((await button.evaluate((node) => getComputedStyle(node).visibility)) === 'hidden')
        continue;
      await expect
        .poll(async () => (await button.boundingBox())!.height)
        .toBeGreaterThanOrEqual(minimum);
      await expect
        .poll(async () => (await button.boundingBox())!.width)
        .toBeGreaterThanOrEqual(minimum);
    }
  }
  const controls = await toolbar.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return [...node.querySelectorAll<HTMLElement>('button, input')]
      .filter(
        (control) =>
          getComputedStyle(control).visibility !== 'hidden' &&
          control.getBoundingClientRect().width > 0
      )
      .map((control) => {
        const rect = control.getBoundingClientRect();
        return {
          name: control.getAttribute('aria-label') ?? control.title,
          left: rect.left,
          right: rect.right,
          min: bounds.left,
          max: bounds.right,
        };
      })
      .sort((a, b) => a.left - b.left);
  });
  for (const [index, control] of controls.entries()) {
    expect(control.left, control.name).toBeGreaterThanOrEqual(control.min);
    expect(control.right, control.name).toBeLessThanOrEqual(control.max);
    if (index > 0)
      expect(controls[index - 1]!.right, control.name).toBeLessThanOrEqual(control.left + 0.5);
  }
}

async function expectTrackMenuPlacement(page: Page): Promise<void> {
  const trigger = page.locator('[data-ui="video-editor.timeline.toolbar.add-track"]');
  await trigger.click();
  const menu = page.locator('[data-ui="video-editor.timeline.toolbar.add-track.choices"]');
  await expect(menu).toBeVisible();
  const bounds = (await menu.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  await expect(menu.locator('button')).toHaveCount(3);
  await menu.locator('button').first().focus();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

async function expectLibraryDrawerPlacement(page: Page): Promise<void> {
  const title = page.locator(
    '[data-ui="video-editor.floating.document-bar"] input:not([type="file"])'
  );
  const previousTitle = await title.inputValue();
  const longTitle =
    'Library layout proof — a long project title that must not overlap navigation or search';
  await title.fill(longTitle);
  const trigger = page.locator('[data-ui="video-editor.materials.library"]');
  await trigger.click();
  const drawer = page.locator('[data-ui="video-editor.library.drawer"]');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('[data-ui="video-editor.library.current-project"]')).toContainText(
    longTitle
  );
  await expect
    .poll(() =>
      drawer.evaluate((node) => {
        const strip = node.querySelector('[data-ui="video-editor.library.current-project"]')!;
        const main = node.querySelector('main')!;
        return main.getBoundingClientRect().left - strip.getBoundingClientRect().right;
      })
    )
    .toBeGreaterThanOrEqual(0);
  const bounds = (await drawer.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  await drawer.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'New', exact: true })).toBeInViewport();
  await page.evaluate(() => chrome.storage.local.set({ 'sniptale-locale-preference': 'ru' }));
  await expect(drawer.getByRole('button', { name: 'Добавить', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      drawer
        .locator('aside button span.truncate')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.scrollWidth > node.clientWidth)
            .map((node) => node.textContent)
        )
    )
    .toEqual([]);
  await page.evaluate(() => chrome.storage.local.set({ 'sniptale-locale-preference': 'en' }));
  await expect(drawer.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await title.fill(previousTitle);
  await trigger.focus();
}
