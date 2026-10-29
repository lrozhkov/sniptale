import { expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { test, saveProof } from './webdav-fixtures';
import { launchWebdavWorkerDriver } from './webdav-worker-driver';

function record(value: unknown) {
  if (!isRecord(value)) throw new Error('Lifecycle proof expected an object.');
  return value;
}
function nativeRunSnapshot(value: unknown) {
  const native = record(value);
  const queue = record(native['queue']);
  const { scheduleProgress, ...connection } = record(queue['connection']);
  void scheduleProgress;
  const operations = queue['operations'];
  if (!Array.isArray(operations)) throw new Error('Native queue operations are missing.');
  return {
    ...native,
    queue: {
      ...queue,
      connection,
      operations: operations.map((value) => {
        const { nextDueAt, ...operation } = record(value);
        void nextDueAt;
        return operation;
      }),
    },
  };
}
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function open(credentials: { rootUrl: string; username: string; password: string }) {
  const driver = await launchWebdavWorkerDriver({
    extensionBuildDir:
      process.env['SNIPTALE_WEBDAV_LIFECYCLE_BUILD_DIR'] ?? '.tmp/e2e-builds/security',
    ignoreHTTPSErrors: true,
  });
  try {
    console.log('Lifecycle: grant origin');
    await driver.grantOrigin(new URL(credentials.rootUrl).origin);
    console.log('Lifecycle: seed native source');
    const seeded = await driver.evaluate(
      `window.webdavLifecycle.prepare(${JSON.stringify({
        rootUrl: credentials.rootUrl,
        authentication: {
          kind: 'basic',
          username: credentials.username,
          password: credentials.password,
        },
      })})`
    );
    console.log('Lifecycle: native source ready');
    return { driver, seeded };
  } catch (error) {
    await driver.close();
    throw error;
  }
}

test('offscreen retains one native run through a real worker restart and 38 seconds without keepalive', async ({
  lab,
}, info) => {
  test.setTimeout(180_000);
  const { driver, seeded } = await open(lab.credentials);
  try {
    lab.proxy.armFault({ method: 'PUT', key: '*', kind: 'hold-response-headers' });
    console.log('Lifecycle: start executor');
    const admitted = await driver.evaluate('window.webdavLifecycle.start()');
    expect(admitted).toMatchObject({ ok: true });
    await lab.proxy.waitForFault();
    const before = await driver.evaluate('window.webdavLifecycle.inspect()');
    const nativeBefore = await driver.evaluate('window.webdavLifecycle.state()');
    const stopped = await driver.stopWorker();
    const heldAt = Date.now();
    await delay(38_000);
    const targets = await driver.workerTargets();
    expect(targets.every((worker) => !worker.attached)).toBe(true);
    expect(targets.every((worker) => worker.targetId !== stopped.oldTargetId)).toBe(true);
    const after = await driver.evaluate('window.webdavLifecycle.inspect()');
    expect(record(after)['sync']).toEqual(record(before)['sync']);
    const nativeAfter = await driver.evaluate('window.webdavLifecycle.state()');
    expect(nativeRunSnapshot(nativeAfter)).toEqual(nativeRunSnapshot(nativeBefore));
    const oldProgress = record(record(record(nativeBefore)['queue'])['connection'])[
      'scheduleProgress'
    ];
    const newProgress = record(record(record(nativeAfter)['queue'])['connection'])[
      'scheduleProgress'
    ];
    if (oldProgress !== null) {
      const prior = record(oldProgress);
      const current = record(newProgress);
      expect(current['authorization']).toEqual(prior['authorization']);
      const revision = prior['revision'];
      if (typeof revision !== 'number') throw new Error('Native schedule revision is missing.');
      expect(current['revision']).toBeGreaterThanOrEqual(revision);
    }
    const oldOperations = record(record(nativeBefore)['queue'])['operations'];
    const newOperations = record(record(nativeAfter)['queue'])['operations'];
    if (!Array.isArray(oldOperations) || !Array.isArray(newOperations))
      throw new Error('Native queue operations are missing.');
    expect(newOperations).toHaveLength(oldOperations.length);
    for (const [index, row] of oldOperations.entries()) {
      const dueAt = record(row)['nextDueAt'];
      if (typeof dueAt !== 'number') throw new Error('Native recovery deadline is missing.');
      expect(record(newOperations[index])['nextDueAt']).toBeGreaterThanOrEqual(dueAt);
    }
    lab.proxy.releaseFault();
    await expect
      .poll(
        async () => {
          const result = record(await driver.evaluate('window.webdavLifecycle.inspect()'));
          const snapshot = record(result['sync']);
          const jobs = snapshot['jobs'];
          return (
            Array.isArray(jobs) && jobs.some((job) => isRecord(job) && job['state'] === 'published')
          );
        },
        { timeout: 60_000 }
      )
      .toBe(true);
    const complete = lab.proxy.counts.putBodies.filter((body) => body.complete);
    expect(new Set(complete.map((body) => body.key)).size).toBe(complete.length);
    const external = [];
    for (const body of complete.filter((body) => body.key.startsWith('Files/'))) {
      const proof = await lab.externalProof(body.key);
      expect(proof).toEqual({ size: body.bytes, sha256: body.sha256 });
      external.push(proof);
    }
    expect(external.length).toBeGreaterThan(0);
    expect(external).toContainEqual(record(record(seeded)['source'])['original']);
    await saveProof(info, {
      seeded,
      admitted,
      before,
      after,
      nativeBefore,
      nativeAfter,
      stopped,
      heldMilliseconds: Date.now() - heldAt,
      workerTargets: targets,
      external,
      noWorkerAttachment: true,
      noWorkerEvaluation: true,
      noHeartbeat: true,
    });
  } catch (error) {
    await saveProof(info, { failed: true, counts: requestCounts(lab.proxy.counts) });
    throw error;
  } finally {
    lab.proxy.releaseFault();
    await driver.close();
  }
});

for (const kind of ['hold-response-headers', 'hold-response-body'] as const) {
  test(`privacy erasure drains ${kind} before storage and permits no late DAV request`, async ({
    lab,
  }, info) => {
    const { driver } = await open(lab.credentials);
    try {
      // PUT responses have no body. A root PROPFIND supplies real XML for the body gate.
      lab.proxy.armFault(
        kind === 'hold-response-headers'
          ? { method: 'PUT', key: '*', kind }
          : { method: 'PROPFIND', key: '', kind }
      );
      expect(await driver.evaluate('window.webdavLifecycle.start()')).toMatchObject({ ok: true });
      await lab.proxy.waitForFault();
      const erasure = await driver.evaluate('window.webdavLifecycle.erase()');
      expect(erasure).toMatchObject({ ok: true, sync: true });
      const counts = {
        puts: lab.proxy.counts.puts,
        gets: lab.proxy.counts.gets,
        propfinds: lab.proxy.counts.propfinds,
      };
      lab.proxy.releaseFault();
      // An acknowledged erasure must leave no producer that can issue its next subrequest.
      expect(await driver.evaluate('window.webdavLifecycle.inspect()')).toMatchObject({
        ok: true,
        sync: null,
      });
      expect({
        puts: lab.proxy.counts.puts,
        gets: lab.proxy.counts.gets,
        propfinds: lab.proxy.counts.propfinds,
      }).toEqual(counts);
      const after = record(await driver.evaluate('window.webdavLifecycle.empty()'));
      for (const field of [
        'connections',
        'captures',
        'queue',
        'assets',
        'owners',
        'media',
        'projectAssets',
        'projects',
      ])
        expect(after[field], field).toBe(0);
      expect(Array.isArray(after['sourceObjectsReadable'])).toBe(true);
      expect(after['sourceObjectsReadable']).not.toContain(true);
      await saveProof(info, { kind, erasure, counts, after });
    } finally {
      lab.proxy.releaseFault();
      await driver.close();
    }
  });
}

async function openWorkspace(credentials: { rootUrl: string; username: string; password: string }) {
  const driver = await launchWebdavWorkerDriver({
    extensionBuildDir:
      process.env['SNIPTALE_WEBDAV_LIFECYCLE_BUILD_DIR'] ?? '.tmp/e2e-builds/security',
    ignoreHTTPSErrors: true,
  });
  const authentication = {
    kind: 'basic',
    username: credentials.username,
    password: credentials.password,
  };
  try {
    await driver.grantOrigin(new URL(credentials.rootUrl).origin);
    const prepared = record(
      await driver.evaluate(
        `window.webdavLifecycle.prepareWorkspace(${JSON.stringify({ rootUrl: credentials.rootUrl, authentication })})`
      )
    );
    const rootKey = prepared['rootKey'];
    if (typeof rootKey !== 'string' || !/^Sniptale-[a-f0-9-]+\/$/u.test(rootKey))
      throw new Error('Native workspace fixture root is invalid.');
    const native = await driver.evaluate('window.webdavLifecycle.workspaceState()');
    expect(native).toMatchObject({ profiles: 0, connections: 0, allocation: { phase: 'planned' } });
    return {
      driver,
      prepared,
      rootKey,
      start: () =>
        driver.evaluate(`window.webdavLifecycle.startWorkspace(${JSON.stringify(authentication)})`),
      refusedStart: () =>
        driver.evaluate(
          `window.webdavLifecycle.startWorkspace(${JSON.stringify(authentication)})` +
            '.then(()=>({refused:false}),()=>({refused:true}))'
        ),
    };
  } catch (error) {
    await driver.close();
    throw error;
  }
}

function requestCounts(counts: { puts: number; gets: number; propfinds: number; mkcols: number }) {
  return {
    puts: counts.puts,
    gets: counts.gets,
    propfinds: counts.propfinds,
    mkcols: counts.mkcols,
  };
}

function workspacePhase(value: unknown) {
  const sync = record(value)['sync'];
  if (sync === null) return null;
  const workspace = record(sync)['workspace'];
  return workspace === null ? null : record(workspace)['state'];
}

test('workspace creation survives a real worker restart with a held marker body and no repeated PUT', async ({
  lab,
}, info) => {
  test.setTimeout(180_000);
  const { driver, prepared, rootKey, start } = await openWorkspace(lab.credentials);
  try {
    const markerKey = `${rootKey}.sniptale/workspace.json`;
    lab.proxy.armFault({ method: 'GET', key: markerKey, kind: 'hold-response-body' });
    const admitted = await start();
    expect(admitted).toMatchObject({ ok: true });
    await lab.proxy.waitForFault();
    const before = await driver.evaluate('window.webdavLifecycle.inspect()');
    expect(workspacePhase(before)).toBe('running');
    const nativeBefore = await driver.evaluate('window.webdavLifecycle.workspaceState()');
    expect(nativeBefore).toMatchObject({
      profiles: 0,
      connections: 0,
      allocation: { phase: 'publishing-marker' },
    });
    const putsBeforeRestart = lab.proxy.counts.puts;
    expect(putsBeforeRestart).toBeGreaterThan(0);
    const stopped = await driver.stopWorker();
    const heldAt = Date.now();
    await delay(38_000);
    const targets = await driver.workerTargets();
    expect(targets.every((worker) => !worker.attached)).toBe(true);
    expect(targets.every((worker) => worker.targetId !== stopped.oldTargetId)).toBe(true);
    const after = await driver.evaluate('window.webdavLifecycle.inspect()');
    expect(record(after)['sync']).toEqual(record(before)['sync']);
    expect(await driver.evaluate('window.webdavLifecycle.workspaceState()')).toEqual(nativeBefore);
    expect(lab.proxy.counts.puts).toBe(putsBeforeRestart);
    lab.proxy.releaseFault();
    await expect
      .poll(async () => workspacePhase(await driver.evaluate('window.webdavLifecycle.inspect()')), {
        timeout: 60_000,
      })
      .toBe('ready');
    const nativeAfter = await driver.evaluate('window.webdavLifecycle.workspaceState()');
    expect(nativeAfter).toMatchObject({
      profiles: 0,
      connections: 0,
      allocation: { phase: 'ready' },
    });
    expect(lab.proxy.counts.puts).toBe(putsBeforeRestart);
    const markerBody = lab.proxy.counts.putBodies.find(
      (body) => body.key === markerKey && body.complete
    );
    expect(markerBody).toBeDefined();
    const external = await lab.externalProof(markerKey);
    expect(external).toEqual({ size: markerBody?.bytes, sha256: markerBody?.sha256 });
    await saveProof(info, {
      prepared,
      admitted,
      before,
      after,
      nativeBefore,
      nativeAfter,
      stopped,
      heldMilliseconds: Date.now() - heldAt,
      workerTargets: targets,
      putsBeforeRestart,
      putsAfterCompletion: lab.proxy.counts.puts,
      external,
      noWorkerAttachment: true,
      noWorkerEvaluation: true,
      noHeartbeat: true,
    });
  } catch (error) {
    await saveProof(info, { failed: true, counts: requestCounts(lab.proxy.counts) });
    throw error;
  } finally {
    lab.proxy.releaseFault();
    await driver.close();
  }
});

test('origin removal retires workspace, drains root headers and refuses old start', async ({
  lab,
}, info) => {
  const { driver, prepared, rootKey, start, refusedStart } = await openWorkspace(lab.credentials);
  try {
    lab.proxy.armFault({ method: 'MKCOL', key: rootKey, kind: 'hold-response-headers' });
    const admitted = await start();
    expect(admitted).toMatchObject({ ok: true });
    await lab.proxy.waitForFault();
    expect(await driver.evaluate('window.webdavLifecycle.workspaceState()')).toMatchObject({
      profiles: 0,
      connections: 0,
      allocation: { phase: 'allocating' },
    });
    const originPattern = `${new URL(lab.credentials.rootUrl).origin}/*`;
    expect(
      await driver.evaluate(
        `chrome.permissions.remove({origins:[${JSON.stringify(originPattern)}]})`
      )
    ).toBe(true);
    await expect
      .poll(
        async () => {
          const snapshot = record(await driver.evaluate('window.webdavLifecycle.inspect()'))[
            'sync'
          ];
          return snapshot === null ? 'stopped' : record(snapshot)['phase'];
        },
        { timeout: 30_000 }
      )
      .toBe('stopped');
    const abandoned = await driver.evaluate('window.webdavLifecycle.workspaceState()');
    expect(abandoned).toMatchObject({
      profiles: 0,
      connections: 0,
      allocation: { phase: 'abandoned' },
    });
    const counts = requestCounts(lab.proxy.counts);
    expect(counts.puts).toBe(0);
    lab.proxy.releaseFault();
    // Restore only the optional permission. A revoked native lifetime must remain closed.
    await driver.grantOrigin(new URL(lab.credentials.rootUrl).origin);
    expect(await refusedStart()).toEqual({ refused: true });
    const after = await driver.evaluate('window.webdavLifecycle.workspaceState()');
    expect(after).toEqual(abandoned);
    expect(requestCounts(lab.proxy.counts)).toEqual(counts);
    await saveProof(info, {
      prepared,
      admitted,
      abandoned,
      after,
      counts,
      oldSelectionRefused: true,
    });
  } catch (error) {
    await saveProof(info, { failed: true, counts: requestCounts(lab.proxy.counts) });
    throw error;
  } finally {
    lab.proxy.releaseFault();
    await driver.close();
  }
});

test('core erasure drains a held workspace marker body and late completion cannot recreate the journal', async ({
  lab,
}, info) => {
  const { driver, prepared, rootKey, start, refusedStart } = await openWorkspace(lab.credentials);
  try {
    lab.proxy.armFault({
      method: 'GET',
      key: `${rootKey}.sniptale/workspace.json`,
      kind: 'hold-response-body',
    });
    const admitted = await start();
    expect(admitted).toMatchObject({ ok: true });
    await lab.proxy.waitForFault();
    expect(await driver.evaluate('window.webdavLifecycle.workspaceState()')).toMatchObject({
      profiles: 0,
      connections: 0,
      allocation: { phase: 'publishing-marker' },
    });
    const erasure = await driver.evaluate('window.webdavLifecycle.erase()');
    expect(erasure).toEqual({ ok: true, sync: true });
    const counts = requestCounts(lab.proxy.counts);
    const erased = await driver.evaluate('window.webdavLifecycle.workspaceState()');
    expect(erased).toMatchObject({ allocation: null, profiles: 0, connections: 0 });
    lab.proxy.releaseFault();
    expect(await refusedStart()).toEqual({ refused: true });
    expect(await driver.evaluate('window.webdavLifecycle.inspect()')).toMatchObject({
      ok: true,
      sync: null,
    });
    const after = await driver.evaluate('window.webdavLifecycle.workspaceState()');
    expect(after).toMatchObject({ allocation: null, profiles: 0, connections: 0 });
    expect(requestCounts(lab.proxy.counts)).toEqual(counts);
    await saveProof(info, {
      prepared,
      admitted,
      erasure,
      erased,
      after,
      counts,
      oldSelectionRefused: true,
    });
  } catch (error) {
    await saveProof(info, { failed: true, counts: requestCounts(lab.proxy.counts) });
    throw error;
  } finally {
    lab.proxy.releaseFault();
    await driver.close();
  }
});

test('offscreen queue verifies publication after an externally delayed retry of temporary PUT 423', async ({
  lab,
}, info) => {
  test.setTimeout(180_000);
  const { driver, seeded } = await open(lab.credentials);
  const operationId = record(record(seeded)['selection'])['operationId'];
  const countsBefore = requestCounts(lab.proxy.counts);
  const proofLimit = 'Externally driven delayed retry; automatic durable scheduling is not proved.';
  let failedNative: unknown = null;
  let failedCounts: unknown = null;
  let delayedNative: unknown = null;
  let retrySelection: unknown = null;
  let completedNative: unknown = null;
  let initialPutBodies: unknown = null;
  function operation(value: unknown) {
    const rows = record(record(value)['queue'])['operations'];
    if (!Array.isArray(rows)) throw new Error('Native lifecycle queue is missing.');
    expect(rows).toHaveLength(1);
    const row = rows.find((item) => isRecord(item) && item['operationId'] === operationId);
    return record(row);
  }
  try {
    if (typeof operationId !== 'string') throw new Error('Native lifecycle operation is missing.');
    lab.proxy.armFault({ method: 'PUT', key: '*', kind: 'status', status: 423, repeat: true });
    const firstAdmission = await driver.evaluate('window.webdavLifecycle.start()');
    expect(firstAdmission).toMatchObject({ ok: true });
    await lab.proxy.waitForFault();
    await expect
      .poll(
        async () => {
          failedNative = await driver.evaluate('window.webdavLifecycle.state()');
          const row = operation(failedNative);
          return { status: row['status'], failureCode: row['failureCode'] };
        },
        { timeout: 60_000 }
      )
      .toEqual({ status: 'failed', failureCode: 'temporary' });
    await expect
      .poll(
        async () => {
          const inspected = record(await driver.evaluate('window.webdavLifecycle.inspect()'));
          const snapshot = record(inspected['sync']);
          const jobs = snapshot['jobs'];
          return (
            snapshot['phase'] === 'idle' &&
            Array.isArray(jobs) &&
            jobs.some(
              (job) =>
                isRecord(job) &&
                job['operationId'] === operationId &&
                job['state'] === 'failed' &&
                job['failureCode'] === 'temporary'
            )
          );
        },
        { timeout: 30_000 }
      )
      .toBe(true);
    const originalSource = record(failedNative)['source'];
    expect(originalSource).toMatchObject({ mediaExists: true, projectExists: true });
    expect(record(originalSource)['captureCount']).toBeGreaterThan(0);
    const retainedObjects = record(originalSource)['objects'];
    expect(Array.isArray(retainedObjects)).toBe(true);
    if (!Array.isArray(retainedObjects)) throw new Error('Native source objects are missing.');
    expect(retainedObjects.length).toBeGreaterThan(0);
    expect(retainedObjects.every((object) => isRecord(object) && object['readable'] === true)).toBe(
      true
    );
    failedCounts = requestCounts(lab.proxy.counts);
    expect(record(failedCounts)['puts']).toBe(countsBefore.puts + 1);
    const delayStartedAt = Date.now();
    // The external driver owns this observation delay; no application retry timer is installed.
    await delay(1_000);
    const deferredMilliseconds = Date.now() - delayStartedAt;
    expect(deferredMilliseconds).toBeGreaterThanOrEqual(1_000);
    expect(requestCounts(lab.proxy.counts)).toEqual(failedCounts);
    delayedNative = await driver.evaluate('window.webdavLifecycle.state()');
    expect(operation(delayedNative)).toEqual(operation(failedNative));
    expect(record(delayedNative)['source']).toEqual(originalSource);
    initialPutBodies = lab.proxy.counts.putBodies.map((body) => ({ ...body }));
    const retryBodyStart = lab.proxy.counts.putBodies.length;
    lab.proxy.releaseFault();
    retrySelection = await driver.evaluate('window.webdavLifecycle.retry()');
    expect(retrySelection).toMatchObject({ operationId });
    const failedRevision = operation(failedNative)['revision'];
    if (typeof failedRevision !== 'number') throw new Error('Native failed revision is missing.');
    expect(record(retrySelection)['expectedRevision']).toBeGreaterThan(failedRevision);
    const retryAdmission = await driver.evaluate(
      `window.webdavLifecycle.start(${JSON.stringify(retrySelection)})`
    );
    expect(retryAdmission).toMatchObject({ ok: true });
    await expect
      .poll(
        async () => {
          completedNative = await driver.evaluate('window.webdavLifecycle.state()');
          const row = operation(completedNative);
          return {
            status: row['status'],
            outcome: row['outcome'],
            failureCode: row['failureCode'],
          };
        },
        { timeout: 60_000 }
      )
      .toEqual({ status: 'published', outcome: 'verified', failureCode: null });
    await expect
      .poll(
        async () => {
          const inspected = record(await driver.evaluate('window.webdavLifecycle.inspect()'));
          return record(inspected['sync'])['phase'];
        },
        { timeout: 30_000 }
      )
      .toBe('idle');
    expect(record(completedNative)['source']).toEqual(originalSource);
    const completeBodies = lab.proxy.counts.putBodies
      .slice(retryBodyStart)
      .filter((body) => body.complete);
    const external = [];
    for (const body of completeBodies.filter((body) => body.key.startsWith('Files/'))) {
      const proof = await lab.externalProof(body.key);
      expect(proof).toEqual({ size: body.bytes, sha256: body.sha256 });
      external.push({ key: body.key, ...proof });
    }
    expect(external.length).toBeGreaterThan(0);
    expect(external.map(({ size, sha256 }) => ({ size, sha256 }))).toContainEqual(
      record(record(seeded)['source'])['original']
    );
    const completedCounts = requestCounts(lab.proxy.counts);
    const replay = await driver.evaluate(
      `window.webdavLifecycle.start(${JSON.stringify(retrySelection)})`
    );
    expect(replay).toMatchObject({ ok: true });
    expect(
      await driver.evaluate(
        'window.webdavLifecycle.retry().then(()=>({refused:false}),()=>({refused:true}))'
      )
    ).toEqual({ refused: true });
    await delay(1_000);
    expect(requestCounts(lab.proxy.counts)).toEqual(completedCounts);
    expect(operation(await driver.evaluate('window.webdavLifecycle.state()'))).toEqual(
      operation(completedNative)
    );
    await saveProof(info, {
      proofLimit,
      seeded,
      countsBefore,
      firstAdmission,
      failedNative,
      failedCounts,
      initialPutBodies,
      deferredMilliseconds,
      delayedNative,
      retrySelection,
      retryAdmission,
      completedNative,
      completedCounts,
      external,
      replay,
      replayCounts: requestCounts(lab.proxy.counts),
    });
  } catch (error) {
    await saveProof(info, {
      failed: true,
      proofLimit,
      seeded,
      countsBefore,
      failedNative,
      failedCounts,
      initialPutBodies,
      delayedNative,
      retrySelection,
      completedNative,
      counts: requestCounts(lab.proxy.counts),
    });
    throw error;
  } finally {
    lab.proxy.releaseFault();
    await driver.close();
  }
});

function selectedNativeOperation(value: unknown, operationId: string) {
  const operations = record(record(value)['queue'])['operations'];
  if (!Array.isArray(operations)) throw new Error('Native lifecycle queue is missing.');
  expect(operations).toHaveLength(1);
  return record(operations.find((row) => isRecord(row) && row['operationId'] === operationId));
}

for (const restartBrowser of [false, true]) {
  test(`PUT 423 retries${restartBrowser ? ' after browser restart without alarm' : ''}`, async ({
    lab,
  }, info) => {
    test.setTimeout(240_000);
    const profile = await mkdtemp(join(tmpdir(), 'sniptale-webdav-retry-'));
    const options = {
      extensionBuildDir:
        process.env['SNIPTALE_WEBDAV_LIFECYCLE_BUILD_DIR'] ?? '.tmp/e2e-builds/security',
      ignoreHTTPSErrors: true as const,
      userDataDir: profile,
    };
    let driver = await launchWebdavWorkerDriver(options);
    let failedNative: unknown = null;
    let completedNative: unknown = null;
    try {
      await driver.grantOrigin(new URL(lab.credentials.rootUrl).origin);
      const seeded = record(
        await driver.evaluate(
          `window.webdavLifecycle.prepare(${JSON.stringify({
            rootUrl: lab.credentials.rootUrl,
            authentication: {
              kind: 'basic',
              username: lab.credentials.username,
              password: lab.credentials.password,
            },
          })})`
        )
      );
      const operationId = record(seeded['selection'])['operationId'];
      if (typeof operationId !== 'string') throw new Error('Native operation is missing.');
      lab.proxy.armFault({ method: 'PUT', key: '*', kind: 'status', status: 423, repeat: true });
      expect(await driver.evaluate('window.webdavLifecycle.start()')).toMatchObject({ ok: true });
      await expect.poll(() => lab.proxy.counts.puts, { timeout: 30_000 }).toBeGreaterThan(0);
      await lab.proxy.waitForFault();
      await expect
        .poll(
          async () => {
            failedNative = await driver.evaluate('window.webdavLifecycle.state()');
            const operation = selectedNativeOperation(failedNative, operationId);
            return { status: operation['status'], failureCode: operation['failureCode'] };
          },
          { timeout: 30_000 }
        )
        .toEqual({ status: 'failed', failureCode: 'temporary' });
      const failed = selectedNativeOperation(failedNative, operationId);
      const dueAt = failed['nextDueAt'];
      if (typeof dueAt !== 'number') throw new Error('Native retry deadline is missing.');
      expect(dueAt).toBeGreaterThan(Date.now());
      const countsBeforeRetry = requestCounts(lab.proxy.counts);
      const retainedSource = record(failedNative)['source'];
      expect(retainedSource).toMatchObject({ mediaExists: true, projectExists: true });
      const retainedObjects = record(retainedSource)['objects'];
      expect(
        Array.isArray(retainedObjects) &&
          retainedObjects.length > 0 &&
          retainedObjects.every((object) => isRecord(object) && object['readable'] === true)
      ).toBe(true);
      // The history alarm is not a transfer wake-up or authority.
      await driver.evaluate(
        "chrome.alarms.create('sniptale:sync-queue-history',{when:Date.now()+100})"
      );
      await delay(1_000);
      expect(requestCounts(lab.proxy.counts)).toEqual(countsBeforeRetry);
      lab.proxy.releaseFault();
      const bodyStart = lab.proxy.counts.putBodies.length;
      if (restartBrowser) {
        expect(await driver.evaluate("chrome.alarms.clear('sniptale:sync-queue-retry')")).toBe(
          true
        );
        const extensionId = driver.extensionId;
        await driver.close();
        // This test owns the profile. Require a fresh CDP endpoint after the old browser exits.
        await rm(join(profile, 'DevToolsActivePort'), { force: true });
        driver = await launchWebdavWorkerDriver({ ...options, restoreExtensionId: extensionId });
        expect(driver.extensionId).toBe(extensionId);
        expect(
          await driver.evaluate(
            `chrome.permissions.contains({origins:[${JSON.stringify(new URL(lab.credentials.rootUrl).origin + '/*')}]})`
          )
        ).toBe(true);
        await expect
          .poll(() => driver.evaluate("chrome.alarms.get('sniptale:sync-queue-retry')"), {
            timeout: 15_000,
          })
          .toMatchObject({ periodInMinutes: 1 });
      }
      // These page-owned native reads send no command or keepalive to the worker.
      while (Date.now() < dueAt - 1_000) {
        expect(requestCounts(lab.proxy.counts)).toEqual(countsBeforeRetry);
        await delay(Math.min(1_000, dueAt - 1_000 - Date.now()));
      }
      expect(requestCounts(lab.proxy.counts)).toEqual(countsBeforeRetry);
      await expect
        .poll(
          async () => {
            completedNative = await driver.evaluate('window.webdavLifecycle.state()');
            return selectedNativeOperation(completedNative, operationId)['status'];
          },
          { timeout: 150_000, intervals: [1_000] }
        )
        .toBe('published');
      expect(selectedNativeOperation(completedNative, operationId)).toMatchObject({
        operationId,
        outcome: 'verified',
        failureCode: null,
        nextDueAt: null,
        automaticRetryCount: 1,
      });
      expect(record(record(completedNative)['source'])['captureCount']).toBeGreaterThan(0);
      const external = [];
      for (const body of lab.proxy.counts.putBodies
        .slice(bodyStart)
        .filter((body) => body.complete && body.key.startsWith('Files/'))) {
        const proof = await lab.externalProof(body.key);
        expect(proof).toEqual({ size: body.bytes, sha256: body.sha256 });
        external.push({ key: body.key, ...proof });
      }
      expect(external.map(({ size, sha256 }) => ({ size, sha256 }))).toContainEqual(
        record(seeded['source'])['original']
      );
      await saveProof(info, {
        seeded,
        failedNative,
        completedNative,
        countsBeforeRetry,
        dueAt,
        restartBrowser,
        external,
        driverRetry: false,
        driverRestartStart: false,
        workerEvaluation: false,
      });
    } catch (error) {
      const diagnostics = await driver
        .evaluate(`Promise.all([
        chrome.alarms.getAll(),
        chrome.permissions.contains({origins:[${JSON.stringify(new URL(lab.credentials.rootUrl).origin + '/*')}]}),
        chrome.storage.local.get('sniptale_runtime_diagnostic_log').then(value =>
          value.sniptale_runtime_diagnostic_log?.entries?.filter(entry =>
            ['SyncQueueRetry','BackgroundRuntimeWiring','BackgroundOffscreenDocument'].includes(entry.source))),
        window.webdavLifecycle.inspect().then(value => value, () => ({ inspectionRefused: true }))
      ])`)
        .catch(() => ({ diagnosticsUnavailable: true }));
      await saveProof(info, {
        failed: true,
        diagnosticsAfterFailure: diagnostics,
        failedNative,
        completedNative,
        counts: requestCounts(lab.proxy.counts),
        restartBrowser,
      });
      throw error;
    } finally {
      lab.proxy.releaseFault();
      await driver.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
