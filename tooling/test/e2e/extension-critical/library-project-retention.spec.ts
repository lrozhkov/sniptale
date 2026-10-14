import { expect, test } from '@playwright/test';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { startHostServer } from '../support/host-server';
import { addReviewFocus, seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

test('lists a saved native quick-edit project after Gallery reload', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  const host = await startHostServer();
  const id = betaV1Fixture.records.media_library[0]!.id;
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: {
        'sniptale-locale-preference': 'en',
        'sniptale-theme-preference': 'light',
      },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?locale=en&theme=light`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', {
      width: 160,
      height: 90,
      duration: 12.01,
    });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    expect(await readNativeReviewWorkspace(page, id)).toBeNull();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    const dialog = page.locator('dialog');
    const advanced = dialog.getByRole('button', { name: 'Advanced editing', exact: true });
    await expect(advanced).toBeVisible();
    if ((await advanced.getAttribute('aria-pressed')) !== 'true') await advanced.click();
    await addReviewFocus(page);
    await expect
      .poll(async () => (await readNativeReviewWorkspace(page, id))?.history.length ?? 0)
      .toBeGreaterThan(0);
    await page.reload();
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    expect(await readNativeReviewWorkspace(page, id)).not.toBeNull();
    await page.screenshot({
      path: info.outputPath('saved-quick-edit-catalogue.png'),
      fullPage: false,
    });
    const projects = page
      .locator('[data-gallery-folder="video-project"]')
      .getByRole('button')
      .first();
    test.fail(true, 'The accepted retention plan must add saved quick-edit project cards.');
    await expect(projects).toBeVisible();
    await projects.click();
    await expect(
      page
        .locator('[data-ui="gallery.content.surface"]')
        .getByRole('button', { name: 'beta-v1.webm', exact: true })
    ).toHaveCount(1);
  } finally {
    await page.close();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
