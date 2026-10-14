import { expect, test } from '@playwright/test';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { startHostServer } from '../support/host-server';
import { addReviewFocus, seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`lists and reopens a saved native quick-edit project at ${viewport.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const host = await startHostServer();
    const id = betaV1Fixture.records.media_library[0]!.id;
    const theme = viewport.width === 1920 ? 'dark' : 'light';
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': 'en',
          'sniptale-theme-preference': theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?locale=en&theme=${theme}`);
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
      const projects = page
        .locator('[data-gallery-folder="video-project"]')
        .getByRole('button')
        .first();
      await expect(projects).toBeVisible();
      await projects.click();
      await expect(
        page
          .locator('[data-ui="gallery.content.surface"]')
          .locator(`[data-gallery-keyboard-id="quick-edit-project:${id}"]`)
      ).toHaveCount(1);
      await page.screenshot({
        path: info.outputPath('saved-quick-edit-catalogue.png'),
        fullPage: false,
      });
      const saved = await readNativeReviewWorkspace(page, id);
      await page.getByRole('button', { name: 'Open in editor', exact: true }).first().click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
        )
        .toBe(1);
      const [tab] = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
      const target = new URL(tab!.url!);
      expect(target.searchParams.get('mediaId')).toBe(id);
      expect(target.searchParams.get('mode')).toBe('edit');
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}${target.search}`);
      await expect(
        page.locator('dialog').getByRole('button', { name: 'Advanced editing', exact: true })
      ).toBeVisible();
      expect((await readNativeReviewWorkspace(page, id))?.history).toEqual(saved?.history);
      await page.screenshot({ path: info.outputPath('reopened-quick-edit.png'), fullPage: false });
    } finally {
      await page.close();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
