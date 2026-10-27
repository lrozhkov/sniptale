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
  return driver.evaluate(
    `window.webdavLifecycle.${method}(${argument === undefined ? '' : JSON.stringify(argument)})`
  );
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
      const source = sourceResult(await call(active, 'prepareEnrolledSource'));
      await call(active, 'start');
      await expect
        .poll(async () => record(await operation(active, source.operationId))['status'])
        .toBe('published');
      const external = [];
      for (const object of source.objects) {
        const result = await lab.externalProof(`${rootKey}${object.key}`);
        expect(result).toEqual({ size: object.size, sha256: object.sha256 });
        external.push(result);
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
        const refusedSource = sourceResult(await call(active, 'prepareEnrolledSource'));
        await call(active, 'start');
        await expect
          .poll(
            async () => record(await operation(active, refusedSource.operationId))['failureCode']
          )
          .toBe('invalid-workspace');
        expect(lab.proxy.counts.puts).toBe(before);
        markerRefusal = { failureCode: 'invalid-workspace', noWrites: true };
        lab.proxy.releaseFault();
      }
      await saveProof(info, { kind, enrolled, replay, source, external, execution, markerRefusal });
    } finally {
      lab.proxy.releaseFault();
      await joined?.close();
      await creator.close();
    }
  });
}
