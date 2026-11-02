import { writeFile } from 'node:fs/promises';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import {
  applyHarnessBootstrap,
  EDITOR_HARNESS_PATH,
  GALLERY_HARNESS_PATH,
} from '../extension-critical.helpers';
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
async function openGallery(page: Page, origin: string) {
  await page.goto(`${origin}${GALLERY_HARNESS_PATH}`);
  await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
}
async function openTrash(page: Page) {
  await page
    .locator('[data-ui="gallery.sidebar.footer"] button:not([data-ui="gallery.sidebar.toggle"])')
    .click();
  await expect(page.locator('[data-ui="gallery.trash.selection"]')).toBeVisible();
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
async function publicationAvailable(page: Page) {
  return page.evaluate(() =>
    navigator.locks.request(
      'sniptale:sync:checkpoint-publication',
      { mode: 'exclusive', ifAvailable: true },
      (lock) => Boolean(lock)
    )
  );
}
async function nativeImageRevision(page: Page, rootId: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db
          .transaction('media_library', 'readonly')
          .objectStore('media_library')
          .get(id);
        request.onsuccess = () =>
          request.result
            ? resolve(request.result.workspaceRevision ?? 0)
            : reject(new Error('The observed image root is missing.'));
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, rootId);
}
for (const preset of PRIMARY_BROWSER_VIEWPORTS) {
  test(
    'real image pencil gesture holds publication until native save acknowledgement ' +
      `${preset.name}`,
    async ({}, info) => {
      test.setTimeout(60_000);
      const host = await startHostServer();
      let context: BrowserContext | undefined;
      try {
        context = await chromium.launchPersistentContext(info.outputPath('gesture-profile'), {
          viewport: { ...preset.size },
          deviceScaleFactor: 1,
          headless: true,
        });
        const page = await context.newPage();
        await bootstrap(page);
        await openHarness(page, host.origin);
        const rootId = 'image-pencil-checkpoint';
        await page.evaluate((id) => window.syncCaptureHarness.image.seed(id), rootId);
        await openEditor(page, host.origin, rootId);
        const saved = page.getByRole('button', { name: 'Автосохранение: Сохранено', exact: true });
        const observer = await context.newPage();
        await bootstrap(observer);
        await openHarness(observer, host.origin);
        await expect.poll(() => publicationAvailable(observer)).toBe(true);
        const baselineRevision = await nativeImageRevision(observer, rootId);
        const baselineObjects = await page.evaluate(
          () => window.__sniptaleEditorHarness!.getCanvasObjects().length
        );
        await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
        const canvas = page.locator('canvas.upper-canvas');
        await expect(canvas).toBeVisible();
        const bounds = await canvas.boundingBox();
        expect(bounds).not.toBeNull();
        if (!bounds) throw new Error('The drawing canvas has no browser bounds.');
        const permit = await observer.evaluateHandle(async () => {
          let release!: () => void;
          let acquired!: () => void;
          const ready = new Promise<void>((resolve) => {
            acquired = resolve;
          });
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          const lifetime = navigator.locks.request(
            'sniptale:persistence:privacy-erasure',
            { mode: 'exclusive' },
            async () => {
              acquired();
              await held;
            }
          );
          await ready;
          return {
            release: async () => {
              release();
              await lifetime;
            },
          };
        });
        try {
          await page.mouse.move(bounds.x + bounds.width * 0.35, bounds.y + bounds.height * 0.45);
          await page.mouse.down();
          await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.6, {
            steps: 8,
          });
          await expect.poll(() => publicationAvailable(observer)).toBe(false);
          const duringStroke = await publicationAvailable(observer);
          await page.screenshot({
            path: info.outputPath('pencil-stroke-active.png'),
            fullPage: false,
          });
          await page.mouse.up();
          await expect
            .poll(() =>
              page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects().length)
            )
            .toBe(baselineObjects + 1);
          await expect
            .poll(() =>
              observer.evaluate(async () => {
                const locks = await navigator.locks.query();
                return (
                  locks.pending?.some(
                    (lock) => lock.name === 'sniptale:persistence:privacy-erasure'
                  ) ?? false
                );
              })
            )
            .toBe(true);
          const afterMouseup = await publicationAvailable(observer);
          expect(afterMouseup).toBe(false);
          const blockedRevision = await nativeImageRevision(observer, rootId);
          expect(blockedRevision).toBe(baselineRevision);
          await page.screenshot({
            path: info.outputPath('pencil-native-save-blocked.png'),
            fullPage: false,
          });
          await permit.evaluate((held) => held.release());
          await expect(saved).toBeVisible();
          await expect
            .poll(() => nativeImageRevision(observer, rootId))
            .toBeGreaterThan(baselineRevision);
          await expect.poll(() => publicationAvailable(observer)).toBe(true);
          await page.screenshot({
            path: info.outputPath('pencil-native-save-acknowledged.png'),
            fullPage: false,
          });
          await writeFile(
            info.outputPath('pencil-lock-proof.json'),
            JSON.stringify(
              {
                viewport: preset.size,
                baselineObjects,
                baselineRevision,
                blockedRevision,
                acknowledgedRevision: await nativeImageRevision(observer, rootId),
                duringStroke,
                afterMouseup,
                afterAcknowledgement: await publicationAvailable(observer),
              },
              null,
              2
            )
          );
        } finally {
          await permit.evaluate((held) => held.release());
          await permit.dispose();
        }
      } finally {
        await context?.close();
        host.server.closeAllConnections();
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    }
  );
}
for (const preset of PRIMARY_BROWSER_VIEWPORTS) {
  test(`saved image syncs between browsers, recovers publication and edits again ${preset.name}`, async ({}, info) => {
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
      const authored = await page.evaluate(
        (id) => window.syncCaptureHarness.image.inspect(id),
        rootId
      );
      expect(authored.pending).not.toBeNull();
      expect(authored.workspace.document.browserFrame.title).toContain('change-');
      const predecessorRefusal = await page.evaluate(
        (id) => window.syncCaptureHarness.image.checkpoint(id),
        rootId
      );
      expect(predecessorRefusal).toMatchObject({
        outcome: 'refused',
        pendingRevision: authored.pending?.revision,
      });
      expect(
        (await page.evaluate((id) => window.syncCaptureHarness.image.inspect(id), rootId)).pending
      ).toEqual(authored.pending);
      const observer = await source.newPage();
      await bootstrap(observer);
      await openHarness(observer, host.origin);
      const edit = await observer.evaluateHandle(async () => {
        let acquired!: () => void;
        let release!: () => void;
        const ready = new Promise<void>((resolve) => {
          acquired = resolve;
        });
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const lifetime = navigator.locks.request(
          'sniptale:sync:checkpoint-publication',
          { mode: 'shared' },
          async () => {
            acquired();
            await held;
          }
        );
        await ready;
        return {
          release: async () => {
            release();
            await lifetime;
          },
        };
      });
      try {
        expect(
          await page.evaluate((id) => window.syncCaptureHarness.image.checkpoint(id), rootId)
        ).toMatchObject({ outcome: 'busy', pendingRevision: authored.pending?.revision });
        expect(
          (await page.evaluate((id) => window.syncCaptureHarness.image.inspect(id), rootId)).pending
        ).toEqual(authored.pending);
      } finally {
        await edit.evaluate((held) => held.release());
        await edit.dispose();
        await observer.close();
      }
      const publication = await page.evaluate(
        (id) => window.syncCaptureHarness.image.publish(id),
        rootId
      );
      expect(publication.sent.length).toBeGreaterThan(1);
      expect(publication.checkpoint).toMatchObject({
        outcome: 'captured',
        pendingRevision: authored.pending?.revision,
      });
      expect(publication.native.pending).toBeNull();
      expect(publication.native.workspace).toEqual(authored.workspace);
      const repeated = await page.evaluate(
        (id) => window.syncCaptureHarness.image.publish(id),
        rootId
      );
      expect(repeated.sent).toEqual([]);
      expect(repeated.checkpoint.outcome).toBe('not-pending');
      expect(repeated.native.operations).toEqual(publication.native.operations);
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
      expect(recovered.workspace.document.browserFrame).toEqual(
        authored.workspace.document.browserFrame
      );
      expect(recovered.pending).toBeNull();
      const replay = await receiver.evaluate(
        ({ id, files }) => window.syncCaptureHarness.image.receive(id, files),
        { id: rootId, files: publication.files }
      );
      expect(replay.revision).toBe(recovered.revision);
      expect(replay.hash).toBe(recovered.hash);
      expect(replay.assetIds).toEqual(recovered.assetIds);
      expect(replay.journals).toBe(0);
      // Real IDB transactions serialize two pages. Neither command may lose the other's fields.
      const writer = await source.newPage();
      await bootstrap(writer);
      await openHarness(writer, host.origin);
      await Promise.all([
        page.evaluate((id) => window.syncCaptureHarness.image.trash(id), rootId),
        writer.evaluate(
          (id) => window.syncCaptureHarness.image.rename(id, 'lifecycle image.png'),
          rootId
        ),
      ]);
      await writer.close();
      const trashedPublication = await page.evaluate(
        ({ id, files }) => window.syncCaptureHarness.image.publish(id, files),
        { id: rootId, files: publication.files }
      );
      expect(trashedPublication.native.filename).toBe('lifecycle image.png');
      expect(trashedPublication.native.lifecycle?.trashedAt).toBeGreaterThan(0);
      const trashed = await receiver.evaluate(
        ({ id, files }) => window.syncCaptureHarness.image.receive(id, files),
        { id: rootId, files: trashedPublication.files }
      );
      expect(trashed.lifecycle?.trashedAt).toBeGreaterThan(0);
      expect(trashed.hash).toBe(original.hash);
      await openGallery(receiver, host.origin);
      await expect(receiver.locator(`[data-gallery-keyboard-id="${rootId}"]`)).toHaveCount(0);
      await openTrash(receiver);
      await expect(receiver.locator(`[data-gallery-keyboard-id="${rootId}"]`)).toBeVisible();
      await receiver.screenshot({ path: info.outputPath('synced-trash.png'), fullPage: false });
      const selection = receiver.locator('[data-ui="gallery.trash.selection"]');
      await selection.getByRole('button', { name: 'Выбрать всё', exact: true }).click();
      await selection.getByRole('button', { name: 'Восстановить выбранное', exact: true }).click();
      await expect(receiver.locator(`[data-gallery-keyboard-id="${rootId}"]`)).toHaveCount(0);
      await openHarness(receiver, host.origin);
      const restoredPublication = await receiver.evaluate(
        ({ id, files }) => window.syncCaptureHarness.image.publish(id, files),
        { id: rootId, files: trashedPublication.files }
      );
      expect(restoredPublication.native.lifecycle?.trashedAt).toBeUndefined();
      await page.evaluate(({ id, files }) => window.syncCaptureHarness.image.receive(id, files), {
        id: rootId,
        files: restoredPublication.files,
      });
      await openGallery(page, host.origin);
      await expect(page.locator(`[data-gallery-keyboard-id="${rootId}"]`)).toBeVisible();
      await page.screenshot({ path: info.outputPath('synced-restored.png'), fullPage: false });
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
            authored,
            predecessorRefusal,
            checkpoint: publication.checkpoint,
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
