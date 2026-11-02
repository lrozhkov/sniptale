import { test, expect } from '../support/extension-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  queueHash,
  queueOperationKey,
} from '../../../../apps/extension/src/composition/persistence/sync-capture/queue-model';
import type { CapturedChange } from '../../../../apps/extension/src/composition/persistence/sync-capture/contracts';
import {
  fingerprintNativeCapture,
  parseSyncCaptureRecord,
} from '../../../../apps/extension/src/composition/persistence/sync-capture/guards';
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
      const native: Omit<CapturedChange, 'sourceSha256'> = {
        version: 1,
        kind: 'sync-operation',
        phase: 'native',
        profileCreatedAt: scope.profileCreatedAt,
        source: { changeKind: 'tombstone', label: `Example ${id}.png` },
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
      return { ...native, sourceSha256: fingerprintNativeCapture(native) };
    });
    const normalized = captures.map((capture) => {
      const parsed = parseSyncCaptureRecord(capture);
      if (!parsed || parsed.kind !== 'sync-operation' || parsed.phase !== 'native')
        throw new Error('Invalid queue fixture');
      return parsed;
    });
    const operations = normalized.map((capture) => ({
      ...scope,
      version: 1,
      kind: 'queue-operation',
      key: queueOperationKey(scope, capture.operationId),
      operationId: capture.operationId,
      captureKey: capture.key,
      captureSha256: capture.sourceSha256,
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
    const rowDisclosure = section
      .locator('[data-ui="sync-queue.operation-details"] > summary')
      .first();
    await expect(rowDisclosure).toHaveCSS('display', 'flex');
    await expect(rowDisclosure).toHaveCSS('list-style-type', 'none');
    expect(
      (await section.locator('li[data-operation-id]').first().boundingBox())?.height
    ).toBeLessThanOrEqual(48);
    const queueControl = section.locator('[data-ui="sync-queue.control"]');
    await queueControl.click();
    await expect(
      section.getByText(text('settings.syncQueue.paused'), { exact: true })
    ).toBeVisible();
    await queueControl.click();
    await expect(
      section.getByText(text('settings.syncQueue.active'), { exact: true })
    ).toBeVisible();
    const first = section.locator('[data-operation-id="proof-000"]');
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
    ).toBeHidden();
    await expect(first.getByRole('button')).toHaveCount(0);
    await expect(
      section.locator('[data-ui="sync-queue.filters"] [aria-pressed="true"]')
    ).toBeFocused();
    await expect(first).not.toBeVisible();
    await section.locator('[data-ui="sync-queue.completed"] > summary').click();
    await expect(first).toBeVisible();
    await expect(
      first.getByText(text('settings.syncQueue.status.cancelled'), { exact: true })
    ).toBeVisible();
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
    await expect(
      section.getByRole('heading', { name: 'Example proof-131.png', exact: true })
    ).toBeVisible();
    await expect(
      section.getByRole('button', { name: text('settings.syncQueue.next'), exact: true })
    ).toHaveCount(0);
    await section
      .getByRole('button', { name: text('settings.syncQueue.firstPage'), exact: true })
      .click();
    await section.locator('[data-ui="sync-queue.completed"] > summary').click();
    await expect(first).toContainText('proof-000');
    await expect(
      first.getByText(text('settings.syncQueue.status.cancelled'), { exact: true })
    ).toBeVisible();
    await page.reload();
    await section.locator('[data-ui="sync-queue.completed"] > summary').click();
    await expect(
      first.getByText(text('settings.syncQueue.status.cancelled'), { exact: true })
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
    // A native manual failure beyond the first125 operations must be queryable directly.
    const failureKey = queueOperationKey(scope, 'proof-131');
    const changeFailure = async (advanceOnly: boolean) =>
      page.evaluate(
        async ({ name, key, advanceOnly }) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(name);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            const tx = database.transaction('sync_outbox', 'readwrite');
            const store = tx.objectStore('sync_outbox');
            const raw: unknown = await new Promise((resolve, reject) => {
              const request = store.get(key);
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            if (
              typeof raw !== 'object' ||
              raw === null ||
              !('revision' in raw) ||
              typeof raw.revision !== 'number'
            )
              throw new Error('Queue race fixture missing');
            store.put({
              ...raw,
              revision: raw.revision + 1,
              ...(advanceOnly ? {} : { status: 'failed', failureCode: 'source' }),
            });
            await new Promise<void>((resolve, reject) => {
              tx.oncomplete = () => resolve();
              tx.onabort = () => reject(tx.error);
              tx.onerror = () => reject(tx.error);
            });
          } finally {
            database.close();
          }
        },
        { name: DB_NAME, key: failureKey, advanceOnly }
      );
    await changeFailure(false);
    const filters = section.locator('[data-ui="sync-queue.filters"]');
    await filters
      .getByRole('button', { name: text('settings.syncQueue.filters.problems') })
      .click();
    await expect(page).toHaveURL(/queueFilter=problems/u);
    const failed = section.locator('[data-operation-id="proof-131"]');
    await expect(section.getByRole('listitem')).toHaveCount(1);
    await expect(failed).toBeVisible();
    await expect(filters).toContainText(`${text('settings.syncQueue.operationsUnit')}: 1`);
    const details = failed.locator('[data-ui="sync-queue.operation-details"] > summary');
    await details.focus();
    await details.press('Enter');
    await expect(failed.locator('[data-ui="sync-queue.operation-details"]')).toHaveAttribute(
      'open',
      ''
    );
    await expect(failed.getByText('Example proof-131.png', { exact: true }).last()).toBeVisible();
    await page.screenshot({ path: info.outputPath('queue-one-late-problem.png'), fullPage: false });
    // Another supported writer wins before this stale selection is submitted.
    await changeFailure(true);
    await failed
      .getByRole('button', { name: text('settings.syncQueue.action.retry'), exact: true })
      .click();
    await expect(section.getByRole('alert')).toContainText(text('settings.syncQueue.refused'));
    await expect(failed).toBeVisible();
    await filters
      .getByRole('button', { name: text('settings.syncQueue.filters.actionRequired'), exact: true })
      .click();
    await expect(page).toHaveURL(/queueFilter=action-required/u);
    await expect(failed).toBeVisible();
    await failed
      .getByRole('button', { name: text('settings.syncQueue.action.retry'), exact: true })
      .click();
    await expect(
      section.getByText(text('settings.syncQueue.noMatches'), { exact: true })
    ).toBeVisible();
    await expect(filters.locator('[aria-pressed="true"]')).toBeFocused();
    await expect(filters).toContainText(`${text('settings.syncQueue.operationsUnit')}: 0`);
    await page.screenshot({ path: info.outputPath('queue-resolved-filter.png'), fullPage: false });
    await section
      .getByRole('button', { name: text('settings.syncQueue.showAll'), exact: true })
      .click();
    await expect(page).toHaveURL(/queueFilter=all/u);
    await expect(section.locator('li[data-operation-id]')).toHaveCount(25);
    await section.locator('[data-ui="shared.information-disclosure"] > summary').click();
    await section.getByRole('link', { name: text('settings.syncQueue.history') }).click();
    await expect(page.getByText(/sync.cancelled stage=/).first()).toBeVisible();
    expect(await page.locator('body').innerText()).not.toContain('Example proof-000.png');
  });
}

for (const config of [
  { locale: 'ru', size: { width: 1280, height: 560 } },
  { locale: 'en', size: { width: 1920, height: 900 } },
] as const) {
  test(`checkpoint interval and manual intent through Settings IPC ${config.locale}`, async ({
    page,
    extensionId,
  }, info) => {
    await page.setViewportSize(config.size);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=saving&view=connection`
    );
    await page.locator('[data-ui="settings.sync-connection"][data-state="ready"]').waitFor();
    const fixture = {
      spaceId: 'settings-checkpoint-proof',
      profileCreatedAt: 1,
      connectionGeneration: 1,
      rootKind: 'media',
      rootId: 'settings-pending-intent',
    };
    const rootKey = JSON.stringify([fixture.spaceId, fixture.rootKind, fixture.rootId]);
    const pendingKey = JSON.stringify(['pending-checkpoint', rootKey]);
    // Native command proof uses compact metadata only. Network/enrollment proof is a separate flow.
    await page.evaluate(
      async ({ name, locale, scope, rootKey, pendingKey }) => {
        await chrome.storage.local.set({ 'sniptale-locale-preference': locale });
        localStorage.setItem('sniptale-locale-preference', locale);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(name);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const tx = db.transaction(
            ['sync_capture', 'sync_outbox', 'sync_connection'],
            'readwrite'
          );
          for (const store of ['sync_capture', 'sync_outbox', 'sync_connection'])
            tx.objectStore(store).clear();
          tx.objectStore('sync_capture').put({
            version: 1,
            kind: 'profile',
            key: 'profile',
            createdAt: scope.profileCreatedAt,
            enabled: true,
            spaceId: scope.spaceId,
            connectionGeneration: scope.connectionGeneration,
            checkpointIntervalMs: 300000,
          });
          const createdAt = Date.now();
          tx.objectStore('sync_capture').put({
            version: 1,
            kind: 'pending-checkpoint',
            ...scope,
            key: pendingKey,
            rootKey,
            revision: crypto.randomUUID(),
            createdAt,
            dueAt: createdAt + 300000,
          });
          tx.objectStore('sync_connection').put({
            version: 1,
            kind: 'sync-connection',
            key: 'connection',
            binding: {
              provider: 'webdav',
              rootUrl: 'https://checkpoint-proof.invalid/workspace/',
              accountId: 'proof',
              spaceId: scope.spaceId,
              profileCreatedAt: scope.profileCreatedAt,
              connectionGeneration: scope.connectionGeneration,
            },
            identity: { incarnation: crypto.randomUUID(), revision: 1 },
            phase: 'active',
            updateNonce: null,
            credentialId: crypto.randomUUID(),
          });
          await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
            tx.onerror = () => reject(tx.error);
          });
        } finally {
          db.close();
        }
      },
      { name: DB_NAME, locale: config.locale, scope: fixture, rootKey, pendingKey }
    );
    await page.reload();
    const text = (key: Parameters<typeof translate>[0]) => translate(key, config.locale);
    const section = page.getByRole('region', {
      name: text('settings.syncConnection.title'),
      exact: true,
    });
    const interval = section.getByRole('button', {
      name: text('settings.syncConnection.checkpointInterval'),
      exact: true,
    });
    await expect(interval).toContainText(text('settings.syncConnection.checkpointFiveMinutes'));
    const readNative = () =>
      page.evaluate(
        async ({ name, pendingKey }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(name);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            const tx = db.transaction('sync_capture', 'readonly');
            const read = (key: string): Promise<unknown> =>
              new Promise((resolve, reject) => {
                const request = tx.objectStore('sync_capture').get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              });
            const [profile, pending] = await Promise.all([read('profile'), read(pendingKey)]);
            return { profile, pending };
          } finally {
            db.close();
          }
        },
        { name: DB_NAME, pendingKey }
      );
    const before = await readNative();
    expect(before.pending).not.toHaveProperty('flushRequested');
    await interval.click();
    await page
      .getByRole('option', { name: text('settings.syncConnection.checkpointMinute'), exact: true })
      .click();
    await expect(interval).toContainText(text('settings.syncConnection.checkpointMinute'));
    expect((await readNative()).profile).toMatchObject({ checkpointIntervalMs: 60000 });
    const manual = section.getByRole('button', {
      name: text('settings.syncConnection.checkpointSyncNow'),
      exact: true,
    });
    await manual.click();
    await expect(section.getByRole('status')).toContainText(
      text('settings.syncConnection.checkpointQueued')
    );
    expect((await readNative()).pending).toMatchObject({ flushRequested: true });
    await page.reload();
    await expect(interval).toContainText(text('settings.syncConnection.checkpointMinute'));
    expect((await readNative()).pending).toMatchObject({ flushRequested: true });
    await manual.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false
    );
    await page.screenshot({ path: info.outputPath('checkpoint-settings.png'), fullPage: false });
    if (config.size.width === 1280) {
      await page.setViewportSize({ width: 1100, height: 560 });
      await manual.scrollIntoViewIfNeeded();
      await expect(manual).toBeVisible();
      await expect(interval).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false
      );
    }
    await page.setViewportSize(config.size);
    await page.goto(
      `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=saving&view=queue`
    );
    const queue = page.locator('[data-ui="settings.sync-queue"]');
    await expect(queue.locator('[data-ui="sync-queue.pending"]')).toContainText(
      `${text('settings.syncQueue.pendingRoots')}: 1`
    );
    await expect(queue.getByRole('listitem')).toHaveCount(0);
    await expect(queue.getByText(text('settings.syncQueue.empty'), { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('checkpoint-pending-queue.png'),
      fullPage: false,
    });
    expect(errors).toEqual([]);
  });
}
