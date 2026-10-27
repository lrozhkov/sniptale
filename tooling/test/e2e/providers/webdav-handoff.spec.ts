import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type TestInfo } from '@playwright/test';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseSyncExecutorSnapshot } from '../../../../apps/extension/src/contracts/messaging/contracts/runtime/sync-connection';
import { test, saveProof } from './webdav-fixtures';
import { launchWebdavWorkerDriver } from './webdav-worker-driver';

type Driver = Awaited<ReturnType<typeof launchWebdavWorkerDriver>>;
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Handoff proof requires an object.');
  return value;
}
function call(driver: Driver, method: keyof Window['webdavLifecycle'], argument?: unknown) {
  return driver
    .evaluate(
      `window.webdavLifecycle.${method}(${argument === undefined ? '' : JSON.stringify(argument)})`
    )
    .catch((error: unknown) => {
      throw new Error(`WebDAV lifecycle command failed: ${method}`, { cause: error });
    });
}
async function inspect(driver: Driver) {
  const envelope = record(await call(driver, 'inspect'));
  const value = envelope['sync'];
  if (value === null) return null;
  const snapshot = parseSyncExecutorSnapshot(value);
  if (!snapshot) throw new Error('Handoff runtime snapshot is invalid.');
  return snapshot;
}
async function waitReady(driver: Driver, info: TestInfo) {
  let latest: unknown = null;
  try {
    await expect
      .poll(async () => {
        const snapshot = await inspect(driver);
        latest = snapshot;
        return snapshot?.workspace?.state;
      })
      .toBe('ready');
  } finally {
    await saveProof(info, {
      stage: 'workspace-ready',
      latest,
      native: await call(driver, 'workspaceState'),
    });
  }
}
function sourceResult(value: unknown) {
  const source = record(value);
  const operationId = source['operationId'];
  const rawObjects = source['objects'];
  if (
    typeof operationId !== 'string' ||
    !operationId ||
    !Array.isArray(rawObjects) ||
    !rawObjects.length
  )
    throw new Error('Handoff source proof is missing.');
  const objects = rawObjects.map((raw) => {
    const object = record(raw);
    const key = object['key'];
    const size = object['size'];
    const sha256 = object['sha256'];
    if (
      typeof key !== 'string' ||
      !key.startsWith('Files/') ||
      typeof size !== 'number' ||
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      typeof sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(sha256)
    )
      throw new Error('Handoff original proof is invalid.');
    return { key, size, sha256 };
  });
  return { operationId, objects };
}
async function operation(driver: Driver, operationId: string) {
  const state = record(await call(driver, 'state'));
  const rows = record(state['queue'])['operations'];
  if (!Array.isArray(rows)) throw new Error('Handoff queue proof is missing.');
  return rows.find((value) => isRecord(value) && value['operationId'] === operationId);
}

for (const kind of ['allocation', 'join'] as const) {
  test(`${kind} hands off to the existing queue and preserves independently readable originals`, async ({
    lab,
  }, info) => {
    const authentication = {
      kind: 'basic',
      username: lab.credentials.username,
      password: lab.credentials.password,
    };
    const creator = await launchWebdavWorkerDriver({
      extensionBuildDir: '.tmp/e2e-builds/security',
      ignoreHTTPSErrors: true,
    });
    let joined: Driver | null = null;
    try {
      await creator.grantOrigin(new URL(lab.credentials.rootUrl).origin);
      const created = record(
        await call(creator, 'prepareWorkspace', {
          rootUrl: lab.credentials.rootUrl,
          authentication,
        })
      );
      const rootKey = created['rootKey'];
      if (typeof rootKey !== 'string' || !/^Sniptale-[a-f0-9-]+\/$/u.test(rootKey))
        throw new Error('Handoff root proof is invalid.');
      await call(creator, 'startWorkspace', authentication);
      await waitReady(creator, info);
      let active = creator;
      if (kind === 'join') {
        joined = await launchWebdavWorkerDriver({
          extensionBuildDir: '.tmp/e2e-builds/security',
          ignoreHTTPSErrors: true,
        });
        active = joined;
        await active.grantOrigin(new URL(lab.credentials.rootUrl).origin);
        await call(active, 'prepareJoin', {
          rootUrl: new URL(rootKey, lab.credentials.rootUrl).href,
          accountId: lab.credentials.username,
        });
        await call(active, 'startWorkspace', authentication);
        await waitReady(active, info);
      }
      const enrolled = record(await call(active, 'enrollWorkspace', authentication));
      expect(enrolled['phase']).toBe('active');
      expect((await inspect(active))?.phase).toBe('stopped');
      const replay = await call(active, 'enrollWorkspace', {
        ...authentication,
        password: 'different-synthetic-password',
      });
      expect(replay).toEqual(enrolled);
      const preparedSource = record(await call(active, 'prepareEnrolledSource'));
      const operationId = preparedSource['operationId'];
      if (typeof operationId !== 'string')
        throw new Error('Prepared operation identity is missing.');
      await call(active, 'start');
      await expect
        .poll(async () => record(await operation(active, operationId))['status'])
        .toBe('published');
      const source = sourceResult(await call(active, 'enrolledCaptureResult', operationId));
      const external = [];
      for (const object of source.objects) {
        const result = await lab.externalProof(`${rootKey}${object.key}`);
        expect(result).toEqual({ size: object.size, sha256: object.sha256 });
        external.push(result);
      }
      let retirement = null;
      if (kind === 'allocation') {
        const putsBeforeRetirement = lab.proxy.counts.puts;
        retirement = record(await call(active, 'retirePublishedOriginal', operationId));
        expect(retirement).toMatchObject({
          before: [true],
          protectedAfterNativeRemoval: [true],
          after: [false],
          released: 1,
          nativeMediaRemoved: true,
        });
        expect(record(retirement['publication'])).toMatchObject({
          phase: 'published',
          hasNativePayload: false,
          hasPreparedPayload: false,
          objects: [expect.objectContaining({ pinned: false })],
        });
        expect(lab.proxy.counts.puts).toBe(putsBeforeRetirement);
        expect(await lab.externalProof(`${rootKey}${source.objects[0]!.key}`)).toEqual(external[0]);
      }
      const execution = await inspect(active);
      expect(execution?.workspace).toBeNull();
      let markerRefusal = null;
      if (kind === 'join') {
        const before = lab.proxy.counts.puts;
        lab.proxy.armFault({
          method: 'GET',
          key: `${rootKey}.sniptale/workspace.json`,
          kind: 'status',
          status: 404,
          repeat: true,
        });
        const refusedSource = record(await call(active, 'prepareEnrolledSource'));
        const refusedOperationId = refusedSource['operationId'];
        if (typeof refusedOperationId !== 'string')
          throw new Error('Refused source identity is missing.');
        await call(active, 'start');
        await expect
          .poll(async () => record(await operation(active, refusedOperationId))['failureCode'])
          .toBe('invalid-workspace');
        expect(lab.proxy.counts.puts).toBe(before);
        markerRefusal = { failureCode: 'invalid-workspace', noWrites: true };
        lab.proxy.releaseFault();
      }
      await saveProof(info, {
        kind,
        enrolled,
        replay,
        source,
        external,
        execution,
        markerRefusal,
        retirement,
      });
    } finally {
      lab.proxy.releaseFault();
      await joined?.close();
      await creator.close();
    }
  });
}

test('committed capture enters the queue after browser restart without enqueue or Start', async ({
  lab,
}, info) => {
  test.setTimeout(240_000);
  const options = {
    extensionBuildDir: '.tmp/e2e-builds/security',
    ignoreHTTPSErrors: true as const,
    userDataDir: info.outputPath('capture-queue-browser-profile'),
  };
  let driver = await launchWebdavWorkerDriver(options);
  try {
    await driver.grantOrigin(new URL(lab.credentials.rootUrl).origin);
    const authentication = {
      kind: 'basic',
      username: lab.credentials.username,
      password: lab.credentials.password,
    };
    const created = record(
      await call(driver, 'prepareWorkspace', { rootUrl: lab.credentials.rootUrl, authentication })
    );
    const rootKey = created['rootKey'];
    if (typeof rootKey !== 'string') throw new Error('Created workspace path is missing.');
    await call(driver, 'startWorkspace', authentication);
    await waitReady(driver, info);
    await call(driver, 'enrollWorkspace', authentication);
    const captured = record(
      await call(driver, 'prepareEnrolledSource', { captureOnly: true, withProject: true })
    );
    const operationId = captured['operationId'];
    if (typeof operationId !== 'string') throw new Error('Captured operation is missing.');
    const operationIds = captured['operationIds'];
    if (
      !Array.isArray(operationIds) ||
      operationIds.length !== 2 ||
      !operationIds.every((id) => typeof id === 'string')
    )
      throw new Error('Project dependency captures are missing.');
    const beforeRestart = await call(driver, 'state');
    expect(record(record(beforeRestart)['queue'])['operations']).toEqual([]);
    expect(await call(driver, 'enrolledCaptureResult', operationId)).toBeNull();
    expect(await driver.evaluate("chrome.alarms.clear('sniptale:sync-queue-retry')")).toBe(true);
    const extensionId = driver.extensionId;
    await driver.close();
    await rm(join(options.userDataDir, 'DevToolsActivePort'), { force: true });
    driver = await launchWebdavWorkerDriver({ ...options, restoreExtensionId: extensionId });
    expect(driver.extensionId).toBe(extensionId);
    await expect
      .poll(
        async () => {
          const row = await operation(driver, operationId);
          return isRecord(row) ? row['status'] : null;
        },
        { timeout: 150_000 }
      )
      .toBe('published');
    await expect
      .poll(
        async () => {
          const rows = record(record(await call(driver, 'state'))['queue'])['operations'];
          return (
            Array.isArray(rows) &&
            operationIds.every((id) =>
              rows.some(
                (row) => isRecord(row) && row['operationId'] === id && row['status'] === 'published'
              )
            )
          );
        },
        { timeout: 150_000 }
      )
      .toBe(true);
    const publication = record(await call(driver, 'enrolledCaptureResult', operationId));
    expect(publication).toMatchObject({
      phase: 'published',
      hasNativePayload: false,
      hasPreparedPayload: false,
    });
    const published = sourceResult(publication);
    expect(published.objects).toHaveLength(1);
    const expected = captured['expectedOriginal'];
    expect({ size: published.objects[0]!.size, sha256: published.objects[0]!.sha256 }).toEqual(
      expected
    );
    const external = await lab.externalProof(`${rootKey}${published.objects[0]!.key}`);
    expect(external).toEqual(expected);
    const completed = await call(driver, 'state');
    const puts = lab.proxy.counts.puts;
    const progressRevision = record(record(record(completed)['queue'])['connection'])[
      'scheduleProgress'
    ];
    const previousProgress = record(progressRevision)['revision'];
    if (typeof previousProgress !== 'number')
      throw new Error('Native schedule progress is missing.');
    await driver.close();
    await rm(join(options.userDataDir, 'DevToolsActivePort'), { force: true });
    driver = await launchWebdavWorkerDriver({ ...options, restoreExtensionId: extensionId });
    await expect
      .poll(async () => {
        const row = await operation(driver, operationId);
        return isRecord(row) ? row['status'] : null;
      })
      .toBe('published');
    await expect
      .poll(async () => {
        const state = record(await call(driver, 'state'));
        const progress = record(record(record(state['queue'])['connection'])['scheduleProgress']);
        return progress['revision'];
      })
      .toBeGreaterThan(previousProgress);
    const stableFields = [
      'operationId',
      'revision',
      'status',
      'nextDueAt',
      'automaticRetryCount',
      'eventSequence',
      'runId',
      'attemptId',
      'failureCode',
      'outcome',
    ];
    const firstOperation = record(await operation(driver, operationId));
    const completedRows = record(record(completed)['queue'])['operations'];
    if (!Array.isArray(completedRows)) throw new Error('Completed operation proof is missing.');
    const earlierOperation = record(
      completedRows.find((row) => isRecord(row) && row['operationId'] === operationId)
    );
    for (const field of stableFields)
      expect(firstOperation[field]).toEqual(earlierOperation[field]);
    expect(lab.proxy.counts.puts).toBe(puts);
    const additional = record(await call(driver, 'prepareEnrolledSource', { captureOnly: true }));
    const parallel = await call(driver, 'reconcileCapturesInParallel');
    expect(parallel).toEqual(
      expect.arrayContaining([
        { enqueued: 1, existing: 2, refused: 0 },
        { enqueued: 0, existing: 3, refused: 0 },
      ])
    );
    const afterParallel = record(record(await call(driver, 'state'))['queue'])['operations'];
    if (!Array.isArray(afterParallel)) throw new Error('Parallel queue proof is missing.');
    expect(afterParallel.map((row) => record(row)['operationId']).sort()).toEqual(
      [...operationIds, additional['operationId']].sort()
    );
    await saveProof(info, {
      parallel,
      captured,
      beforeRestart,
      completed,
      external,
      fullBrowserRestart: true,
      duplicateRestartNoWrites: true,
    });
  } finally {
    await driver.close();
  }
});

test('offline saves exceed 128 captures and discovery resumes bounded pages after browser restart', async ({
  lab,
}, info) => {
  test.setTimeout(300_000);
  const options = {
    extensionBuildDir: '.tmp/e2e-builds/security',
    ignoreHTTPSErrors: true as const,
    userDataDir: info.outputPath('capture-capacity-browser-profile'),
  };
  let driver = await launchWebdavWorkerDriver(options);
  const pages: unknown[] = [];
  try {
    await driver.grantOrigin(new URL(lab.credentials.rootUrl).origin);
    const authentication = {
      kind: 'basic',
      username: lab.credentials.username,
      password: lab.credentials.password,
    };
    const created = record(
      await call(driver, 'prepareWorkspace', { rootUrl: lab.credentials.rootUrl, authentication })
    );
    const rootKey = created['rootKey'];
    if (typeof rootKey !== 'string') throw new Error('Workspace path is missing.');
    await call(driver, 'startWorkspace', authentication);
    await waitReady(driver, info);
    await call(driver, 'enrollWorkspace', authentication);
    await driver.evaluate("chrome.alarms.clear('sniptale:sync-queue-retry')");
    const putsBeforeCapture = lab.proxy.counts.puts;
    const fixture = record(await call(driver, 'prepareCapacity'));
    const source = record(fixture['source']);
    const operationId = source['operationId'];
    const projectId = fixture['projectId'];
    if (typeof operationId !== 'string' || typeof projectId !== 'string')
      throw new Error('Capacity fixture identities are missing.');
    for (let index = 1; index < 132; index += 1) {
      const saved = record(await call(driver, 'appendCapacityRevision', { projectId, index }));
      expect(saved['name']).toBe(`Offline ${index}`);
    }
    await saveProof(info, { stage: 'offline-native-saves', acceptedRevisions: 132, projectId });
    const before = record(await call(driver, 'capacityState', projectId));
    await saveProof(info, { stage: 'before-restart', before });
    expect(before['captureCount']).toBe(133);
    expect(record(record(before['project'])['project'])['name']).toBe('Offline 131');
    expect(before['operations']).toEqual([]);
    const extensionId = driver.extensionId;
    let previousCaptureRevision = 0;
    for (const count of [64, 128, 133]) {
      await saveProof(info, { stage: 'before-page-restart', expectedCount: count, pages });
      await driver.evaluate("chrome.alarms.clear('sniptale:sync-queue-retry')");
      await driver.close();
      await rm(join(options.userDataDir, 'DevToolsActivePort'), { force: true });
      driver = await launchWebdavWorkerDriver({ ...options, restoreExtensionId: extensionId });
      await expect
        .poll(
          async () => {
            const state = record(await call(driver, 'capacityState', projectId));
            const rows = state['operations'];
            const progress = record(state['connection'])['captureProgress'];
            return Array.isArray(rows) &&
              isRecord(progress) &&
              typeof progress['revision'] === 'number' &&
              progress['revision'] > previousCaptureRevision
              ? rows.length
              : null;
          },
          { timeout: 60_000 }
        )
        .toBe(count);
      const state = record(await call(driver, 'capacityState', projectId));
      const progress = record(record(state['connection'])['captureProgress']);
      if (typeof progress['revision'] !== 'number')
        throw new Error('Capture progress revision is missing.');
      previousCaptureRevision = progress['revision'];
      expect(state['captureCount']).toBe(133);
      expect(record(state['connection'])['paused']).toBe(true);
      const rows = state['operations'];
      if (!Array.isArray(rows)) throw new Error('Capacity queue is missing.');
      expect(new Set(rows.map((row) => record(row)['operationId'])).size).toBe(count);
      expect(rows.every((row) => record(row)['status'] === 'queued')).toBe(true);
      pages.push(state);
    }
    expect(lab.proxy.counts.puts).toBe(putsBeforeCapture);
    const finalPage = record(pages.at(-1));
    expect(record(record(finalPage['connection'])['captureProgress'])['afterKey']).toBeNull();
    await call(driver, 'resumeCapacityOriginal', operationId);
    await driver.evaluate("chrome.alarms.clear('sniptale:sync-queue-retry')");
    await driver.close();
    await rm(join(options.userDataDir, 'DevToolsActivePort'), { force: true });
    driver = await launchWebdavWorkerDriver({ ...options, restoreExtensionId: extensionId });
    try {
      await expect
        .poll(
          async () => {
            return record(await call(driver, 'capacityOperation', operationId))['status'];
          },
          { timeout: 120_000 }
        )
        .toBe('published');
    } catch (error) {
      const locks = await driver.evaluate(`navigator.locks.query().then(state => ({
        held: state.held.filter(lock => lock.name.startsWith('sniptale:persistence')).map(({name,mode}) => ({name,mode})),
        pending: state.pending.filter(lock => lock.name.startsWith('sniptale:persistence')).map(({name,mode}) => ({name,mode}))
      }))`);
      await saveProof(info, { stage: 'selected-native-read-refused', locks, pages });
      throw error;
    }
    const publication = record(await call(driver, 'enrolledCaptureResult', operationId));
    expect(publication).toMatchObject({
      phase: 'published',
      hasNativePayload: false,
      hasPreparedPayload: false,
    });
    const published = sourceResult(publication);
    const external = await lab.externalProof(`${rootKey}${published.objects[0]!.key}`);
    expect(external).toEqual(source['expectedOriginal']);
    const final = record(await call(driver, 'capacityState', projectId));
    expect(final['captureCount']).toBe(133);
    expect(record(record(final['project'])['project'])['name']).toBe('Offline 131');
    await saveProof(info, {
      before,
      pages,
      final,
      external,
      browserRestarts: 4,
      explicitEnqueueOrStart: false,
    });
  } finally {
    lab.proxy.releaseFault();
    await driver.close();
  }
});
