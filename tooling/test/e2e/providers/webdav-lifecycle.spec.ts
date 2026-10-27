import { expect } from '@playwright/test';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { test, saveProof } from './webdav-fixtures';
import { launchWebdavWorkerDriver } from './webdav-worker-driver';

function record(value: unknown) {
  if (!isRecord(value)) throw new Error('Lifecycle proof expected an object.');
  return value;
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
    expect(await driver.evaluate('window.webdavLifecycle.state()')).toEqual(nativeBefore);
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
      stopped,
      heldMilliseconds: Date.now() - heldAt,
      workerTargets: targets,
      external,
      noWorkerAttachment: true,
      noWorkerEvaluation: true,
      noHeartbeat: true,
    });
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
