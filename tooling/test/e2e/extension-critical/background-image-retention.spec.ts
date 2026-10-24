import { materializeWorkspaceStorage } from '../../../../apps/extension/src/composition/persistence/review-workspaces/storage-format';
import { expect, test, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

async function savedBackground(page: Page) {
  const result = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['video_workspaces', 'video_workspace_history', 'project_assets']);
    const workspaces = tx.objectStore('video_workspaces').getAll();
    const history = tx
      .objectStore('video_workspace_history')
      .index('aggregateId')
      .getAll('recording:beta-v1-recording');
    const assets = tx.objectStore('project_assets').count();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return { head: workspaces.result[0], rows: history.result, assets: assets.result };
  });
  const workspace = parseVideoWorkspace(materializeWorkspaceStorage(result.head, result.rows));
  if (!workspace) return null;
  const document = replayReviewHistory(
    workspace.history,
    workspace.cursor,
    workspace.source,
    reviewAdvancedContentBaseline(workspace.advanced)
  );
  return { background: document.advancedContent.background, assets: result.assets };
}

test('custom background survives paint switches and reopening without duplicate assets', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    const dialog = page.locator('dialog');
    await dialog
      .getByRole('button', {
        name: translate('gallery.videoReview.advancedEditing', 'en'),
        exact: true,
      })
      .click();
    await dialog.getByRole('button', { name: 'Scene', exact: true }).click();
    const mode = (name: string) =>
      dialog.locator('.review-background-kinds').getByRole('button', { name, exact: true });
    await mode('Image').click();
    await page.locator('[data-ui="background.image.picker"] input[type="file"]').setInputFiles({
      name: 'retained.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#15803d"/></svg>'
      ),
    });
    await expect
      .poll(async () => (await savedBackground(page))?.background)
      .toMatchObject({ type: 'image' });
    const original = await savedBackground(page);
    if (!original?.background.enabled || original.background.type !== 'image')
      throw new Error('No imported image');
    const image = { assetId: original.background.assetId, imageFit: original.background.imageFit };
    const gradient = async () => {
      await mode(translate('gallery.videoReview.backgroundSolid', 'en')).click();
      await dialog
        .locator('.review-background-paint [data-ui="shared.ui.paint-selector.trigger"]')
        .click();
      const picker = page.locator('[data-ui="shared.ui.paint-selector.popup"]');
      await picker
        .getByRole('button', {
          name: translate('highlighter.paintPicker.gradient', 'en'),
          exact: true,
        })
        .click();
      await picker
        .getByRole('button', {
          name: translate('highlighter.paintPicker.linear', 'en'),
          exact: true,
        })
        .click();
      await expect(picker).toHaveCSS('width', '620px');
      await page.screenshot({
        path: info.outputPath('background-gradient-picker.png'),
        fullPage: false,
      });
      await picker
        .getByRole('button', { name: translate('shared.ui.colorSelectorApply', 'en'), exact: true })
        .click();
      await expect
        .poll(async () => (await savedBackground(page))?.background)
        .toMatchObject({ type: 'gradient' });
    };
    for (const kind of ['gradient', 'solid', 'none'] as const) {
      if (kind === 'gradient') await gradient();
      else
        await mode(
          translate(
            kind === 'solid'
              ? 'gallery.videoReview.backgroundSolid'
              : 'gallery.videoReview.backgroundNone',
            'en'
          )
        ).click();
      await expect
        .poll(async () => (await savedBackground(page))?.background.rememberedImage)
        .toEqual(image);
      await mode('Image').click();
      await expect
        .poll(async () => (await savedBackground(page))?.background)
        .toMatchObject({ type: 'image', ...image });
    }
    await gradient();
    await expect
      .poll(async () => (await savedBackground(page))?.background.rememberedImage)
      .toEqual(image);
    await dialog
      .getByRole('button', { name: translate('common.actions.close', 'en'), exact: true })
      .click();
    await page.reload();
    await page
      .getByRole('button', {
        name: new RegExp(`^${translate('gallery.preview.folderRecording', 'en')} \\d+$`),
      })
      .click();
    const recording = page.getByRole('group', { name: 'beta-v1.webm', exact: true });
    await expect(recording).toHaveCount(1);
    await recording.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await dialog.getByRole('button', { name: 'Scene', exact: true }).click();
    await mode('Image').click();
    await expect
      .poll(async () => (await savedBackground(page))?.background)
      .toMatchObject({ type: 'image', ...image });
    expect((await savedBackground(page))?.assets).toBe(original.assets);
    expect(
      await page.evaluate(
        async () =>
          (await window.__sniptaleHarness?.getMediaLibraryState())?.filter((item) =>
            item.mimeType.startsWith('image/')
          ).length
      )
    ).toBe(0);
    await page.screenshot({
      path: info.outputPath('restored-custom-background.png'),
      fullPage: false,
    });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
