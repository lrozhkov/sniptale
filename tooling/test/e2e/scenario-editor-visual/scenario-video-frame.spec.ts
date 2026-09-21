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
  const title = [
    'imports local videos through the library and retains captured frames after source deletion in',
    theme,
  ].join(' ');
  test(title, async ({ page, hostOrigin }, testInfo) => {
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
    const upload = async (name: string) => {
      await page.goto(`${hostOrigin}${GALLERY_HARNESS_PATH}`);
      await page.locator('input[type="file"][accept*="video/"]').setInputFiles({
        name,
        mimeType: 'video/webm',
        buffer: await readFile(fixture),
      });
      await expect(page.getByRole('button', { name, exact: true }).first()).toBeVisible();
      await page.goto(guideUrl);
    };
    const open = async (name: string) => {
      await page.getByRole('button', { name: 'Resources', exact: true }).click();
      await page
        .locator('#guide-library-panel')
        .getByRole('button', { name: 'Image library', exact: true })
        .click();
      const drawer = page.locator('#guide-resource-drawer');
      await drawer.getByRole('button', { name: 'Video', exact: true }).click();
      await drawer.getByRole('button', { name, exact: true }).click();
      return drawer;
    };
    const localName = `local-${id}.webm`;
    await upload(localName);
    let drawer = await open(localName);
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
    await page.goto(guideUrl);
    await expect(page.locator('article')).toHaveCount(3);
    await expect(page.locator('article').last().locator('.guide-description')).toHaveValue(
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
    await upload(libraryName);
    await expect(page.locator('article')).toHaveCount(3);
    drawer = await open(libraryName);
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
    await expect(page.getByRole('textbox', { name: 'Step title', exact: true }).last()).toHaveValue(
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
