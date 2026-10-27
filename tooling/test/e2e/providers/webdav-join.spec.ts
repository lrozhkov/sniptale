import { expect, type TestInfo } from '@playwright/test';
import { test, openProvider, saveProof } from './webdav-fixtures';

type Lab = Parameters<typeof openProvider>[0];
async function createSource(lab: Lab, info: TestInfo) {
  const creator = await openProvider(lab, info, 'join-creator', false);
  try {
    const ready = await creator.page.evaluate(async (credentials) => {
      const workspace = window.webdavTransferHarness.workspace;
      const plan = await workspace.plan(credentials);
      const allocated = await workspace.allocate(credentials, plan.identity);
      if (allocated.code !== 'success' || !allocated.allocation)
        throw new Error('JOIN proof requires positive allocation.');
      const finished = await workspace.finish(credentials, allocated.allocation.identity);
      if (finished.code !== 'success' || !finished.allocation)
        throw new Error('JOIN proof requires checked creation.');
      return finished.allocation;
    }, lab.credentials);
    return { creator, ready, credentials: { ...lab.credentials, rootUrl: ready.rootUrl } };
  } catch (error) {
    await creator.context.close();
    throw error;
  }
}
async function hasConnection(browser: Awaited<ReturnType<typeof openProvider>>) {
  return browser.page.evaluate(async () => {
    try {
      await window.webdavTransferHarness.connection.restore();
      return true;
    } catch {
      return false;
    }
  });
}

test('a second browser joins populated metadata and enrolls without downloading originals', async ({
  lab,
}, info) => {
  const source = await createSource(lab, info);
  let browser = await openProvider(lab, info, 'joined-browser', false);
  try {
    const seeded = await source.creator.page.evaluate(
      async ({ credentials, spaceId }) => {
        const harness = window.webdavTransferHarness;
        await harness.connect(credentials);
        const original = await harness.prepareSource(96 * 1024);
        const uploaded = await harness.uploadSource('Files/external-original.bin');
        if (uploaded.code !== 'success') throw new Error('JOIN original fixture upload failed.');
        const record = await harness.workspace.seedJoinRecord(credentials, spaceId);
        return { original, record };
      },
      { credentials: source.credentials, spaceId: source.ready.spaceId }
    );
    const before = {
      puts: lab.proxy.counts.puts,
      mkcols: lab.proxy.counts.mkcols,
      gets: lab.proxy.counts.getKeys.length,
    };
    const checked = await browser.page.evaluate(
      async ({ credentials }) => {
        const workspace = window.webdavTransferHarness.workspace;
        const intent = await workspace.planJoin(credentials);
        return workspace.checkJoin(credentials, intent.identity);
      },
      { credentials: source.credentials }
    );
    expect(checked.code).toBe('success');
    expect(checked.intent?.phase).toBe('ready');
    expect(checked.operationIds).toEqual([seeded.record.operationId]);
    expect(checked.identity?.spaceId).toBe(source.ready.spaceId);
    expect(lab.proxy.counts.puts).toBe(before.puts);
    expect(lab.proxy.counts.mkcols).toBe(before.mkcols);
    const readKeys = lab.proxy.counts.getKeys.slice(before.gets);
    expect(readKeys.every((key) => !key.endsWith('external-original.bin'))).toBe(true);
    expect(readKeys).toContain(`Sniptale-${source.ready.bootstrapId}/${seeded.record.recordKey}`);
    expect(await hasConnection(browser)).toBe(false);
    const enrolled = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.enrollJoin(credentials, identity),
      { credentials: source.credentials, identity: checked.intent?.identity }
    );
    expect(enrolled.code).toBe('success');
    expect(enrolled.connection?.workspace).toEqual(checked.identity);
    const beforeRestart = await browser.page.evaluate(() =>
      window.webdavTransferHarness.connection.restore()
    );
    await browser.context.close();
    browser = await openProvider(lab, info, 'joined-browser', false);
    expect(
      await browser.page.evaluate(() => window.webdavTransferHarness.connection.restore())
    ).toEqual(beforeRestart);
    const replay = await browser.page.evaluate(
      ({ username, rootUrl, identity }) =>
        window.webdavTransferHarness.workspace.enrollJoin(
          { username, rootUrl, password: 'different-synthetic-replay-secret' },
          identity
        ),
      {
        username: source.credentials.username,
        rootUrl: source.ready.rootUrl,
        identity: checked.intent?.identity,
      }
    );
    expect(replay).toEqual(enrolled);
    const fresh = await browser.page.evaluate(() =>
      window.webdavTransferHarness.prepareSource(32 * 1024)
    );
    expect(
      await browser.page.evaluate(() =>
        window.webdavTransferHarness.connection.writeThenList('Files/joined-write.bin')
      )
    ).toMatchObject({ write: { code: 'success' }, next: { code: 'success' } });
    const original = await lab.externalProof(
      `Sniptale-${source.ready.bootstrapId}/Files/external-original.bin`
    );
    const written = await lab.externalProof(
      `Sniptale-${source.ready.bootstrapId}/Files/joined-write.bin`
    );
    expect(original).toEqual(seeded.original);
    expect(written).toEqual(fresh);
    await saveProof(info, {
      joinedWorkspace: checked.identity,
      operationIds: checked.operationIds,
      readKeys,
      original,
      written,
      noJoinWrites: true,
      receiptReplay: true,
      restartRetainedCredential: true,
    });
  } finally {
    await browser.context.close();
    await source.creator.context.close();
  }
});

for (const fault of ['status', 'lost-response'] as const) {
  test(`JOIN ${fault} failure retains checking for an explicit retry`, async ({ lab }, info) => {
    const source = await createSource(lab, info);
    const browser = await openProvider(lab, info, 'join-retry', false);
    try {
      const intent = await browser.page.evaluate(
        (credentials) => window.webdavTransferHarness.workspace.planJoin(credentials),
        source.credentials
      );
      const before = { puts: lab.proxy.counts.puts, mkcols: lab.proxy.counts.mkcols };
      lab.proxy.armFault({
        method: 'GET',
        key: `Sniptale-${source.ready.bootstrapId}/.sniptale/workspace.json`,
        kind: fault,
        ...(fault === 'status' ? { status: 423 } : { repeat: true }),
      });
      const failed = await browser.page.evaluate(
        ({ credentials, identity }) =>
          window.webdavTransferHarness.workspace.checkJoin(credentials, identity),
        { credentials: source.credentials, identity: intent.identity }
      );
      expect(failed.code).not.toBe('success');
      expect(failed.intent?.phase).toBe('checking');
      expect(await hasConnection(browser)).toBe(false);
      lab.proxy.releaseFault();
      const retried = await browser.page.evaluate(
        ({ credentials, identity }) =>
          window.webdavTransferHarness.workspace.checkJoin(credentials, identity),
        { credentials: source.credentials, identity: failed.intent?.identity }
      );
      expect(retried.code).toBe('success');
      expect(retried.intent?.phase).toBe('ready');
      expect(lab.proxy.counts.puts).toBe(before.puts);
      expect(lab.proxy.counts.mkcols).toBe(before.mkcols);
      await saveProof(info, { fault, failed, retried, noJoinWrites: true });
    } finally {
      await browser.context.close();
      await source.creator.context.close();
    }
  });
}

test('active JOIN close revokes readiness and drains a held marker body', async ({ lab }, info) => {
  const source = await createSource(lab, info);
  const browser = await openProvider(lab, info, 'join-close', false);
  try {
    const intent = await browser.page.evaluate(
      (credentials) => window.webdavTransferHarness.workspace.planJoin(credentials),
      source.credentials
    );
    const before = { puts: lab.proxy.counts.puts, mkcols: lab.proxy.counts.mkcols };
    lab.proxy.armFault({
      method: 'GET',
      key: `Sniptale-${source.ready.bootstrapId}/.sniptale/workspace.json`,
      kind: 'hold-response-body',
    });
    const pending = browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.checkJoin(credentials, identity),
      { credentials: source.credentials, identity: intent.identity }
    );
    await lab.proxy.waitForFault();
    expect(
      await browser.page.evaluate(() => window.webdavTransferHarness.workspace.stopJoin())
    ).toEqual({ code: 'contained' });
    lab.proxy.releaseFault();
    const stopped = await pending;
    expect(stopped.code).toBe('cancelled');
    expect(
      await browser.page.evaluate(() => window.webdavTransferHarness.workspace.inspectJoin())
    ).toBeNull();
    const refused = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.enrollJoin(credentials, identity),
      { credentials: source.credentials, identity: intent.identity }
    );
    expect(refused.code).toBe('refused');
    expect(await hasConnection(browser)).toBe(false);
    expect(lab.proxy.counts.puts).toBe(before.puts);
    expect(lab.proxy.counts.mkcols).toBe(before.mkcols);
    await saveProof(info, { stopped, refused, noEnrollment: true, noJoinWrites: true });
  } finally {
    lab.proxy.releaseFault();
    await browser.context.close();
    await source.creator.context.close();
  }
});

test('permission removal during JOIN prevents checked readiness', async ({ lab }, info) => {
  const source = await createSource(lab, info);
  const browser = await openProvider(
    lab,
    info,
    'join-permission',
    false,
    process.env['SNIPTALE_WEBDAV_PERMISSION_BUILD_DIR'] ?? '.tmp/e2e-builds/security'
  );
  try {
    const intent = await browser.page.evaluate(
      (credentials) => window.webdavTransferHarness.workspace.planJoin(credentials),
      source.credentials
    );
    lab.proxy.armFault({
      method: 'GET',
      key: `Sniptale-${source.ready.bootstrapId}/.sniptale/workspace.json`,
      kind: 'hold-response-body',
    });
    const pending = browser.page
      .evaluate(
        ({ credentials, identity }) =>
          window.webdavTransferHarness.workspace.checkJoin(credentials, identity),
        { credentials: source.credentials, identity: intent.identity }
      )
      .then(
        (value) => ({ kind: 'result' as const, value }),
        () => ({ kind: 'evaluation-lost' as const })
      );
    await lab.proxy.waitForFault();
    const removed = await browser.page
      .evaluate(
        (origin) => chrome.permissions.remove({ origins: [`${origin}/*`] }),
        new URL(source.ready.rootUrl).origin
      )
      .then(
        (value) => ({ kind: 'result' as const, value }),
        () => ({ kind: 'remove-failed' as const })
      );
    lab.proxy.releaseFault();
    const outcome = await pending;
    await saveProof(info, {
      removed,
      outcome,
      pageClosed: browser.page.isClosed(),
      browserConnected: browser.browser.isConnected(),
    });
    expect(removed).toEqual({ kind: 'result', value: true });
    if (outcome.kind !== 'result')
      throw new Error('JOIN evaluation was lost after permission removal.');
    const refused = outcome.value;
    expect(refused.code).toBe('access-denied');
    expect(refused.intent?.phase).toBe('checking');
    expect(await hasConnection(browser)).toBe(false);
    await saveProof(info, { refused, noEnrollment: true });
  } finally {
    lab.proxy.releaseFault();
    await browser.context.close();
    await source.creator.context.close();
  }
});

test('a missing marker leaves a retryable JOIN and no connection', async ({ lab }, info) => {
  const browser = await openProvider(lab, info, 'join-missing', false);
  try {
    const intent = await browser.page.evaluate(
      (credentials) => window.webdavTransferHarness.workspace.planJoin(credentials),
      lab.credentials
    );
    const result = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.checkJoin(credentials, identity),
      { credentials: lab.credentials, identity: intent.identity }
    );
    expect(result.code).toBe('marker-missing');
    expect(result.intent?.phase).toBe('checking');
    expect(await hasConnection(browser)).toBe(false);
    expect(lab.proxy.counts.puts).toBe(0);
    expect(lab.proxy.counts.mkcols).toBe(0);
    await saveProof(info, { result, noEnrollment: true, noJoinWrites: true });
  } finally {
    await browser.context.close();
  }
});
