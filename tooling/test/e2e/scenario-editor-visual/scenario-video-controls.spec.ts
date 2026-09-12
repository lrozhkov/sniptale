import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`video rows and draft controls in ${theme}`, async ({ page, hostOrigin }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1024, height: 640 });
    const url = new URL(page.url());
    url.searchParams.set('videoFixture', '1');
    url.searchParams.set('actionFixture', '1');
    await page.goto(url.toString());
    await page.getByRole('button', { name: 'Resources', exact: true }).click();
    await page
      .locator('#guide-library-panel')
      .getByRole('button', { name: 'Image library', exact: true })
      .click();
    const drawer = page.getByRole('dialog', { name: 'Resources', exact: true });
    await drawer.getByRole('button', { name: 'Video', exact: true }).click();
    const row = drawer.getByRole('button', { name: 'Library motion.webm', exact: true });
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    const layout = await row.evaluate((node) => ({
      row: getComputedStyle(node).flexDirection,
      columns: getComputedStyle(node.parentElement!).gridTemplateColumns.split(' ').length,
    }));
    expect(layout).toEqual({ row: 'row', columns: 1 });
    await expect(drawer.getByRole('button', { name: 'Start dictation', exact: true })).toHaveCount(
      2
    );
    await drawer.getByRole('button', { name: '0.20 · Ctrl + K', exact: true }).click();
    await expect
      .poll(() =>
        drawer
          .locator('video')
          .evaluate((video) => !video.seeking && Math.abs(video.currentTime - 0.2) < 0.01)
      )
      .toBe(true);
    const action = drawer.getByRole('button', { name: '1.20 · Open settings', exact: true });
    await action.click();
    await expect
      .poll(() =>
        drawer
          .locator('video')
          .evaluate((video) => !video.seeking && Math.abs(video.currentTime - 1.2) < 0.01)
      )
      .toBe(true);
    await action.hover();
    await expect(drawer.locator('.guide-video-click-point')).toBeVisible();
    const fields = drawer.locator('.guide-video-field input, .guide-video-field textarea');
    await expect(fields).toHaveCount(2);
    for (let index = 0; index < 2; index++) {
      const field = fields.nth(index);
      await field.fill('Temporary draft');
      await drawer
        .locator('.guide-video-field')
        .nth(index)
        .getByRole('button', { name: /^Clear text:/ })
        .click();
      await expect(field).toHaveValue('');
      await expect(field).toBeFocused();
    }
    await fields.nth(0).fill('Captured title');
    await fields.nth(1).fill('Captured description');
    const capture = drawer.getByRole('button', { name: 'Add frame as step', exact: true });
    await expect(capture).toBeEnabled();
    await expect(capture).toBeInViewport();
    await testInfo.attach(`video-controls-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await capture.click();
    await expect(page.locator('main article')).toHaveCount(3);
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(
      page.locator('main article').last().locator('textarea.guide-step-title')
    ).toHaveValue('Captured title');
  });
}
