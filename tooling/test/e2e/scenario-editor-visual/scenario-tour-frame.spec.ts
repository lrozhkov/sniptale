import { expect, type Locator } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

async function expectFittedFrame(player: Locator) {
  const viewport = player.locator('.tour-viewport');
  const stage = player.locator('.tour-stage');
  await expect(stage).toBeVisible();
  await expect(viewport).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(viewport).toHaveCSS('border-top-width', '0px');
  await expect(stage).toHaveCSS('border-top-width', '1px');
  await expect
    .poll(() =>
      stage.evaluate((node) => getComputedStyle(node.closest('#tour-player')!).backgroundColor)
    )
    .toBe('rgba(0, 0, 0, 0)');
  await expect
    .poll(async () => {
      const outer = await viewport.boundingBox();
      const frame = await stage.boundingBox();
      if (!outer || !frame) return false;
      return (
        Math.abs(frame.width / frame.height - 16 / 9) < 0.01 &&
        frame.width <= outer.width + 1 &&
        frame.height <= outer.height + 1 &&
        Math.abs(frame.width - outer.width) < 2 &&
        Math.abs(frame.height - outer.height) < 2
      );
    })
    .toBe(true);
  const toolbar = player.locator('.tour-toolbar');
  if (await toolbar.isVisible()) {
    const frameBox = await stage.boundingBox();
    const toolbarBox = await toolbar.boundingBox();
    expect(toolbarBox!.y - frameBox!.y - frameBox!.height).toBeGreaterThanOrEqual(0);
    expect(toolbarBox!.y - frameBox!.y - frameBox!.height).toBeLessThan(8);
    await expect(player.locator('.tour-scene')).toHaveCSS('opacity', '1');
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`tour frame fits its content without letterboxing in ${theme}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(
      page,
      hostOrigin,
      theme,
      'en',
      { width: 1280, height: 900 },
      'compare',
      { tourFixture: '1' }
    );
    await page.getByRole('button', { name: 'Interactive tour', exact: true }).click();
    const host = page.locator('.tour-stage-host');
    await expectFittedFrame(host);
    const surface = await page
      .locator('.guide-center-panel')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    await expect(page.locator('.tour-canvas')).toHaveCSS('background-color', surface);
    await info.attach(`authoring-frame-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: 'Preview', exact: true })
      .click();
    for (const size of [
      { width: 1280, height: 900 },
      { width: 1920, height: 640 },
    ]) {
      await page.setViewportSize(size);
      await expectFittedFrame(host);
      await info.attach(`preview-frame-${theme}-${size.width}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: 'Prepare and preview', exact: true })
      .click();
    const exported = page
      .frameLocator('.tour-export-frame iframe')
      .frameLocator('iframe')
      .locator('#tour-player');
    await expectFittedFrame(exported);
    await page.setViewportSize({ width: 1024, height: 900 });
    await expectFittedFrame(exported);
    await info.attach(`export-frame-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    issues.assertClean();
  });
}
