import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { test, openProvider, saveProof } from './webdav-fixtures';
import { parseSyncProductResponse } from '../../../../apps/extension/src/contracts/messaging/contracts/runtime/sync-product';
import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../support/effect-v1-corpus.test-support';

type Provider = Awaited<ReturnType<typeof openProvider>>;
const build = '.tmp/e2e-builds/security';
const firstTitle = 'Primary WebDAV project';
const secondTitle = 'Secondary WebDAV project';

async function connectionPage(browser: Provider, viewport: { width: number; height: number }) {
  await browser.page.setViewportSize(viewport);
  await browser.page.evaluate(() =>
    chrome.storage.local.set({
      'sniptale-locale-preference': 'en',
      'sniptale-theme-preference': 'light',
    })
  );
  await browser.page.goto(
    `chrome-extension://${browser.extensionId}/apps/extension/src/settings/index.html?section=saving&view=connection`
  );
  await expect(
    browser.page.getByRole('button', { name: 'Join workspace', exact: true })
  ).toBeVisible();
}

async function fillConnectionDraft(
  page: Page,
  input: {
    mode: 'create' | 'join';
    url: string;
    username: string;
    password: string;
  }
) {
  await page
    .getByRole('button', {
      name: input.mode === 'create' ? 'Create workspace' : 'Join workspace',
      exact: true,
    })
    .click();
  await page
    .getByLabel(input.mode === 'create' ? 'Parent folder URL' : 'Workspace URL', { exact: true })
    .fill(input.url);
  await page.getByLabel('Account', { exact: true }).fill(input.username);
  await page.getByLabel('Username', { exact: true }).fill(input.username);
  await page.getByLabel('Password', { exact: true }).fill(input.password);
}

async function connectWorkspace(
  page: Page,
  input: {
    mode: 'create' | 'join';
    url: string;
    username: string;
    password: string;
  }
) {
  await fillConnectionDraft(page, input);
  await page.getByRole('button', { name: 'Connect workspace', exact: true }).click();
  const finish = page.getByRole('button', { name: 'Finish connection', exact: true });
  await expect(finish).toBeEnabled({ timeout: 30_000 });
  await finish.click();
  await expect(page.getByText('Storage connected', { exact: true })).toBeVisible();
  await expect(page.getByText('Catalog refreshed', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const status: unknown = await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: 'SYNC_PRODUCT_COMMAND',
      requestId: crypto.randomUUID(),
      command: { kind: 'status' },
      __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
    })
  );
  const parsed = parseSyncProductResponse(status);
  if (!parsed?.success || parsed.result.kind !== 'status' || !parsed.result.status.connection)
    throw new Error('Settings did not enroll a connection.');
  return parsed.result.status.connection.rootUrl;
}

async function harnessPage(browser: Provider) {
  const page = await browser.context.newPage();
  await page.goto(
    `chrome-extension://${browser.extensionId}/tooling/test/harness/webdav-transfer.html`
  );
  await page.waitForFunction(() => Boolean(window.webdavTransferHarness));
  return page;
}

async function openLibrary(browser: Provider, viewport: { width: number; height: number }) {
  await browser.page.setViewportSize(viewport);
  await browser.page.goto(
    `chrome-extension://${browser.extensionId}/apps/extension/src/gallery/index.html`
  );
  await expect(browser.page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
  await browser.page.evaluate(() => document.fonts.ready);
}

async function expectEditor(editor: Page, clipId: string) {
  await expect(editor.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  await expect(editor.locator(`[data-project-timeline-clip="${clipId}"]`)).toBeVisible();
  await expect
    .poll(() =>
      editor.locator('[data-preview-stage-canvas]').evaluate((node) => {
        if (!(node instanceof HTMLCanvasElement))
          throw new Error('Editor preview is not a canvas.');
        const context = node.getContext('2d');
        if (!context) throw new Error('Editor preview is unavailable.');
        const pixels = [0.25, 0.75].map(
          (x) =>
            context.getImageData(Math.floor(node.width * x), Math.floor(node.height / 2), 1, 1).data
        );
        const [left, right] = pixels;
        return Boolean(
          left && right && left[0]! > 200 && left[1]! < 120 && right[1]! > 150 && right[0]! < 80
        );
      })
    )
    .toBe(true);
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`Settings runtime jobs remain manageable after navigation ${viewport.width}`, async ({
    lab,
  }, info) => {
    test.setTimeout(120_000);
    const browser = await openProvider(lab, info, 'runtime-jobs', false, build, { viewport });
    try {
      await connectionPage(browser, viewport);
      const worker = browser.context.serviceWorkers()[0];
      if (!worker) throw new Error('Runtime worker is unavailable.');
      await worker.evaluate(() => {
        Reflect.set(globalThis, '__syncDiagnosticSenders', []);
        chrome.runtime.onConnect.addListener((port) => {
          if (port.name !== 'sniptale:diagnostic-summary:v1') return;
          const rows = Reflect.get(globalThis, '__syncDiagnosticSenders');
          if (Array.isArray(rows))
            rows.push({
              id: port.sender?.id,
              url: port.sender?.url,
              documentId: port.sender?.documentId,
              frameId: port.sender?.frameId,
              hasTab: Boolean(port.sender?.tab),
            });
        });
      });

      await connectWorkspace(browser.page, {
        mode: 'create',
        url: lab.credentials.rootUrl,
        ...lab.credentials,
      });
      lab.proxy.armFault({ method: 'PROPFIND', key: '*', kind: 'hold-response-headers' });
      await browser.page.getByRole('button', { name: 'Refresh catalog', exact: true }).click();
      await lab.proxy.waitForFault();
      await browser.page.goto(
        `chrome-extension://${browser.extensionId}/apps/extension/src/settings/index.html?section=saving&view=queue`
      );
      const runtime = browser.page.locator('[data-ui="settings.sync-runtime-jobs"]');
      const running = runtime
        .locator('li')
        .filter({ has: browser.page.getByText('Running', { exact: true }) });
      await expect(running)
        .toHaveCount(1)
        .catch(async (error) => {
          const observation = await browser.page.evaluate(() =>
            chrome.runtime.sendMessage({
              type: 'SYNC_PRODUCT_COMMAND',
              requestId: crypto.randomUUID(),
              command: { kind: 'status' },
              __sniptaleRuntimeFreshness: {
                issuedAtEpochMs: Date.now(),
                nonce: crypto.randomUUID(),
              },
            })
          );
          await saveProof(info, {
            phase: 'runtime-list-failure',
            observation,
            view: await browser.page.locator('body').innerText(),
          });
          await browser.page.screenshot({
            path: info.outputPath('runtime-list-failure.png'),
            fullPage: false,
          });
          throw error;
        });
      await expect(running).toContainText('Refresh catalog');
      const requestId = await running.getAttribute('data-operation-id');
      if (!requestId) throw new Error('Runtime job identity is missing.');
      await browser.page.screenshot({
        path: info.outputPath('runtime-job-running.png'),
        fullPage: false,
        animations: 'disabled',
      });
      await running.getByRole('button', { name: 'Cancel operation', exact: true }).click();
      const retired = runtime.locator(`[data-operation-id="${requestId}"]`);
      await expect(retired).toContainText('Interrupted');
      await expect(retired.getByRole('button')).toHaveCount(0);
      lab.proxy.releaseFault();
      await expect
        .poll(async () =>
          browser.page.evaluate(async () => {
            const result = await chrome.storage.local.get('sniptale_runtime_diagnostic_log');
            const value = result['sniptale_runtime_diagnostic_log'];
            return JSON.stringify(value);
          })
        )
        .toContain('sync.product.interrupted')
        .catch(async (error) => {
          await saveProof(info, {
            phase: 'runtime-log-delivery',
            senders: await worker.evaluate(() =>
              Reflect.get(globalThis, '__syncDiagnosticSenders')
            ),
          });
          throw error;
        });
      await browser.page.screenshot({
        path: info.outputPath('runtime-job-cancelled.png'),
        fullPage: false,
        animations: 'disabled',
      });
    } finally {
      lab.proxy.releaseFault();
      await browser.context.close();
    }
  });
  test(`Settings and Library open only the selected remote project and reopen offline ${viewport.width}`, async ({
    lab,
  }, info) => {
    test.setTimeout(300_000);
    const source = await openProvider(lab, info, 'library-source', false, build, { viewport });
    const specimen = EFFECT_BUNDLE_CORPUS.find(
      (item) => item.accepted && item.artifact.includes('asset-bearing-conformance')
    );
    if (!specimen) throw new Error('Asset-bearing corpus is unavailable.');
    let target: Provider | null = null;
    try {
      await connectionPage(source, viewport);
      const enrolledRootUrl = await connectWorkspace(source.page, {
        mode: 'create',
        url: lab.credentials.rootUrl,
        ...lab.credentials,
      });
      await source.page.screenshot({
        path: info.outputPath('settings-created.png'),
        fullPage: false,
      });
      const sourceProof = await harnessPage(source);
      const seeded = await sourceProof.evaluate(
        async ({ effectBundleBytes, rootUrl }) => {
          const connection = await window.webdavTransferHarness.connection.restore();
          const first = await window.webdavTransferHarness.portable.source(
            { effectBundleBytes },
            { useExistingProfile: true, name: 'Primary WebDAV project' }
          );
          const second = await window.webdavTransferHarness.portable.source(undefined, {
            useExistingProfile: true,
            name: 'Secondary WebDAV project',
          });
          const sent = [];
          for (const item of [first, second]) {
            const media = await window.webdavTransferHarness.portable.outgoing.sendHistory(
              item.mediaId
            );
            const project = await window.webdavTransferHarness.portable.outgoing.sendHistory(
              item.projectId,
              true
            );
            sent.push({
              ...item,
              objects: [...media, ...project].flatMap((operation) => operation.files),
            });
          }
          return {
            rootUrl,
            spaceId: connection.profile.spaceId,
            first: sent[0]!,
            second: sent[1]!,
          };
        },
        {
          effectBundleBytes: Array.from(readEffectBundleCorpusArchive(specimen)),
          rootUrl: enrolledRootUrl,
        }
      );
      const rootKey = new URL(seeded.rootUrl).pathname.slice(
        new URL(lab.credentials.rootUrl).pathname.length
      );
      for (const object of [...seeded.first.objects, ...seeded.second.objects]) {
        expect(await lab.externalProof(`${rootKey}${object.key}`)).toEqual({
          size: object.size,
          sha256: object.sha256,
        });
      }
      await source.context.close();
      const beforeCatalog = lab.proxy.counts.getKeys.length;
      target = await openProvider(lab, info, 'library-target', false, build, { viewport });
      await connectionPage(target, viewport);
      await connectWorkspace(target.page, {
        mode: 'join',
        url: seeded.rootUrl,
        ...lab.credentials,
      });
      await target.page.screenshot({
        path: info.outputPath('settings-joined.png'),
        fullPage: false,
      });
      await openLibrary(target, viewport);
      const first = target.page.getByRole('group', { name: firstTitle, exact: true });
      const second = target.page.getByRole('group', { name: secondTitle, exact: true });
      await expect(first).toBeVisible();
      await expect(second).toBeVisible();
      await expect(first.getByRole('img')).toBeVisible({ timeout: 30_000 });
      // Preview files may be fetched, but listing and cards cannot hydrate originals or exports.
      const originalDigests = new Set(
        [
          ...seeded.first.editing,
          ...seeded.second.editing,
          ...seeded.first.graph.effects.flatMap((effect) => effect.assets),
          ...seeded.second.graph.effects.flatMap((effect) => effect.assets),
          seeded.first.exported,
          seeded.second.exported,
        ].map((file) => file.sha256)
      );
      const originalKeys = new Set(
        [...seeded.first.objects, ...seeded.second.objects]
          .filter((object) => originalDigests.has(object.sha256))
          .map((object) => `${rootKey}${object.key}`)
      );
      expect(
        lab.proxy.counts.getKeys.slice(beforeCatalog).filter((key) => originalKeys.has(key))
      ).toEqual([]);
      const search = target.page.getByRole('textbox', { name: 'Search Library', exact: true });
      await search.fill(firstTitle);
      await expect(first).toBeVisible();
      await expect(second).toHaveCount(0);
      await search.fill('');
      await expect(second).toBeVisible();
      await expect(first.getByRole('img')).toBeVisible();
      await target.page.screenshot({
        path: info.outputPath('remote-library.png'),
        fullPage: false,
      });
      // Keyboard activation has the same preparation admission as the pointer action.
      await first.focus();
      await target.page.keyboard.press('Enter');
      const download = target.page
        .getByRole('dialog', { name: firstTitle, exact: true })
        .getByRole('button', { name: 'Download and open', exact: true });
      await expect(download).toBeVisible();
      const opened = target.context.waitForEvent('page');
      await download.click();
      const editor = await opened;
      await editor.setViewportSize(viewport);
      await expectEditor(editor, seeded.first.clipId);
      await editor.screenshot({
        path: info.outputPath('selected-native-editor.png'),
        fullPage: false,
      });
      const nativeProof = await harnessPage(target);
      const admitted = await nativeProof.evaluate(
        (id) => window.webdavTransferHarness.portable.proof(id),
        seeded.first.projectId
      );
      expect(admitted.objects).toEqual(seeded.first.editing);
      expect(admitted.graph).toEqual(seeded.first.graph);
      expect(admitted.exportAbsent).toBe(false);
      expect(admitted.exports).toEqual([
        expect.objectContaining({ id: seeded.first.exportId, size: seeded.first.exported.size }),
      ]);
      const untouched = await nativeProof.evaluate(
        ({ spaceId, rootId }) =>
          window.webdavTransferHarness.portable.outgoing.nativeState(
            spaceId,
            'video-project',
            rootId
          ),
        { spaceId: seeded.spaceId, rootId: seeded.second.projectId }
      );
      expect(untouched.exists).toBe(false);
      const exportKeys = new Set(
        [...seeded.first.objects, ...seeded.second.objects]
          .filter(
            (object) =>
              object.sha256 === seeded.first.exported.sha256 ||
              object.sha256 === seeded.second.exported.sha256
          )
          .map((object) => `${rootKey}${object.key}`)
      );
      expect(
        lab.proxy.counts.getKeys.slice(beforeCatalog).filter((key) => exportKeys.has(key))
      ).toEqual([]);
      await editor.close();
      const cacheSettings = await target.context.newPage();
      await cacheSettings.setViewportSize(viewport);
      await cacheSettings.goto(
        `chrome-extension://${target.extensionId}/apps/extension/src/settings/index.html?section=saving&view=storage`
      );
      const cache = cacheSettings.getByRole('region', {
        name: 'Files on this device',
        exact: true,
      });
      await expect(cache.getByLabel('Budget, MiB', { exact: true })).toBeVisible();
      const cacheStatus = async () => {
        const response: unknown = await cacheSettings.evaluate(() =>
          chrome.runtime.sendMessage({
            type: 'SYNC_PRODUCT_COMMAND',
            requestId: crypto.randomUUID(),
            command: { kind: 'cache-status' },
            __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
          })
        );
        const parsed = parseSyncProductResponse(response);
        if (!parsed?.success || parsed.result.kind !== 'cache-status')
          throw new Error('Cache status unavailable.');
        return parsed.result.status;
      };
      const nativeIds = () =>
        nativeProof.evaluate(async () => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('sniptale-db');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            return await new Promise<IDBValidKey[]>((resolve, reject) => {
              const request = db
                .transaction(['asset_refs'], 'readonly')
                .objectStore('asset_refs')
                .getAllKeys();
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
          } finally {
            db.close();
          }
        });
      const idsBefore = await nativeIds();
      const residentBefore = await cacheStatus();
      expect(residentBefore.residentBytes).toBeGreaterThan(0);
      await cacheSettings.screenshot({
        path: info.outputPath('cache-settings.png'),
        fullPage: false,
      });
      await openLibrary(target, viewport);
      const nativeCard = target.page.getByRole('group', { name: firstTitle, exact: true });
      await nativeCard.focus();
      await target.page.keyboard.press('Enter');
      const nativeDialog = target.page.getByRole('dialog', { name: firstTitle, exact: true });
      const nativeCache = nativeDialog.getByRole('region', {
        name: 'Files on this device',
        exact: true,
      });
      await nativeCache.getByRole('button', { name: 'Keep offline', exact: true }).click();
      await expect(nativeCache.getByRole('button', { name: 'Unpin', exact: true })).toBeEnabled();
      await nativeCache
        .getByRole('button', { name: 'Free space on this device', exact: true })
        .click();
      await expect(nativeCache.getByText('Freed: 0 B.', { exact: true })).toBeVisible();
      expect((await cacheStatus()).residentBytes).toBe(residentBefore.residentBytes);
      await nativeCache.getByRole('button', { name: 'Unpin', exact: true }).click();
      await expect(
        nativeCache.getByRole('button', { name: 'Keep offline', exact: true })
      ).toBeEnabled();
      await nativeCache
        .getByRole('button', { name: 'Free space on this device', exact: true })
        .click();
      await expect(
        nativeCache.getByText('Download files before opening', { exact: true })
      ).toBeVisible();
      const afterRelease = await cacheStatus();
      expect(afterRelease.residentBytes).toBeLessThan(residentBefore.residentBytes);
      expect(afterRelease.missingBytes).toBeGreaterThan(residentBefore.missingBytes);
      expect(await nativeIds()).toEqual(idsBefore);
      await target.page.screenshot({
        path: info.outputPath('cache-released-card-retained.png'),
        fullPage: false,
      });
      // The real backup UI must prepare missing native bytes before inventory and stream an ordinary archive.
      await target.page.evaluate(() => {
        Object.defineProperty(window, 'showSaveFilePicker', {
          configurable: true,
          value: async () =>
            (await navigator.storage.getDirectory()).getFileHandle('webdav-backup-proof.zip', {
              create: true,
            }),
        });
      });
      const backup = nativeDialog.getByRole('button', { name: 'Backup', exact: true });
      await backup.click();
      await expect(backup).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
      await expect(nativeDialog.getByRole('alert')).toHaveCount(0);
      await expect(
        nativeCache.getByText('Files are on this device', { exact: true })
      ).toBeVisible();
      expect(await nativeIds()).toEqual(idsBefore);
      expect((await cacheStatus()).residentBytes).toBe(
        residentBefore.residentBytes + seeded.first.exported.size
      );
      const archiveBytes = await target.page.evaluate(async () => {
        const handle = await (
          await navigator.storage.getDirectory()
        ).getFileHandle('webdav-backup-proof.zip');
        return Array.from(new Uint8Array(await (await handle.getFile()).arrayBuffer()));
      });
      const archive = await JSZip.loadAsync(Uint8Array.from(archiveBytes));
      const archiveOriginals = await Promise.all(
        Object.values(archive.files)
          .filter((file) => !file.dir && file.name.endsWith('.png'))
          .map(async (file) => {
            const bytes = await file.async('uint8array');
            return {
              size: bytes.byteLength,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            };
          })
      );
      expect(archiveOriginals).toEqual(expect.arrayContaining(admitted.objects));
      expect(archiveOriginals).toEqual(expect.arrayContaining([seeded.first.exported]));
      await target.page.screenshot({
        path: info.outputPath('backup-after-unload.png'),
        fullPage: false,
      });
      await openLibrary(target, viewport);
      await nativeCard.focus();
      await target.page.keyboard.press('Enter');
      await nativeCache
        .getByRole('button', { name: 'Free space on this device', exact: true })
        .click();
      await expect(
        nativeCache.getByText('Download files before opening', { exact: true })
      ).toBeVisible();
      await target.page.keyboard.press('Escape');
      await expect(nativeCard).toBeVisible();
      const restoredPage = target.context.waitForEvent('page');
      await nativeCard.getByRole('button', { name: 'Open in editor', exact: true }).click();
      const restoredEditor = await restoredPage;
      await restoredEditor.setViewportSize(viewport);
      await expectEditor(restoredEditor, seeded.first.clipId);
      expect(await nativeIds()).toEqual(idsBefore);
      const restored = await nativeProof.evaluate(
        (id) => window.webdavTransferHarness.portable.proof(id),
        seeded.first.projectId
      );
      expect(restored.objects).toEqual(admitted.objects);
      expect(restored.graph).toEqual(admitted.graph);
      expect((await cacheStatus()).residentBytes).toBe(residentBefore.residentBytes);
      await restoredEditor.screenshot({
        path: info.outputPath('cache-ordinary-reopen.png'),
        fullPage: false,
      });
      await restoredEditor.close();
      await openLibrary(target, viewport);
      // Navigation replaces the Window and its disposable test file-picker override.
      await target.page.evaluate(() =>
        Object.defineProperty(window, 'showSaveFilePicker', {
          configurable: true,
          value: async () =>
            (await navigator.storage.getDirectory()).getFileHandle('webdav-backup-proof.zip', {
              create: true,
            }),
        })
      );
      await target.page.keyboard.press('Escape');
      await target.page.locator('[data-ui="gallery.header.storage"] > button').click();
      await target.page.getByRole('menuitem', { name: 'Create backup', exact: true }).click();
      const fullBackup = target.page
        .getByRole('dialog')
        .filter({ hasText: 'The backup includes the local library' });
      await expect(fullBackup.getByText('Server-only items', { exact: true })).toBeVisible();
      const beforeFullConfirmation = lab.proxy.counts.getKeys.length;
      await fullBackup.getByRole('checkbox').first().check();
      await expect(fullBackup.getByRole('checkbox').first()).toBeChecked();
      await expect(
        fullBackup.getByRole('button', { name: 'Download and create backup', exact: true })
      ).toBeEnabled();
      await target.page.screenshot({
        path: info.outputPath('full-library-backup-confirmation.png'),
        fullPage: false,
        animations: 'disabled',
      });
      const confirmationReads = lab.proxy.counts.getKeys.slice(beforeFullConfirmation);
      await saveProof(info, {
        phase: 'full-backup-confirmation',
        reads: confirmationReads,
        originalReads: confirmationReads.filter((key) => originalKeys.has(key)),
      });
      expect(confirmationReads.filter((key) => originalKeys.has(key))).toEqual([]);
      await fullBackup
        .getByRole('button', { name: 'Download and create backup', exact: true })
        .click();
      await expect(fullBackup).toHaveCount(0, { timeout: 60_000 });
      const fullArchiveBytes = await target.page.evaluate(async () => {
        const handle = await (
          await navigator.storage.getDirectory()
        ).getFileHandle('webdav-backup-proof.zip');
        return Array.from(new Uint8Array(await (await handle.getFile()).arrayBuffer()));
      });
      const fullArchive = await JSZip.loadAsync(Uint8Array.from(fullArchiveBytes));
      const fullFiles = await Promise.all(
        Object.values(fullArchive.files)
          .filter((file) => !file.dir)
          .map(async (file) => {
            const bytes = await file.async('uint8array');
            return {
              size: bytes.byteLength,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            };
          })
      );
      expect(fullFiles).toEqual(
        expect.arrayContaining([seeded.first.exported, seeded.second.exported])
      );
      const fullMetadata = await Promise.all(
        Object.values(fullArchive.files)
          .filter((file) => !file.dir && file.name.endsWith('.json'))
          .map((file) => file.async('string'))
      );
      expect(fullMetadata.join('\n')).toContain('Secondary WebDAV project');
      for (const item of [seeded.first, seeded.second]) {
        expect(fullMetadata.join('\n')).toContain(item.projectId);
        expect(fullMetadata.join('\n')).toContain(item.exportId);
      }
      await target.page.screenshot({
        path: info.outputPath('full-library-backup-complete.png'),
        fullPage: false,
      });
      const lateSource = await openProvider(lab, info, 'library-source', false, build, {
        viewport,
      });
      const late = await (async () => {
        try {
          const proof = await harnessPage(lateSource);
          return await proof.evaluate(async () => {
            let stage = 'restore';
            try {
              await window.webdavTransferHarness.connection.restore();
              stage = 'create';
              const item = await window.webdavTransferHarness.portable.source(undefined, {
                useExistingProfile: true,
                name: 'Late WebDAV project',
              });
              stage = 'publish-media';
              const media = await window.webdavTransferHarness.portable.outgoing.sendHistory(
                item.mediaId
              );
              stage = 'publish-project';
              const project = await window.webdavTransferHarness.portable.outgoing.sendHistory(
                item.projectId,
                true
              );
              return {
                ...item,
                objects: [...media, ...project].flatMap((operation) => operation.files),
              };
            } catch (error) {
              throw new Error(
                `Late source ${stage}: ${error instanceof Error ? error.message : 'unknown'}`,
                { cause: error }
              );
            }
          });
        } finally {
          await lateSource.context.close();
        }
      })();
      const beforeDetachIds = await nativeIds();
      await openLibrary(target, viewport);
      const secondNative = target.page.getByRole('group', { name: secondTitle, exact: true });
      await secondNative.focus();
      await target.page.keyboard.press('Enter');
      const secondPreview = target.page.getByRole('dialog');
      await secondPreview
        .getByRole('button', { name: 'Free space on this device', exact: true })
        .click();
      await expect(
        secondPreview.getByText('Download files before opening', { exact: true })
      ).toBeVisible();
      await target.page.keyboard.press('Escape');
      await target.page.goto(
        `chrome-extension://${target.extensionId}/apps/extension/src/settings/index.html?section=saving&view=connection`
      );
      await target.page.getByRole('button', { name: 'Refresh catalog', exact: true }).click();
      await expect(target.page.getByText('Catalog refreshed', { exact: true })).toBeVisible();
      const localOnly = target.page.getByRole('button', { name: 'Local only', exact: true });
      await localOnly.click();
      const localConfirmation = target.page.getByRole('alertdialog', {
        name: 'Local only',
        exact: true,
      });
      await expect(
        localConfirmation.getByRole('button', {
          name: 'Prepare files and disconnect WebDAV',
          exact: true,
        })
      ).toBeEnabled();
      await target.page.screenshot({
        path: info.outputPath('local-only-confirmation.png'),
        fullPage: false,
        animations: 'disabled',
      });
      await localConfirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(localConfirmation).toHaveCount(0);
      await expect(localOnly).toBeEnabled();
      await localOnly.click();
      await localConfirmation
        .getByRole('button', { name: 'Prepare files and disconnect WebDAV', exact: true })
        .click();
      await expect(
        target.page.getByText(
          'Local-only mode is active. Synchronization is disconnected and files are on this device.',
          { exact: true }
        )
      ).toBeVisible({ timeout: 60_000 });
      await expect(localConfirmation).toHaveCount(0);
      expect(await nativeIds()).toEqual(expect.arrayContaining(beforeDetachIds));
      await expect(
        target.page.getByRole('button', { name: 'Join workspace', exact: true })
      ).toBeEnabled();
      await target.page.screenshot({
        path: info.outputPath('local-only-complete.png'),
        fullPage: false,
      });
      for (const object of [...seeded.first.objects, ...seeded.second.objects])
        expect(await lab.externalProof(`${rootKey}${object.key}`)).toEqual({
          size: object.size,
          sha256: object.sha256,
        });
      const localLate = await nativeProof.evaluate(
        (id) => window.webdavTransferHarness.portable.proof(id),
        late.projectId
      );
      expect(localLate.exports).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: late.exportId })])
      );
      await expect(
        target.page.getByText(
          'Local-only mode is active. Synchronization is disconnected and files are on this device.',
          { exact: true }
        )
      ).toBeInViewport({ ratio: 1 });
      for (const object of late.objects)
        expect(await lab.externalProof(`${rootKey}${object.key}`)).toEqual({
          size: object.size,
          sha256: object.sha256,
        });
      const localSecondary = await nativeProof.evaluate(
        (id) => window.webdavTransferHarness.portable.proof(id),
        seeded.second.projectId
      );
      expect(localSecondary.exports).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: seeded.second.exportId })])
      );
      const replacementRoot = await connectWorkspace(target.page, {
        mode: 'create',
        url: lab.credentials.rootUrl,
        ...lab.credentials,
      });
      expect(replacementRoot).not.toBe(seeded.rootUrl);
      await target.page.screenshot({
        path: info.outputPath('new-space-after-local-only.png'),
        fullPage: false,
      });
      await target.context.close();
      // BrowserContext offline does not cover every MV3 offscreen network context.
      await lab.proxy.close();
      const beforeOffline = lab.proxy.counts.getKeys.length;
      target = await openProvider(lab, info, 'library-target', false, build, {
        viewport,
        offline: true,
      });
      await openLibrary(target, viewport);
      const localCard = target.page.getByRole('group', { name: firstTitle, exact: true });
      await expect(localCard).toBeVisible();
      const reopened = target.context.waitForEvent('page');
      await localCard.getByRole('button', { name: 'Open in editor', exact: true }).click();
      const offlineEditor = await reopened;
      await offlineEditor.setViewportSize(viewport);
      await expectEditor(offlineEditor, seeded.first.clipId);
      const clip = offlineEditor.locator(`[data-project-timeline-clip="${seeded.first.clipId}"]`);
      await clip.click();
      await offlineEditor.keyboard.press('Delete');
      await expect(clip).toHaveCount(0);
      const offlineProof = await harnessPage(target);
      await expect
        .poll(async () =>
          (
            await offlineProof.evaluate(
              (id) => window.webdavTransferHarness.portable.proof(id),
              seeded.first.projectId
            )
          ).clipIds.includes(seeded.first.clipId)
        )
        .toBe(false);
      await offlineEditor.keyboard.press('Control+z');
      await expect(clip).toBeVisible();
      await expect
        .poll(async () =>
          (
            await offlineProof.evaluate(
              (id) => window.webdavTransferHarness.portable.proof(id),
              seeded.first.projectId
            )
          ).clipIds.includes(seeded.first.clipId)
        )
        .toBe(true);
      await offlineEditor.screenshot({
        path: info.outputPath('restarted-offline-editor.png'),
        fullPage: false,
      });
      expect(lab.proxy.counts.getKeys.length).toBe(beforeOffline);
      await saveProof(info, {
        selectedProject: seeded.first.projectId,
        unselectedProject: seeded.second.projectId,
        metadataOnlyCatalog: true,
        independentOriginalsAndExports: true,
        actualSettingsCreateAndJoin: true,
        actualLibrarySelection: true,
        offlineRestartEditAndUndo: true,
        manualReleaseAndOrdinaryReopen: true,
        actualBackupAfterUnloadIncludesOriginals: true,
        actualFullLibraryBackupIncludesCatalogOnlyProjectAndExports: true,
        actualLocalOnlyAfterUnloadPreservesNativeFilesAndServerData: true,
        actualFreshCreateAfterRetirement: true,
        pinPreventsRelease: true,
        unchangedNativeAssetIds: idsBefore,
        releasedOriginalBytes: residentBefore.residentBytes - afterRelease.residentBytes,
        editingObjects: admitted.objects,
        viewport,
      });
    } finally {
      await source.context.close();
      await target?.context.close();
    }
  });
}

test('Settings abandons an uncertain setup locally and creates a different owned folder', async ({
  lab,
}, info) => {
  test.setTimeout(120_000);
  const viewport = { width: 1280, height: 560 };
  const browser = await openProvider(lab, info, 'setup-recovery', false, build, { viewport });
  try {
    await connectionPage(browser, viewport);
    await fillConnectionDraft(browser.page, {
      mode: 'create',
      url: lab.credentials.rootUrl,
      ...lab.credentials,
    });
    lab.proxy.armFault({ method: 'MKCOL', key: '*', kind: 'lost-response' });
    await browser.page.getByRole('button', { name: 'Connect workspace', exact: true }).click();
    await lab.proxy.waitForFault();
    await expect(browser.page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
    const probe = await harnessPage(browser);
    const uncertain = await probe.evaluate(() => window.webdavTransferHarness.workspace.inspect());
    expect(uncertain?.phase).toBe('allocating');
    if (!uncertain) throw new Error('Uncertain setup is missing.');
    const requestsBefore = {
      gets: lab.proxy.counts.gets,
      puts: lab.proxy.counts.puts,
      mkcols: lab.proxy.counts.mkcols,
      propfinds: lab.proxy.counts.propfinds,
    };
    await browser.page.getByLabel('Password', { exact: true }).fill('');
    await browser.page
      .getByRole('button', { name: 'Cancel connection setup', exact: true })
      .click();
    await expect(browser.page.getByLabel('Parent folder URL', { exact: true })).toBeEnabled();
    await expect(
      browser.page.getByRole('button', { name: 'Join workspace', exact: true })
    ).toBeEnabled();
    const retired = await probe.evaluate(() => window.webdavTransferHarness.workspace.inspect());
    expect(retired?.phase).toBe('abandoned');
    expect(retired?.identity.incarnation).toBe(uncertain.identity.incarnation);
    expect({
      gets: lab.proxy.counts.gets,
      puts: lab.proxy.counts.puts,
      mkcols: lab.proxy.counts.mkcols,
      propfinds: lab.proxy.counts.propfinds,
    }).toEqual(requestsBefore);
    await browser.page.screenshot({
      path: info.outputPath('setup-cancelled.png'),
      fullPage: false,
    });
    const enrolledRootUrl = await connectWorkspace(browser.page, {
      mode: 'create',
      url: lab.credentials.rootUrl,
      ...lab.credentials,
    });
    expect(enrolledRootUrl).not.toBe(uncertain.rootUrl);
    await saveProof(info, {
      uncertainPhase: uncertain.phase,
      localAbandonment: true,
      noCancelNetwork: true,
      differentOwnedFolder: true,
      viewport,
    });
  } finally {
    await browser.context.close();
  }
});

test('Settings retries a checked MKCOL 423 and completes the same workspace in one browser', async ({
  lab,
}, info) => {
  test.setTimeout(120_000);
  const viewport = { width: 1280, height: 560 };
  const browser = await openProvider(lab, info, 'setup-423-retry', false, build, { viewport });
  try {
    await connectionPage(browser, viewport);
    await fillConnectionDraft(browser.page, {
      mode: 'create',
      url: lab.credentials.rootUrl,
      ...lab.credentials,
    });
    lab.proxy.armFault({ method: 'MKCOL', key: '*', kind: 'status', status: 423 });
    await browser.page.getByRole('button', { name: 'Connect workspace', exact: true }).click();
    await lab.proxy.waitForFault();
    await expect(browser.page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
    const probe = await harnessPage(browser);
    const refused = await probe.evaluate(() => window.webdavTransferHarness.workspace.inspect());
    expect(refused?.phase).toBe('planned');
    if (!refused) throw new Error('Retryable workspace plan is missing.');
    const refusal = lab.proxy.counts.mkcolStatuses.find((item) => item.status === 423);
    expect(refusal).toBeDefined();
    await browser.page.getByRole('button', { name: 'Retry connection', exact: true }).click();
    await expect(
      browser.page.getByRole('button', { name: 'Finish connection', exact: true })
    ).toBeEnabled({ timeout: 30_000 });
    const ready = await probe.evaluate(() => window.webdavTransferHarness.workspace.inspect());
    expect(ready?.phase).toBe('ready');
    expect(ready?.identity.incarnation).toBe(refused.identity.incarnation);
    expect(ready?.rootUrl).toBe(refused.rootUrl);
    expect(
      lab.proxy.counts.mkcolStatuses
        .filter((item) => item.key === refusal?.key)
        .map((item) => item.status)
    ).toEqual([423, 201]);
    await browser.page.getByRole('button', { name: 'Finish connection', exact: true }).click();
    await expect(browser.page.getByText('Storage connected', { exact: true })).toBeVisible();
    await expect(browser.page.getByText('Catalog refreshed', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await browser.page.screenshot({
      path: info.outputPath('setup-423-recovered.png'),
      fullPage: false,
    });
    await saveProof(info, {
      checkedRefusal: 423,
      sameWorkspaceRetry: true,
      mkcolStatuses: [423, 201],
      completedEnrollment: true,
      viewport,
    });
  } finally {
    await browser.context.close();
  }
});

async function wakeExistingQueue(page: Page) {
  await page.evaluate(() =>
    chrome.alarms.create('sniptale:sync-queue-retry', { when: Date.now() })
  );
}

async function refreshProductCatalog(page: Page) {
  const response: unknown = await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: 'SYNC_PRODUCT_COMMAND',
      requestId: crypto.randomUUID(),
      command: { kind: 'catalog-refresh', bypassCache: true },
      __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
    })
  );
  const accepted = parseSyncProductResponse(response);
  if (!accepted?.success || accepted.result.kind !== 'accepted')
    throw new Error('Catalog refresh refused');
  const requestId = accepted.result.requestId;
  await expect
    .poll(
      async () => {
        const answer: unknown = await page.evaluate(
          (id) =>
            chrome.runtime.sendMessage({
              type: 'SYNC_PRODUCT_COMMAND',
              requestId: crypto.randomUUID(),
              command: { kind: 'inspect', requestId: id },
              __sniptaleRuntimeFreshness: {
                issuedAtEpochMs: Date.now(),
                nonce: crypto.randomUUID(),
              },
            }),
          requestId
        );
        const parsed = parseSyncProductResponse(answer);
        return parsed?.success && parsed.result.kind === 'operation'
          ? parsed.result.job?.state
          : null;
      },
      { timeout: 30_000 }
    )
    .toBe('ready');
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`two offline browsers preserve competing changes and resolve them through Library ${viewport.width}`, async ({
    lab,
  }, info) => {
    test.setTimeout(360_000);
    const source = await openProvider(lab, info, 'roundtrip-source', false, build, { viewport });
    let target: Provider | null = null;
    try {
      await connectionPage(source, viewport);
      const rootUrl = await connectWorkspace(source.page, {
        mode: 'create',
        url: lab.credentials.rootUrl,
        ...lab.credentials,
      });
      const sourceProof = await harnessPage(source);
      await sourceProof.evaluate(() => window.webdavTransferHarness.connection.restore());
      const seeded = await sourceProof.evaluate(() =>
        window.webdavTransferHarness.portable.source(undefined, {
          useExistingProfile: true,
          name: 'Shared offline project',
        })
      );
      await wakeExistingQueue(sourceProof);
      await expect
        .poll(
          async () => {
            const queue = await sourceProof.evaluate(() =>
              window.webdavTransferHarness.portable.outgoing.queueState()
            );
            return {
              empty: queue.operations.length === 0,
              unfinished: queue.operations
                .filter((item) => item.status !== 'published')
                .map((item) => ({
                  operationId: item.operationId,
                  rootKey: item.rootKey,
                  generation: item.generation,
                  status: item.status,
                  stage: item.stage,
                  failureCode: item.failureCode,
                })),
            };
          },
          { timeout: 120_000 }
        )
        .toEqual({ empty: false, unfinished: [] });
      const initial = await sourceProof.evaluate(() =>
        window.webdavTransferHarness.portable.outgoing.queueState()
      );
      const files = await sourceProof.evaluate(async () => {
        const queue = await window.webdavTransferHarness.portable.outgoing.queueState();
        return window.webdavTransferHarness.portable.outgoing.completed(
          queue.connection.spaceId,
          queue.connection.connectionGeneration
        );
      });
      const rootKey = new URL(rootUrl).pathname.slice(
        new URL(lab.credentials.rootUrl).pathname.length
      );
      for (const file of files)
        expect(await lab.externalProof(rootKey + file.remoteKey)).toEqual({
          size: file.ref.size,
          sha256: file.sha256,
        });
      expect(files.some((file) => file.sha256 === seeded.exported.sha256)).toBe(true);
      const beforeTargetGets = lab.proxy.counts.getKeys.length;
      target = await openProvider(lab, info, 'roundtrip-target', false, build, { viewport });
      await connectionPage(target, viewport);
      await connectWorkspace(target.page, { mode: 'join', url: rootUrl, ...lab.credentials });
      await openLibrary(target, viewport);
      const card = target.page.getByRole('group', { name: 'Shared offline project', exact: true });
      await card.focus();
      await target.page.keyboard.press('Enter');
      const opened = target.context.waitForEvent('page');
      await target.page
        .getByRole('dialog')
        .getByRole('button', { name: 'Download and open', exact: true })
        .click();
      const editor = await opened;
      await expectEditor(editor, seeded.clipId);
      await editor.close();
      const targetProof = await harnessPage(target);
      await targetProof.evaluate(() => window.webdavTransferHarness.connection.restore());
      const admitted = await targetProof.evaluate(
        (id) => window.webdavTransferHarness.portable.proof(id),
        seeded.projectId
      );
      expect(admitted.exports).toEqual([expect.objectContaining({ id: seeded.exportId })]);
      const exportKeys = new Set(
        files
          .filter((file) => file.sha256 === seeded.exported.sha256)
          .map((file) => rootKey + file.remoteKey)
      );
      expect(
        lab.proxy.counts.getKeys.slice(beforeTargetGets).filter((key) => exportKeys.has(key))
      ).toEqual([]);
      const putsBeforeOffline = lab.proxy.counts.putBodies.filter((item) => item.complete).length;
      lab.proxy.armFault({ method: 'PUT', key: '*', kind: 'status', status: 503, repeat: true });
      await Promise.all([source.context.setOffline(true), target.context.setOffline(true)]);
      const first = await sourceProof.evaluate(
        (id) => window.webdavTransferHarness.portable.renameProject(id, 'Offline version A'),
        seeded.projectId
      );
      const second = await targetProof.evaluate(
        (id) => window.webdavTransferHarness.portable.renameProject(id, 'Offline version B'),
        seeded.projectId
      );
      expect(first.operationId).not.toBe(second.operationId);
      expect(
        await sourceProof.evaluate(
          (id) => window.webdavTransferHarness.portable.projectState(id),
          seeded.projectId
        )
      ).toMatchObject({ name: 'Offline version A', objects: seeded.editing });
      expect(
        await targetProof.evaluate(
          (id) => window.webdavTransferHarness.portable.projectState(id),
          seeded.projectId
        )
      ).toMatchObject({ name: 'Offline version B', objects: seeded.editing });
      expect(lab.proxy.counts.putBodies.filter((item) => item.complete).length).toBe(
        putsBeforeOffline
      );
      lab.proxy.releaseFault();
      await Promise.all([source.context.setOffline(false), target.context.setOffline(false)]);
      await Promise.all([wakeExistingQueue(sourceProof), wakeExistingQueue(targetProof)]);
      for (const [page, operationId] of [
        [sourceProof, first.operationId],
        [targetProof, second.operationId],
      ] as const) {
        await expect
          .poll(
            async () =>
              (
                await page.evaluate(() =>
                  window.webdavTransferHarness.portable.outgoing.queueState()
                )
              ).operations.find((item) => item.operationId === operationId)?.status,
            { timeout: 120_000 }
          )
          .toBe('published');
      }
      const targetPublication = await targetProof.evaluate(async (operationId) => {
        const queue = await window.webdavTransferHarness.portable.outgoing.queueState();
        const receipt = await window.webdavTransferHarness.portable.outgoing.published(
          queue.connection.spaceId,
          queue.connection.connectionGeneration,
          operationId
        );
        if (!receipt) throw new Error('Target publication receipt is missing.');
        return {
          receipt,
          manifest: await window.webdavTransferHarness.portable.outgoing.manifestProof(
            receipt.remoteManifestKey
          ),
        };
      }, second.operationId);
      const publishedAttempt = targetPublication.manifest;
      const envelope = publishedAttempt.operation.envelope;
      if (!envelope) throw new Error('Published project envelope is missing.');
      const metadata = envelope.metadata;
      if (!isRecord(metadata) || !Array.isArray(metadata['projectExports']))
        throw new Error('Published export inventory is missing.');
      const retainedExport = metadata['projectExports'].find(
        (item) =>
          isRecord(item) && isRecord(item['entry']) && item['entry']['id'] === seeded.exportId
      );
      if (!isRecord(retainedExport) || typeof retainedExport['objectId'] !== 'string')
        throw new Error('Target publication omitted the retained export.');
      const objectId = retainedExport['objectId'];
      expect(
        publishedAttempt.operation.objects.find((item) => item.objectId === objectId)?.sha256
      ).toBe(seeded.exported.sha256);
      const exportedBody = publishedAttempt.objects.find((item) => item.objectId === objectId);
      if (!exportedBody) throw new Error('Published export body binding is missing.');
      expect(await lab.externalProof(rootKey + exportedBody.remoteKey)).toEqual(seeded.exported);
      await openLibrary(source, viewport);
      await refreshProductCatalog(source.page);
      const conflict = source.page.getByRole('group').filter({ hasText: 'Conflicting versions' });
      await expect(conflict).toHaveCount(1);
      await conflict.focus();
      await source.page.keyboard.press('Enter');
      const dialog = source.page.getByRole('dialog');
      await expect(
        dialog.getByRole('button', { name: /Keep version.*Offline version A/ })
      ).toBeEnabled();
      await expect(
        dialog.getByRole('button', { name: /Keep version.*Offline version B/ })
      ).toBeEnabled();
      await source.page.screenshot({
        path: info.outputPath('explicit-conflict.png'),
        fullPage: false,
      });
      await dialog.getByRole('button', { name: /Keep version.*Offline version A/ }).click();
      await wakeExistingQueue(sourceProof);
      await expect
        .poll(
          async () =>
            (
              await sourceProof.evaluate(() =>
                window.webdavTransferHarness.portable.outgoing.queueState()
              )
            ).operations.some(
              (item) =>
                item.operationId !== first.operationId &&
                item.operationId !== second.operationId &&
                !initial.operations.some((old) => old.operationId === item.operationId) &&
                item.status === 'published'
            ),
          { timeout: 120_000 }
        )
        .toBe(true);
      await wakeExistingQueue(targetProof);
      await expect
        .poll(
          async () =>
            (
              await targetProof.evaluate(
                (id) => window.webdavTransferHarness.portable.projectState(id),
                seeded.projectId
              )
            ).name,
          { timeout: 120_000 }
        )
        .toBe('Offline version A');
      await source.page.keyboard.press('Escape');
      await refreshProductCatalog(source.page);
      await expect(source.page.getByText('Conflicting versions', { exact: true })).toHaveCount(0);
      await expect(
        source.page.getByRole('group', { name: 'saved-export.png', exact: true })
      ).toHaveCount(1);
      await expect(source.page.getByText('On server', { exact: true })).toHaveCount(0);
      await source.page.screenshot({
        path: info.outputPath('resolved-library.png'),
        fullPage: false,
      });
      for (const page of [sourceProof, targetProof])
        expect(
          await page.evaluate(
            (id) => window.webdavTransferHarness.portable.projectState(id),
            seeded.projectId
          )
        ).toMatchObject({ name: 'Offline version A', objects: seeded.editing });
      await saveProof(info, {
        viewport,
        offlineOperations: [first.operationId, second.operationId],
        nativeOfflineWrites: true,
        runtimeQueuePublication: true,
        explicitLibraryDecision: true,
        bothBrowsersConverged: true,
        externalOriginalsAndExports: true,
      });
    } finally {
      lab.proxy.releaseFault();
      await source.context.close();
      await target?.context.close();
    }
  });
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`Library metadata and Trash prepare an unloaded original ${viewport.width}`, async ({
    lab,
  }, info) => {
    test.setTimeout(240_000);
    const source = await openProvider(lab, info, 'metadata-source', false, build, { viewport });
    let target: Provider | null = null;
    try {
      console.info('metadata-proof', viewport.width, 'source-connect');
      await connectionPage(source, viewport);
      const rootUrl = await connectWorkspace(source.page, {
        mode: 'create',
        url: lab.credentials.rootUrl,
        ...lab.credentials,
      });
      const sourceProof = await harnessPage(source);
      const seeded = await sourceProof.evaluate(async () => {
        await window.webdavTransferHarness.connection.restore();
        const item = await window.webdavTransferHarness.portable.source(undefined, {
          useExistingProfile: true,
        });
        const sent = await window.webdavTransferHarness.portable.outgoing.sendHistory(item.mediaId);
        return { ...item, files: sent.flatMap((operation) => operation.files) };
      });
      console.info('metadata-proof', viewport.width, 'source-published');
      await source.context.close();
      target = await openProvider(lab, info, 'metadata-target', false, build, { viewport });
      await connectionPage(target, viewport);
      await connectWorkspace(target.page, { mode: 'join', url: rootUrl, ...lab.credentials });
      console.info('metadata-proof', viewport.width, 'target-connected');
      await openLibrary(target, viewport);
      const card = target.page.getByRole('group', { name: 'borrowed 100%.png', exact: true });
      await expect(card).toBeVisible();
      await card.focus();
      await target.page.keyboard.press('Enter');
      const remoteDialog = target.page.getByRole('dialog', {
        name: 'borrowed 100%.png',
        exact: true,
      });
      await target.page.evaluate(() => {
        const observations: unknown[] = [];
        Object.defineProperty(window, '__metadataPreparationObservations', { value: observations });
        const channel = new BroadcastChannel('sniptale-sync-product-settled');
        channel.onmessage = async ({ data }: MessageEvent<unknown>) => {
          if (
            !data ||
            typeof data !== 'object' ||
            !('kind' in data) ||
            data.kind !== 'product' ||
            !('requestId' in data) ||
            typeof data.requestId !== 'string'
          )
            return;
          observations.push(
            await chrome.runtime.sendMessage({
              type: 'SYNC_PRODUCT_COMMAND',
              requestId: crypto.randomUUID(),
              command: { kind: 'inspect', requestId: data.requestId, advisory: true },
              __sniptaleRuntimeFreshness: {
                issuedAtEpochMs: Date.now(),
                nonce: crypto.randomUUID(),
              },
            })
          );
        };
        setTimeout(() => channel.close(), 30_000);
      });
      const opened = target.context.waitForEvent('page', { timeout: 30_000 });
      await remoteDialog.getByRole('button', { name: 'Download and open', exact: true }).click();
      const editor = await opened.catch(async (error: unknown) => {
        const observations: unknown = await target!.page.evaluate(() =>
          Reflect.get(window, '__metadataPreparationObservations')
        );
        const jobs = Array.isArray(observations)
          ? observations.flatMap((raw: unknown) => {
              const parsed = parseSyncProductResponse(raw);
              return parsed?.success && parsed.result.kind === 'operation' ? [parsed.result] : [];
            })
          : [];
        await saveProof(info, {
          phase: 'initial-native-admission',
          jobs,
          dialog: await remoteDialog.allTextContents(),
        });
        await target!.page.screenshot({
          path: info.outputPath('initial-native-admission-failure.png'),
          fullPage: false,
        });
        throw error;
      });
      await expect(editor).toHaveURL(/assetId=/);
      await editor.close();
      console.info('metadata-proof', viewport.width, 'native-admitted');
      await openLibrary(target, viewport);
      await card.focus();
      await target.page.keyboard.press('Enter');
      const preview = target.page.locator('[data-ui="gallery.preview.surface"]');
      const cache = preview.getByRole('region', { name: 'Files on this device', exact: true });
      await cache.getByRole('button', { name: 'Free space on this device', exact: true }).click();
      await expect(cache.getByText('Download files before opening', { exact: true })).toBeVisible();
      await preview.getByLabel('Filename', { exact: true }).fill('Renamed after unload');
      await target.page.keyboard.press('Escape');
      const renamed = target.page.locator(`[data-gallery-keyboard-id="${seeded.mediaId}"]`);
      await expect(renamed).toHaveAttribute('aria-label', 'Renamed after unload.png');
      await expect(renamed).toBeVisible();
      console.info('metadata-proof', viewport.width, 'renamed');
      const proof = await harnessPage(target);
      const metadataSent = await proof.evaluate(async (id) => {
        await window.webdavTransferHarness.connection.restore();
        return window.webdavTransferHarness.portable.outgoing.sendHistory(id);
      }, seeded.mediaId);
      const sourceDigests = new Set(seeded.files.map((file) => file.sha256));
      expect(
        metadataSent
          .flatMap((operation) => operation.files)
          .some((file) => sourceDigests.has(file.sha256))
      ).toBe(true);
      console.info('metadata-proof', viewport.width, 'metadata-published');
      await renamed.focus();
      await target.page.keyboard.press('Enter');
      await expect(cache.getByText('Files are on this device', { exact: true })).toBeVisible();
      await cache.getByRole('button', { name: 'Free space on this device', exact: true }).click();
      await expect(cache.getByText('Download files before opening', { exact: true })).toBeVisible();
      await preview
        .locator('[data-ui="gallery.preview.lifecycle-actions"]')
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      await target.page
        .locator('[data-ui="gallery.deletion.menu"]')
        .getByRole('menuitem', { name: 'Move to Trash Bin', exact: true })
        .click();
      await expect(renamed).toHaveCount(0);
      console.info('metadata-proof', viewport.width, 'trashed');
      await target.page
        .locator(
          '[data-ui="gallery.sidebar.footer"] button:not([data-ui="gallery.sidebar.toggle"])'
        )
        .click();
      await expect(renamed).toBeVisible();
      await renamed.focus();
      await target.page.keyboard.press('Enter');
      await target.page.screenshot({
        path: info.outputPath('unloaded-metadata-trash.png'),
        fullPage: false,
      });
      await preview.locator('[data-ui="gallery.preview.restore"]').click();
      await expect(preview).toHaveCount(0);
      await expect(renamed).toHaveCount(0);
      await openLibrary(target, viewport);
      await expect(renamed).toBeVisible();
      const lifecycleSent = await proof.evaluate(
        (id) => window.webdavTransferHarness.portable.outgoing.sendHistory(id),
        seeded.mediaId
      );
      expect(lifecycleSent.length).toBeGreaterThan(0);
      // The proof publisher bypasses the product scheduler. Refresh through the real Settings UI.
      await target.page.goto(
        `chrome-extension://${target.extensionId}/apps/extension/src/settings/index.html?section=saving&view=connection`
      );
      await target.page.getByRole('button', { name: 'Refresh catalog', exact: true }).click();
      await expect(target.page.getByText('Catalog refreshed', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await openLibrary(target, viewport);
      await expect(
        target.page.getByRole('group', { name: 'Renamed after unload.png', exact: true })
      ).toHaveCount(1);
      await expect(renamed).toBeVisible();
      await target.page.screenshot({
        path: info.outputPath('restored-after-unload.png'),
        fullPage: false,
      });
      await saveProof(info, {
        viewport,
        actualMetadataAfterUnload: true,
        outgoingPreparedAndPublished: true,
        actualTrashAfterUnloadAndRestore: true,
        refreshedCatalogHasOneNativeCard: true,
        mediaId: seeded.mediaId,
      });
    } finally {
      await source.context.close();
      await target?.context.close();
    }
  });
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`production WebDAV opens, edits offline, publishes and reopens after release ${viewport.width}`, async ({
    lab,
  }, info) => {
    test.setTimeout(240_000);
    const source = await openProvider(lab, info, 'production-source', false, build, { viewport });
    let target: Provider | null = null;
    try {
      await connectionPage(source, viewport);
      const rootUrl = await connectWorkspace(source.page, {
        mode: 'create',
        url: lab.credentials.rootUrl,
        ...lab.credentials,
      });
      const seedPage = await harnessPage(source);
      const seed = await seedPage.evaluate(async () => {
        await window.webdavTransferHarness.connection.restore();
        const seeded = await window.webdavTransferHarness.portable.source(undefined, {
          useExistingProfile: true,
          name: 'Primary WebDAV project',
        });
        await window.webdavTransferHarness.portable.outgoing.sendHistory(seeded.mediaId);
        await window.webdavTransferHarness.portable.outgoing.sendHistory(seeded.projectId, true);
        return seeded;
      });
      await source.context.close();
      target = await openProvider(
        lab,
        info,
        'production-target',
        false,
        '.tmp/e2e-builds/release',
        { viewport, harness: false }
      );
      expect(await target.page.evaluate(() => typeof window.webdavTransferHarness)).toBe(
        'undefined'
      );
      await connectionPage(target, viewport);
      await connectWorkspace(target.page, { mode: 'join', url: rootUrl, ...lab.credentials });
      await target.page.screenshot({
        path: info.outputPath('production-connected.png'),
        fullPage: false,
      });
      console.info('production-proof', viewport.width, 'library-navigation');
      await openLibrary(target, viewport);
      console.info('production-proof', viewport.width, 'library-visible');
      const card = target.page.getByRole('group', { name: firstTitle, exact: true });
      await expect(card).toBeVisible();
      await card.focus();
      await target.page.keyboard.press('Enter');
      const opened = target.context.waitForEvent('page', { timeout: 30_000 });
      await target.page
        .getByRole('dialog', { name: firstTitle, exact: true })
        .getByRole('button', { name: 'Download and open', exact: true })
        .click();
      console.info('production-proof', viewport.width, 'download-clicked');
      const editor = await opened;
      await editor.setViewportSize(viewport);
      await expectEditor(editor, seed.clipId);
      console.info('production-proof', viewport.width, 'editor-ready');
      await target.context.setOffline(true);
      await expectEditor(editor, seed.clipId);
      const offlineTitle = 'Production offline edit';
      const beforePublication = lab.proxy.counts.putBodies.length;
      await editor
        .locator('[data-ui="video-editor.floating.document-bar"] input')
        .fill(offlineTitle);
      await expect
        .poll(() =>
          editor.evaluate(async (id) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const request = indexedDB.open('sniptale-db');
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            try {
              return await new Promise<unknown>((resolve, reject) => {
                const request = db
                  .transaction('video_projects')
                  .objectStore('video_projects')
                  .get(id);
                request.onsuccess = () => {
                  const row: unknown = request.result;
                  const project =
                    row !== null && typeof row === 'object' && 'project' in row
                      ? row.project
                      : null;
                  resolve(
                    project !== null && typeof project === 'object' && 'name' in project
                      ? project.name
                      : null
                  );
                };
                request.onerror = () => reject(request.error);
              });
            } finally {
              db.close();
            }
          }, seed.projectId)
        )
        .toBe(offlineTitle);
      await editor.close();
      console.info('production-proof', viewport.width, 'library-navigation');
      await openLibrary(target, viewport);
      console.info('production-proof', viewport.width, 'library-visible');
      const preview = target.page.locator('[data-ui="gallery.preview.surface"]');
      const changed = target.page.getByRole('group', { name: offlineTitle, exact: true });
      await expect(changed).toBeVisible();
      expect(lab.proxy.counts.putBodies.slice(beforePublication)).toEqual([]);
      console.info('production-proof', viewport.width, 'offline-saved');
      await target.context.setOffline(false);
      await expect
        .poll(
          () =>
            lab.proxy.counts.putBodies
              .slice(beforePublication)
              .filter((body) => body.key.includes('/records/')).length,
          { timeout: 60_000 }
        )
        .toBeGreaterThan(0);
      console.info('production-proof', viewport.width, 'published');
      await changed.focus();
      await target.page.keyboard.press('Enter');
      const cache = preview.getByRole('region', { name: 'Files on this device', exact: true });
      await cache.getByRole('button', { name: 'Keep offline', exact: true }).click();
      await expect(cache.getByRole('button', { name: 'Unpin', exact: true })).toBeEnabled();
      await cache.getByRole('button', { name: 'Unpin', exact: true }).click();
      await cache.getByRole('button', { name: 'Free space on this device', exact: true }).click();
      await expect(cache.getByText('Download files before opening', { exact: true })).toBeVisible();
      await target.page.screenshot({
        path: info.outputPath('production-released.png'),
        fullPage: false,
      });
      await target.page.keyboard.press('Escape');
      const reopened = target.context.waitForEvent('page', { timeout: 30_000 });
      await changed.getByRole('button', { name: 'Open in editor', exact: true }).click();
      const restored = await reopened;
      await restored.setViewportSize(viewport);
      await expectEditor(restored, seed.clipId);
      await restored.screenshot({
        path: info.outputPath('production-reopened.png'),
        fullPage: false,
      });
      await restored.close();
      await target.page.goto(
        `chrome-extension://${target.extensionId}/apps/extension/src/settings/index.html?section=saving&view=queue`
      );
      await expect(target.page.locator('[data-ui="settings.sync-runtime-jobs"]')).toBeVisible();
      await target.page.screenshot({
        path: info.outputPath('production-queue.png'),
        fullPage: false,
      });
      await saveProof(info, {
        productionBuild: true,
        harness: false,
        offlineEdit: true,
        published: true,
        releaseAndReopen: true,
        viewport,
      });
    } finally {
      if (info.status !== info.expectedStatus && target) {
        for (const [index, page] of target.context.pages().entries())
          await page
            .screenshot({
              path: info.outputPath(`production-failure-${index}.png`),
              fullPage: false,
            })
            .catch(() => undefined);
      }
      await source.context.close();
      await target?.context.close();
    }
  });
}
