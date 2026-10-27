import { test, expect } from '../support/extension-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  queueHash,
  queueOperationKey,
} from '../../../../apps/extension/src/composition/persistence/sync-capture/queue-model';
import type { CapturedChange } from '../../../../apps/extension/src/composition/persistence/sync-capture/contracts';
import { parseSyncCaptureRecord } from '../../../../apps/extension/src/composition/persistence/sync-capture/guards';
import { DB_NAME } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';

for (const config of [
  { locale: 'ru', size: { width: 1280, height: 560 } },
  { locale: 'en', size: { width: 1920, height: 900 } },
] as const) {
  test(`native Settings queue commands and pagination ${config.locale}`, async ({
    page,
    extensionId,
  }, info) => {
    await page.setViewportSize(config.size);
    const base = `chrome-extension://${extensionId}/apps/extension/src/settings/index.html`;
    await page.goto(`${base}?section=saving&view=queue`);
    const text = (key: Parameters<typeof translate>[0]) => translate(key, config.locale);
    await page.locator('[data-ui="settings.sync-queue"][aria-busy="false"]').waitFor();
    // The extension fixture reuses its browser profile between locale cases.
    await page.evaluate(async (name) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const tx = database.transaction(['sync_capture', 'sync_outbox'], 'readwrite');
        tx.objectStore('sync_capture').clear();
        tx.objectStore('sync_outbox').clear();
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        database.close();
      }
    }, DB_NAME);
    await page.evaluate(async (locale) => {
      await chrome.storage.local.set({ 'sniptale-locale-preference': locale });
      localStorage.setItem('sniptale-locale-preference', locale);
    }, config.locale);
    await page.reload();
    const section = page.getByRole('region', { name: text('settings.syncQueue.title') });
    await expect(section.getByText(text('settings.syncQueue.unconfigured'))).toBeVisible();
    const scope = { spaceId: 'settings-proof', connectionGeneration: 1, profileCreatedAt: 1 };
    const captures: CapturedChange[] = Array.from({ length: 132 }, (_, index) => {
      const id = `proof-${String(index).padStart(3, '0')}`;
      return {
        version: 1,
        kind: 'captured-change',
        key: JSON.stringify(['change', id]),
        createdAt: 1,
        spaceId: scope.spaceId,
        connectionGeneration: 1,
        rootKind: 'media',
        rootId: `Example ${id}.png`,
        rootKey: JSON.stringify([scope.spaceId, 'media', `Example ${id}.png`]),
        generation: 1,
        operationId: id,
        basis: [],
        origin: 'local-edit',
        publicationId: null,
        change: { kind: 'tombstone' },
      };
    });
    const normalized = captures.map((capture) => {
      const parsed = parseSyncCaptureRecord(capture);
      if (!parsed || parsed.kind !== 'captured-change') throw new Error('Invalid queue fixture');
      return parsed;
    });
    const operations = normalized.map((capture) => ({
      ...scope,
      version: 1,
      kind: 'queue-operation',
      key: queueOperationKey(scope, capture.operationId),
      operationId: capture.operationId,
      captureKey: capture.key,
      captureSha256: queueHash(JSON.stringify(capture)),
      rootKey: capture.rootKey,
      generation: 1,
      revision: 1,
      status: 'queued',
      stage: 'queued',
      runId: null,
      authorization: null,
      writeStarted: false,
      outcome: 'none',
      attemptId: null,
      failureCode: null,
      eventSequence: 1,
      pendingTransitions: [
        {
          sequence: 1,
          code: 'enqueued',
          operationRef: queueHash(queueOperationKey(scope, capture.operationId)),
          stage: 'queued',
          attemptId: null,
        },
      ],
      droppedTransitions: 0,
    }));
    await page.evaluate(
      async ({ name, captures, operations, scope }) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(name);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const tx = database.transaction(['sync_capture', 'sync_outbox'], 'readwrite');
          tx.objectStore('sync_capture').put({
            version: 1,
            kind: 'profile',
            key: 'profile',
            createdAt: scope.profileCreatedAt,
            enabled: false,
            spaceId: scope.spaceId,
            connectionGeneration: 1,
          });
          for (const row of captures) tx.objectStore('sync_capture').put(row);
          for (const row of operations) tx.objectStore('sync_outbox').put(row);
          await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          });
        } finally {
          database.close();
        }
      },
      { name: DB_NAME, captures: normalized, operations, scope }
    );
    await section
      .getByRole('button', { name: text('settings.syncQueue.refresh'), exact: true })
      .click();
    await expect(section.getByRole('listitem')).toHaveCount(25);
    const queueControl = section.locator('[data-ui="sync-queue.control"]');
    await queueControl.click();
    await expect(
      section.getByText(text('settings.syncQueue.paused'), { exact: true })
    ).toBeVisible();
    await queueControl.click();
    await expect(
      section.getByText(text('settings.syncQueue.active'), { exact: true })
    ).toBeVisible();
    const first = section.getByRole('listitem').first();
    await first
      .getByRole('button', { name: text('settings.syncQueue.action.pause'), exact: true })
      .click();
    await expect(
      first.getByText(text('settings.syncQueue.status.paused'), { exact: true })
    ).toBeVisible();
    await expect(
      first.getByRole('button', { name: text('settings.syncQueue.action.resume'), exact: true })
    ).toBeFocused();
    await first
      .getByRole('button', { name: text('settings.syncQueue.action.resume'), exact: true })
      .click();
    await expect(
      first.getByText(text('settings.syncQueue.status.queued'), { exact: true })
    ).toBeVisible();
    await first
      .getByRole('button', { name: text('settings.syncQueue.action.cancel'), exact: true })
      .click();
    await expect(
      first.getByText(text('settings.syncQueue.status.cancelled'), { exact: true })
    ).toBeVisible();
    await expect(first.getByRole('button')).toHaveCount(0);
    await expect(first).toBeFocused();
    await page.screenshot({ path: info.outputPath('queue-commands.png'), fullPage: false });
    for (let index = 0; index < 5; index++) {
      await section
        .getByRole('button', { name: text('settings.syncQueue.next'), exact: true })
        .click();
      await expect(section.getByRole('listitem').first()).toContainText(
        `proof-${String((index + 1) * 25).padStart(3, '0')}`
      );
    }
    await expect(section.getByRole('listitem')).toHaveCount(7);
    await expect(section.getByText('Example proof-131.png', { exact: true })).toBeVisible();
    await expect(
      section.getByRole('button', { name: text('settings.syncQueue.next'), exact: true })
    ).toHaveCount(0);
    await section
      .getByRole('button', { name: text('settings.syncQueue.refresh'), exact: true })
      .click();
    await expect(first).toContainText('proof-000');
    await expect(
      first.getByText(text('settings.syncQueue.status.cancelled'), { exact: true })
    ).toBeVisible();
    await page.reload();
    await expect(
      section
        .getByRole('listitem')
        .first()
        .getByText(text('settings.syncQueue.status.cancelled'), { exact: true })
    ).toBeVisible();
    for (const width of [1279, 1280, 1281, 1100]) {
      await page.setViewportSize({ width, height: 560 });
      expect(await section.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      if (width < 1280) {
        const outer = page.locator('.sniptale-settings-viewport');
        expect(
          await outer.evaluate((node) => node.scrollWidth >= 1280 && node.clientWidth < 1280)
        ).toBe(true);
        await outer.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        expect(await outer.evaluate((node) => node.scrollLeft > 0)).toBe(true);
      }
    }
    await page.setViewportSize(config.size);
    await page.screenshot({ path: info.outputPath('queue-restored.png'), fullPage: false });
    await section.getByRole('link', { name: text('settings.syncQueue.history') }).click();
    await expect(page.getByText(/sync.cancelled stage=/).first()).toBeVisible();
    expect(await page.locator('body').innerText()).not.toContain('Example proof-000.png');
  });
}
