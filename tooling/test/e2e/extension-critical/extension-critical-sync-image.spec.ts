import { writeFile } from 'node:fs/promises';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import type {} from '../../harness/sync-capture';

async function openHarness(page: Page, origin: string) {
  await page.goto(`${origin}/tooling/test/harness/sync-capture.html`);
  await page.waitForFunction(() => Boolean(window.syncCaptureHarness?.image));
}
async function openEditor(page: Page, origin: string, rootId: string) {
  await page.goto(`${origin}${EDITOR_HARNESS_PATH}?assetId=${rootId}`);
  await expect(page.locator('[data-ui="editor.page.root"]')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0))
    .toBeGreaterThan(0);
}
async function waitForPresentation(page: Page, rootId: string) {
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sniptale-db');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const tx = db.transaction(['media_library', 'aggregate_presentations'], 'readonly');
          const read = (request: IDBRequest) =>
            new Promise<unknown>((resolve, reject) => {
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
          const [media, presentation] = await Promise.all([
            read(tx.objectStore('media_library').get(id)),
            read(tx.objectStore('aggregate_presentations').get(['image', id])),
          ]);
          return Boolean(
            media &&
            typeof media === 'object' &&
            'workspaceRevision' in media &&
            presentation &&
            typeof presentation === 'object' &&
            'presentationRevision' in presentation &&
            media.workspaceRevision === presentation.presentationRevision
          );
        } finally {
          db.close();
        }
      }, rootId)
    )
    .toBe(true);
}
async function bootstrap(page: Page) {
  await applyHarnessBootstrap(page, {
    preserveMediaLibrary: true,
    editorDispatchBootstrapPayload: false,
  });
}
for (const preset of PRIMARY_BROWSER_VIEWPORTS) {
  test(`saved image crosses browser profiles, recovers publication, and edits again ${preset.name}`, async ({}, info) => {
    test.setTimeout(120_000);
    const host = await startHostServer();
    const rootId = 'native-image-sync';
    let source: BrowserContext | undefined;
    let target: BrowserContext | undefined;
    const options = { viewport: { ...preset.size }, deviceScaleFactor: 1, headless: true };
    try {
      source = await chromium.launchPersistentContext(info.outputPath('source-profile'), options);
      const page = await source.newPage();
      await bootstrap(page);
      await openHarness(page, host.origin);
      const original = await page.evaluate(
        (id) => window.syncCaptureHarness.image.seed(id),
        rootId
      );
      await openEditor(page, host.origin, rootId);
      await page.evaluate(() => window.__sniptaleEditorHarness?.applyBrowserFrameMutation());
      await expect(
        page.getByRole('button', { name: 'Автосохранение: Сохранено', exact: true })
      ).toBeVisible();
      await waitForPresentation(page, rootId);
      await page.screenshot({ path: info.outputPath('source-authored.png'), fullPage: false });
      await openHarness(page, host.origin);
      const publication = await page.evaluate(
        (id) => window.syncCaptureHarness.image.publish(id),
        rootId
      );
      expect(publication.sent.length).toBeGreaterThan(1);
      expect(
        publication.native.operations.every((operation) => operation.phase === 'published')
      ).toBe(true);
      expect(publication.native.hash).toBe(original.hash);
      expect(JSON.stringify(publication.native.workspace)).toContain('change-');

      target = await chromium.launchPersistentContext(info.outputPath('target-profile'), options);
      let receiver = await target.newPage();
      await bootstrap(receiver);
      await openHarness(receiver, host.origin);
      const staged = await receiver.evaluate(
        ({ id, files }) => window.syncCaptureHarness.image.receive(id, files, true),
        { id: rootId, files: publication.files }
      );
      expect(staged.exists).toBe(false);
      expect(staged.journals).toBe(1);
      await target.close();
      target = await chromium.launchPersistentContext(info.outputPath('target-profile'), options);
      receiver = await target.newPage();
      await bootstrap(receiver);
      await openHarness(receiver, host.origin);
      const recovered = await receiver.evaluate(
        (id) => window.syncCaptureHarness.image.recover(id),
        rootId
      );
      expect(recovered.hash).toBe(original.hash);
      expect(recovered.journals).toBe(0);
      expect(recovered.operations).toEqual([]);
      expect(recovered.presentationRevision).toBe(recovered.revision);
      expect(JSON.stringify(recovered.workspace)).toContain('change-');
      const replay = await receiver.evaluate(
        ({ id, files }) => window.syncCaptureHarness.image.receive(id, files),
        { id: rootId, files: publication.files }
      );
      expect(replay.revision).toBe(recovered.revision);
      expect(replay.hash).toBe(recovered.hash);
      expect(replay.assetIds).toEqual(recovered.assetIds);
      expect(replay.journals).toBe(0);
      await openEditor(receiver, host.origin, rootId);
      await receiver.evaluate(() => window.__sniptaleEditorHarness?.applyBrowserFrameMutation());
      await expect(
        receiver.getByRole('button', { name: 'Автосохранение: Сохранено', exact: true })
      ).toBeVisible();
      await waitForPresentation(receiver, rootId);
      await receiver.screenshot({ path: info.outputPath('target-edited.png'), fullPage: false });
      await openHarness(receiver, host.origin);
      const edited = await receiver.evaluate(
        (id) => window.syncCaptureHarness.image.inspect(id),
        rootId
      );
      expect(edited.revision).toBeGreaterThan(recovered.revision!);
      expect(edited.hash).toBe(original.hash);
      const final = await receiver.evaluate(
        (id) => window.syncCaptureHarness.image.copyAndRestore(id),
        rootId
      );
      expect(final.copy.hash).toBe(original.hash);
      expect(final.restored.hash).toBe(original.hash);
      expect(final.restored.revision).toBeGreaterThan(edited.revision!);
      expect(final.copy.presentationRevision).toBe(final.copy.revision);
      await target.close();
      target = await chromium.launchPersistentContext(info.outputPath('target-profile'), options);
      receiver = await target.newPage();
      await bootstrap(receiver);
      await openHarness(receiver, host.origin);
      const persisted = await receiver.evaluate(
        (id) => window.syncCaptureHarness.image.recover(id),
        rootId
      );
      expect(persisted.hash).toBe(final.restored.hash);
      expect(persisted.revision).toBe(final.restored.revision);
      await writeFile(
        info.outputPath('image-sync-proof.json'),
        JSON.stringify(
          {
            original,
            source: publication.native,
            staged,
            recovered,
            replay,
            edited,
            final,
            persisted,
            remoteKeys: publication.files.map((file) => file.key),
          },
          null,
          2
        )
      );
    } finally {
      await source?.close();
      await target?.close();
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
