import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test } from '../support/extension-fixture';
import {
  GALLERY_HARNESS_PATH,
  SCENARIO_EDITOR_VISUAL_HARNESS_PATH,
  applyHarnessBootstrap,
} from '../extension-critical.helpers';
const fixture = fileURLToPath(new URL('../fixtures/cache-source.webm', import.meta.url));

for (const theme of ['light', 'dark'] as const) {
  test(`adds a local and library video frame and keeps both after reopen in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await applyHarnessBootstrap(page, { preserveMediaLibrary: true });
    await page.setViewportSize({ width: 1024, height: 640 });
    const id = crypto.randomUUID();
    const url = new URL(`${hostOrigin}${SCENARIO_EDITOR_VISUAL_HARNESS_PATH}`);
    url.search = new URLSearchParams({
      projectId: id,
      theme,
      locale: 'en',
      stepId: 'compare',
    }).toString();
    await page.goto(url.toString());
    await expect(page.locator('article')).toHaveCount(2);
    const libraryName = `library-${id}.webm`;
    const guideUrl = page.url();
    const open = async () => {
      await page.getByRole('button', { name: 'Resources', exact: true }).click();
      await page.getByRole('button', { name: 'Image library', exact: true }).click();
      const drawer = page.locator('#guide-resource-drawer');
      await drawer
        .getByRole('group', { name: 'Resource type' })
        .getByRole('button', { name: 'Videos', exact: true })
        .click();
      return drawer;
    };
    let drawer = await open();
    await drawer.locator('input[type="file"][accept="video/*"]').setInputFiles(fixture);
    const video = drawer.locator('video');
    await expect.poll(() => video.evaluate((node) => node.readyState)).toBeGreaterThanOrEqual(2);
    await video.evaluate((node) => {
      node.currentTime = 0.25;
    });
    await expect
      .poll(() => video.evaluate((node) => !node.seeking && node.readyState >= 2))
      .toBe(true);
    await drawer
      .getByRole('textbox', { name: 'Step title', exact: true })
      .fill('Local video frame');
    await drawer
      .getByRole('textbox', { name: 'Text', exact: true })
      .fill('A selected moment from the source.');
    await testInfo.attach(`video-source-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await drawer.getByRole('button', { name: 'Add frame as step', exact: true }).click();
    await expect(drawer.getByRole('status')).toContainText('Frame added');
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('article')).toHaveCount(3);
    await page.reload();
    await expect(page.locator('article')).toHaveCount(3);
    await expect(page.locator('article').last()).toContainText(
      'A selected moment from the source.'
    );
    await expect
      .poll(() =>
        page
          .locator('article')
          .last()
          .locator('img')
          .evaluate((node) => node.complete && node.naturalWidth > 0)
      )
      .toBe(true);
    await page.goto(`${hostOrigin}${GALLERY_HARNESS_PATH}`);
    await page.locator('input[type="file"][accept*="video/"]').setInputFiles({
      name: libraryName,
      mimeType: 'video/webm',
      buffer: await readFile(fixture),
    });
    await expect(
      page.getByRole('button', { name: libraryName, exact: true }).first()
    ).toBeVisible();
    await page.goto(guideUrl);
    await expect(page.locator('article')).toHaveCount(3);
    drawer = await open();
    await drawer.getByRole('button', { name: libraryName, exact: true }).click();
    await expect
      .poll(() => drawer.locator('video').evaluate((node) => node.readyState))
      .toBeGreaterThanOrEqual(2);
    await drawer
      .getByRole('textbox', { name: 'Step title', exact: true })
      .fill('Library video frame');
    await drawer.getByRole('button', { name: 'Add frame as step', exact: true }).click();
    await expect(drawer.getByRole('status')).toContainText('Frame added');
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await page.goto(`${hostOrigin}${GALLERY_HARNESS_PATH}`);
    await page.getByRole('button', { name: libraryName, exact: true }).first().click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('alertdialog', { name: 'Confirm deletion', exact: true })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(page.getByRole('button', { name: libraryName, exact: true })).toHaveCount(0);
    await page.goto(guideUrl);
    await expect(page.locator('article')).toHaveCount(4);
    await expect(page.getByRole('textbox', { name: 'Step title', exact: true }).last()).toHaveText(
      'Library video frame'
    );
    await expect
      .poll(() =>
        page
          .locator('article')
          .last()
          .locator('img')
          .evaluate((node) => node.complete && node.naturalWidth > 0)
      )
      .toBe(true);
  });
}
