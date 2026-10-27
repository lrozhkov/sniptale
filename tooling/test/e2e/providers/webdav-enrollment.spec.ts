import { expect } from '@playwright/test';
import { test, openProvider, saveProof } from './webdav-fixtures';

test('checked enrollment retains its workspace and auth through browser restart', async ({
  lab,
}, info) => {
  let browser = await openProvider(lab, info, 'workspace-enrollment', false);
  try {
    const ready = await browser.page.evaluate(async (credentials) => {
      const workspace = window.webdavTransferHarness.workspace;
      const plan = await workspace.plan(credentials);
      const allocated = await workspace.allocate(credentials, plan.identity);
      if (allocated.code !== 'success' || !allocated.allocation)
        throw new Error('Enrollment proof requires a positively allocated root.');
      const finished = await workspace.finish(credentials, allocated.allocation.identity);
      if (finished.code !== 'success' || !finished.allocation)
        throw new Error('Enrollment proof requires a checked ready marker.');
      return finished.allocation;
    }, lab.credentials);
    expect(ready.phase).toBe('ready');
    expect(ready.marker).not.toBeNull();
    const enrolled = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.enroll(credentials, identity),
      { credentials: lab.credentials, identity: ready.identity }
    );
    expect(enrolled.code).toBe('success');
    expect(enrolled.connection).toMatchObject({
      phase: 'active',
      workspace: {
        spaceId: ready.spaceId,
        bootstrapId: ready.bootstrapId,
        fingerprint: ready.marker!.fingerprint,
      },
      binding: { rootUrl: ready.rootUrl, accountId: lab.credentials.username },
    });
    const before = await browser.page.evaluate(() =>
      window.webdavTransferHarness.connection.restore()
    );
    expect(before.profile.enabled).toBe(true);
    expect(before.profile.spaceId).toBe(ready.spaceId);
    expect(before.credential).toEqual({
      present: true,
      credentialFieldsOnly: true,
      nonExportableKey: true,
      keyExportRefused: true,
      encryptedEnvelope: true,
      contextBound: true,
    });
    await browser.context.close();
    browser = await openProvider(lab, info, 'workspace-enrollment', false);
    // Restore receives no authentication. The fixture independently grants its loopback origin.
    const restored = await browser.page.evaluate(() =>
      window.webdavTransferHarness.connection.restore()
    );
    expect(restored).toEqual(before);
    const replay = await browser.page.evaluate(
      ({ username, identity, rootUrl }) =>
        window.webdavTransferHarness.workspace.enroll(
          { username, password: 'different-synthetic-replay-secret', rootUrl },
          identity
        ),
      { username: lab.credentials.username, identity: ready.identity, rootUrl: ready.rootUrl }
    );
    expect(replay).toEqual(enrolled);
    const source = await browser.page.evaluate(() =>
      window.webdavTransferHarness.prepareSource(64 * 1024)
    );
    const key = 'Independent/original.bin';
    const written = await browser.page.evaluate(
      (key) => window.webdavTransferHarness.connection.writeThenList(key),
      key
    );
    expect(written).toEqual({
      write: { code: 'success', status: null },
      next: { code: 'success', status: null },
    });
    const external = await lab.externalProof(`Sniptale-${ready.bootstrapId}/${key}`);
    expect(external).toEqual(source);
    await saveProof(info, {
      enrollment: 'complete',
      workspaceIdentity: enrolled.connection?.workspace,
      sourceIdentity: ready.identity,
      connectionIdentity: enrolled.connection?.identity,
      nativeCredentialRetained: restored.credential,
      replayPreservedIdentityAndCredential: true,
      independentOriginal: external,
      counts: lab.proxy.counts,
    });
  } finally {
    await browser.context.close();
  }
});

test('unfinished creation cannot install a profile or credential', async ({ lab }, info) => {
  const browser = await openProvider(lab, info, 'workspace-enrollment-refusal', false);
  try {
    const plan = await browser.page.evaluate(
      (credentials) => window.webdavTransferHarness.workspace.plan(credentials),
      lab.credentials
    );
    const refused = await browser.page.evaluate(
      ({ credentials, identity }) =>
        window.webdavTransferHarness.workspace.enroll(credentials, identity),
      { credentials: lab.credentials, identity: plan.identity }
    );
    expect(refused.code).toBe('refused');
    expect(refused.connection).toBeNull();
    const retained = await browser.page.evaluate(() =>
      window.webdavTransferHarness.workspace.inspect()
    );
    expect(retained).toEqual(plan);
    const connectionExists = await browser.page.evaluate(async () => {
      try {
        await window.webdavTransferHarness.connection.restore();
        return true;
      } catch {
        return false;
      }
    });
    expect(connectionExists).toBe(false);
    expect(lab.proxy.counts.mkcols).toBe(0);
    expect(lab.proxy.counts.puts).toBe(0);
    await saveProof(info, {
      refused,
      planRetained: true,
      connectionExists,
      counts: lab.proxy.counts,
    });
  } finally {
    await browser.context.close();
  }
});
