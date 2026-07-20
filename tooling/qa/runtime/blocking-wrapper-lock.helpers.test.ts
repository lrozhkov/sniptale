import fs from 'node:fs';

import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd } from '../core/test-helpers';

function readLockRecord(root: string) {
  const lockPath = `${root}/.tmp/qa/locks/blocking-wrapper.lock.json`;
  return { lockPath, record: JSON.parse(fs.readFileSync(lockPath, 'utf8')) };
}

function expectTokenNotPersisted(record: Record<string, unknown>) {
  expect(JSON.stringify(record)).not.toContain('handoff-token');
}

function expectAuthorizedHandoff(root: string) {
  const authorized = readLockRecord(root).record;
  expectTokenNotPersisted(authorized);
  expect(authorized.handoff.tokenDigest).toMatch(/^[a-f0-9]{64}$/u);
}

function expectClaimedHandoff(root: string) {
  const { lockPath, record } = readLockRecord(root);
  expectTokenNotPersisted(record);
  expect(record).toMatchObject({
    parentRunId: 'closeout-run',
    rootRunId: 'closeout-run',
    runId: 'build-run',
    wrapperId: 'qa:build',
  });
  expect(fs.statSync(lockPath).mode & 0o777).toBe(0o600);
}

function expectInvalidClaim(
  module: typeof import('./blocking-wrapper-lock.helpers.mjs'),
  { token, runId }: { token: string; runId: string }
) {
  expect(() =>
    module.claimBlockingWrapperLockHandoff({
      consumerId: 'qa:build',
      ownerId: 'qa:closeout',
      ownerPid: process.pid,
      token,
      runId,
      rootRunId: 'closeout-run',
      parentRunId: 'closeout-run',
    })
  ).toThrow(/Invalid blocking-wrapper lock handoff/u);
}

it('rejects a second active blocking wrapper lock', async () => {
  const root = createTempRoot('qa-blocking-lock-');

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./blocking-wrapper-lock.helpers.mjs')>(
      './blocking-wrapper-lock.helpers.mjs',
      import.meta.url
    );

    const lock = module.acquireBlockingWrapperLock('qa:checkpoint');
    expect(() => module.acquireBlockingWrapperLock('qa:build')).toThrow(
      /Another blocking QA wrapper is already running/u
    );
    lock.release();
  });
});

it('mentions release wrappers in the shared blocking-wrapper lock guidance', async () => {
  const root = createTempRoot('qa-blocking-lock-release-');

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./blocking-wrapper-lock.helpers.mjs')>(
      './blocking-wrapper-lock.helpers.mjs',
      import.meta.url
    );

    const lock = module.acquireBlockingWrapperLock('qa:release');
    expect(() => module.acquireBlockingWrapperLock('qa:build')).toThrow(
      /qa:checkpoint, qa:closeout, qa:build, qa:release, qa:release-harness, or qa:audit/u
    );
    lock.release();
  });
});

async function verifyChildHandoff(root: string) {
  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./blocking-wrapper-lock.helpers.mjs')>(
      './blocking-wrapper-lock.helpers.mjs',
      import.meta.url
    );

    const lock = module.acquireBlockingWrapperLock('qa:closeout', {
      runId: 'closeout-run',
      rootRunId: 'closeout-run',
    });
    module.authorizeBlockingWrapperLockHandoff('qa:closeout', {
      consumerId: 'qa:build',
      parentRunId: 'closeout-run',
      rootRunId: 'closeout-run',
      runId: 'build-run',
      token: 'handoff-token',
    });
    expectAuthorizedHandoff(root);

    expectInvalidClaim(module, { token: 'handoff-token', runId: 'forged-run' });

    const claimedLock = module.claimBlockingWrapperLockHandoff({
      consumerId: 'qa:build',
      ownerId: 'qa:closeout',
      ownerPid: process.pid,
      token: 'handoff-token',
      runId: 'build-run',
      rootRunId: 'closeout-run',
      parentRunId: 'closeout-run',
    });
    expectInvalidClaim(module, { token: 'forged-token', runId: 'build-run' });

    expect(() => module.acquireBlockingWrapperLock('qa:checkpoint')).toThrow(
      /Another blocking QA wrapper is already running: qa:build/u
    );
    expectClaimedHandoff(root);
    claimedLock.release();
    lock.release();
  });
}

it('lets a child wrapper claim a handoff only with the live lock token', async () => {
  const root = createTempRoot('qa-blocking-lock-handoff-');
  await verifyChildHandoff(root);
});

it('rejects authorization and claims whose lineage differs from the owning run', async () => {
  const root = createTempRoot('qa-blocking-lock-lineage-');
  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./blocking-wrapper-lock.helpers.mjs')>(
      './blocking-wrapper-lock.helpers.mjs',
      import.meta.url
    );
    const lock = module.acquireBlockingWrapperLock('qa:closeout', {
      runId: 'closeout-run',
      rootRunId: 'closeout-run',
    });
    expect(() =>
      module.authorizeBlockingWrapperLockHandoff('qa:closeout', {
        consumerId: 'qa:build',
        parentRunId: 'forged-parent',
        rootRunId: 'closeout-run',
        runId: 'build-run',
        token: 'handoff-token',
      })
    ).toThrow(/mismatched run lineage/u);
    lock.release();
  });
});
