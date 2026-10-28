import { readFile } from 'node:fs/promises';
import { test, openProvider, saveProof } from './webdav-fixtures';
import { expect } from '@playwright/test';
import { applyHarnessBootstrap } from '../extension-critical.helpers';
import { translate } from '../../../../apps/extension/src/platform/i18n';

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`native default and archived review cross WebDAV and remain editable ${viewport.width}`, async ({
    lab,
  }, info) => {
    test.setTimeout(180_000);
    const bytes = Array.from(
      await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url))
    );
    const sender = await openProvider(lab, info, 'review-source');
    let sent;
    try {
      sent = await sender.page.evaluate(async (bytes) => {
        const api = window.webdavTransferHarness.review;
        const seeded = await api.seed(bytes);
        const original = await api.outgoing.sendHistory(seeded.mediaId, false, 'media');
        const current = await api.outgoing.sendHistory(seeded.mediaId, false, 'video-review');
        const archive = await api.outgoing.sendHistory(seeded.archiveId, false, 'video-review');
        const all = [...original, ...current, ...archive];
        return { ...seeded, attempts: all.length, objects: all.flatMap((item) => item.files) };
      }, bytes);
      for (const object of sent.objects)
        expect(await lab.externalProof(object.key)).toEqual({
          size: object.size,
          sha256: object.sha256,
        });
    } finally {
      await sender.context.close();
    }
    let target = await openProvider(lab, info, 'review-target');
    try {
      const counts = lab.proxy.counts.gets;
      const catalog = await target.page.evaluate(
        (spaceId) => window.webdavTransferHarness.review.outgoing.scan(spaceId),
        sent.spaceId
      );
      expect(catalog.invalid).toEqual([]);
      expect(catalog.pending).toEqual([]);
      expect(catalog.quarantined).toEqual([]);
      expect(catalog.roots).toHaveLength(3);
      expect(lab.proxy.counts.gets - counts).toBe(sent.attempts);
      await target.page.evaluate(async (input) => {
        const api = window.webdavTransferHarness.review;
        await api.outgoing.receive(input.spaceId, 'media', input.mediaId);
        await api.outgoing.receive(input.spaceId, 'video-review', input.mediaId);
        await api.outgoing.receive(input.spaceId, 'video-review', input.archiveId);
      }, sent);
      const admitted = await target.page.evaluate(
        async (input) => ({
          default: await window.webdavTransferHarness.review.proof(input.mediaId),
          archive: await window.webdavTransferHarness.review.proof(input.archiveId),
        }),
        sent
      );
      expect(admitted).toEqual({ default: sent.default, archive: sent.archive });
      expect(admitted.archive.fakeLibraryRow).toBe(false);
      expect(admitted.archive.resources).toHaveLength(1);
      expect(admitted.archive.resources[0]?.private).toBe(true);
      await target.context.close();
      target = await openProvider(lab, info, 'review-target');
      expect(
        await target.page.evaluate(
          async (input) => ({
            default: await window.webdavTransferHarness.review.proof(input.mediaId),
            archive: await window.webdavTransferHarness.review.proof(input.archiveId),
          }),
          sent
        )
      ).toEqual(admitted);
      await target.page.evaluate(async (input) => {
        const api = window.webdavTransferHarness.review;
        await api.outgoing.scan(input.spaceId);
        await api.outgoing.receive(input.spaceId, 'video-review', input.archiveId);
      }, sent);
      await target.page.setViewportSize(viewport);
      await applyHarnessBootstrap(target.page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await target.page.goto(
        `chrome-extension://${target.extensionId}/tooling/test/harness/gallery.html`
      );
      await expect(target.page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
      await target.page
        .getByRole('button', { name: 'Renamed review original.webm', exact: true })
        .first()
        .click();
      await target.page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = target.page.locator('[data-ui="gallery.videoReview.dialog"]');
      await expect(dialog).toBeVisible();
      await dialog.locator('[data-ui="gallery.videoReview.modeChoice.advanced"]').click();
      await expect(
        dialog
          .locator('[data-ui="gallery.videoReview.manualPreview"] canvas:visible, video:visible')
          .first()
      ).toBeVisible();
      await dialog
        .getByRole('button', { name: translate('gallery.videoReview.play', 'en'), exact: true })
        .click();
      await expect
        .poll(() =>
          dialog
            .locator('video')
            .first()
            .evaluate((node) => {
              if (!(node instanceof HTMLVideoElement))
                throw new Error('Review source is not a video.');
              return node.currentTime;
            })
        )
        .toBeGreaterThan(0.25);
      await dialog
        .getByRole('button', { name: translate('gallery.videoReview.pause', 'en'), exact: true })
        .click();
      await expect
        .poll(() =>
          dialog
            .locator('[data-ui="gallery.videoReview.manualPreview"] canvas:visible, video:visible')
            .first()
            .evaluate((node) => {
              let canvas: HTMLCanvasElement | OffscreenCanvas;
              if (node instanceof HTMLCanvasElement) canvas = node;
              else if (node instanceof HTMLVideoElement) {
                if (node.readyState < 2 || !node.videoWidth || !node.videoHeight) return false;
                canvas = new OffscreenCanvas(node.videoWidth, node.videoHeight);
                const context = canvas.getContext('2d');
                if (!context) return false;
                context.drawImage(node, 0, 0);
              } else throw new Error('Review preview is not a video or canvas.');
              const context = canvas.getContext('2d');
              if (!context) return false;
              const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
              return pixels.some((value, index) => index % 4 !== 3 && value > 32);
            })
        )
        .toBe(true);
      await target.page.screenshot({
        path: info.outputPath('portable-native-review.png'),
        fullPage: false,
      });
      const proofPage = await target.context.newPage();
      await proofPage.goto(
        `chrome-extension://${target.extensionId}/tooling/test/harness/webdav-transfer.html`
      );
      await proofPage.waitForFunction(() => Boolean(window.webdavTransferHarness));
      await target.page.bringToFront();
      await expect
        .poll(() =>
          proofPage.evaluate((id) => window.webdavTransferHarness.review.proof(id), sent.mediaId)
        )
        .toMatchObject({ mode: 'advanced', modeSelectionPending: false });
      const uiBefore = await proofPage.evaluate(
        (id) => window.webdavTransferHarness.review.proof(id),
        sent.mediaId
      );
      expect(uiBefore.history.slice(0, admitted.default.history.length)).toEqual(
        admitted.default.history
      );
      await dialog
        .getByRole('button', { name: translate('gallery.videoReview.undo', 'en'), exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (
              await proofPage.evaluate(
                (id) => window.webdavTransferHarness.review.proof(id),
                sent.mediaId
              )
            ).cursor
        )
        .toBe(uiBefore.cursor - 1);
      await dialog
        .getByRole('button', { name: translate('gallery.videoReview.redo', 'en'), exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (
              await proofPage.evaluate(
                (id) => window.webdavTransferHarness.review.proof(id),
                sent.mediaId
              )
            ).cursor
        )
        .toBe(uiBefore.cursor);
      const edited = await proofPage.evaluate(
        (id) => window.webdavTransferHarness.review.proof(id),
        sent.mediaId
      );
      expect(edited).toEqual(uiBefore);
      expect(edited.original).toEqual(admitted.default.original);
      expect(
        await proofPage.evaluate(
          (id) => window.webdavTransferHarness.review.proof(id),
          sent.archiveId
        )
      ).toEqual(admitted.archive);
      await saveProof(info, { sent, admitted, uiBefore, edited, viewport });
    } finally {
      await target.context.close();
    }
  });
}
