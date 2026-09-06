import { expect, type Page } from '@playwright/test';

/** Actual extension geometry: pane docking changes available timeline space without a second toolbar. */
export async function expectVideoEditorPanelLayout(page: Page): Promise<void> {
  await expectLibraryDrawerPlacement(page);
  const chrome = page.locator('[data-ui="video-editor.floating-workspace"]');
  expect((await chrome.boundingBox())!.height).toBeLessThanOrEqual(70);
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
  const trigger = page.locator('[data-ui="video-editor.floating.document-bar.library"]');
  await trigger.click();
  const drawer = page.locator('[data-ui="video-editor.library.drawer"]');
  await expect(drawer).toBeVisible();
  const bounds = (await drawer.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  await drawer.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'New', exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
}
