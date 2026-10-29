import { expect } from '@playwright/test';
import { test, openProvider, saveProof } from './webdav-fixtures';

test('native encrypted auth survives restart and fences rotation and held-PUT pause across pages', async ({
  lab,
}, info) => {
  test.setTimeout(240_000);
  let browser = await openProvider(lab, info, 'native-connection', false);
  try {
    const seed = await browser.page.evaluate(async (credentials) => {
      const harness = window.webdavTransferHarness;
      const source = await harness.portable.source();
      const prepared = await harness.portable.outgoing.prepare(source.projectId);
      const file = await harness.prepareSource(2 * 1024 * 1024);
      const configured = await harness.connection.configure(credentials);
      return { source, prepared, file, configured };
    }, lab.credentials);
    expect(seed.configured.phase).toBe('active');
    expect(seed.configured.profile.enabled).toBe(true);
    expect(seed.configured.credential).toEqual({
      present: true,
      credentialFieldsOnly: true,
      nonExportableKey: true,
      keyExportRefused: true,
      encryptedEnvelope: true,
      contextBound: true,
    });
    await browser.context.close();
    browser = await openProvider(lab, info, 'native-connection', false);
    // Neither openProvider(false) nor restore receives credentials after the full browser restart.
    const restored = await browser.page.evaluate(() =>
      window.webdavTransferHarness.connection.restore()
    );
    expect(restored).toEqual(seed.configured);
    // The pilot has no scheduler. Publish the retained Library dependency explicitly.
    const dependency = await browser.page.evaluate(async (mediaId) => {
      const outgoing = window.webdavTransferHarness.portable.outgoing;
      const prepared = await outgoing.prepare(mediaId);
      const operation = await outgoing.queueEnqueue(mediaId);
      return {
        prepared,
        result: await outgoing.queueRun(operation.operationId, operation.revision),
      };
    }, seed.source.mediaId);
    expect(dependency.result).toMatchObject({
      status: 'finished',
      operation: { status: 'published', outcome: 'verified' },
    });
    const queued = await browser.page.evaluate(async (projectId) => {
      const outgoing = window.webdavTransferHarness.portable.outgoing;
      const operation = await outgoing.queueEnqueue(projectId);
      return outgoing.queueRun(operation.operationId, operation.revision);
    }, seed.source.projectId);
    expect(queued).toMatchObject({
      status: 'finished',
      operation: { status: 'published', outcome: 'verified' },
    });

    expect(
      await browser.page.evaluate(() =>
        window.webdavTransferHarness.connection.writeThenList('Restart/original.bin')
      )
    ).toEqual({
      write: { code: 'success', status: null },
      next: { code: 'success', status: null },
    });
    const external = await lab.externalProof('Restart/original.bin');
    expect(external).toEqual(seed.file);
    const downloaded = await browser.page.evaluate(
      (size) => window.webdavTransferHarness.readProof('Restart/original.bin', size),
      seed.file.size
    );
    expect(downloaded).toMatchObject({
      bytes: seed.file.size,
      size: seed.file.size,
      sha256: seed.file.sha256,
    });

    const queueExternal = [];
    for (const { result, prepared } of [
      { result: dependency.result, prepared: dependency.prepared },
      { result: queued, prepared: seed.prepared },
    ]) {
      if (result.status !== 'finished' || !result.operation.attemptId)
        throw new Error('Configured native queue did not publish a verified attempt.');
      const attempt = await browser.page.evaluate(
        ({ spaceId, operationId, attemptId }) =>
          window.webdavTransferHarness.portable.outgoing.attempt(spaceId, operationId, attemptId!),
        result.operation
      );
      expect(attempt).not.toBeNull();
      for (const binding of attempt!.objects) {
        const original = prepared.objects.find((item) => item.objectId === binding.objectId);
        if (!original)
          throw new Error('Configured queue object is outside the prepared inventory.');
        const proof = await lab.externalProof(binding.remoteKey);
        expect(proof).toEqual({ size: original.size, sha256: original.sha256 });
        queueExternal.push(proof);
      }
    }
    expect(queueExternal).toContainEqual(seed.source.exported);
    for (const editing of seed.source.editing) expect(queueExternal).toContainEqual(editing);

    const other = await browser.context.newPage();
    await other.goto(
      `chrome-extension://${browser.extensionId}/tooling/test/harness/webdav-transfer.html`
    );
    await other.waitForFunction(() => Boolean(window.webdavTransferHarness?.connection));
    expect(await other.evaluate(() => window.webdavTransferHarness.connection.restore())).toEqual(
      restored
    );
    const rotated = await browser.page.evaluate(
      (credentials) =>
        window.webdavTransferHarness.connection.rotate({
          username: credentials.username,
          password: credentials.password,
        }),
      lab.credentials
    );
    expect(rotated.phase).toBe('active');
    expect(rotated.identity.incarnation).toBe(restored.identity.incarnation);
    expect(rotated.identity.revision).toBeGreaterThan(restored.identity.revision);
    expect(rotated.profile).toEqual(restored.profile);
    expect(rotated.credential).toEqual(restored.credential);
    const beforeStale = {
      gets: lab.proxy.counts.gets,
      puts: lab.proxy.counts.puts,
      propfinds: lab.proxy.counts.propfinds,
    };
    const stale = await other.evaluate(() => window.webdavTransferHarness.connection.probe());
    expect(stale.code).not.toBe('success');
    expect({
      gets: lab.proxy.counts.gets,
      puts: lab.proxy.counts.puts,
      propfinds: lab.proxy.counts.propfinds,
    }).toEqual(beforeStale);
    expect(await other.evaluate(() => window.webdavTransferHarness.connection.restore())).toEqual(
      rotated
    );

    lab.proxy.armFault({ method: 'PUT', key: 'Held/paused.bin', kind: 'hold' });
    const pending = other.evaluate(() =>
      window.webdavTransferHarness.connection.writeThenList('Held/paused.bin')
    );
    await lab.proxy.waitForFault();
    expect(
      await browser.page.evaluate(() => window.webdavTransferHarness.connection.probe())
    ).toEqual({ code: 'success', status: null });
    const beforePause = {
      gets: lab.proxy.counts.gets,
      puts: lab.proxy.counts.puts,
      propfinds: lab.proxy.counts.propfinds,
    };
    const paused = await other.evaluate(() => window.webdavTransferHarness.connection.pause());
    expect(paused.phase).toBe('paused');
    expect(paused.identity.incarnation).toBe(rotated.identity.incarnation);
    expect(paused.identity.revision).toBeGreaterThan(rotated.identity.revision);
    expect(paused.profile).toEqual(seed.configured.profile);
    expect(paused.credential).toEqual(seed.configured.credential);
    const stopped = await pending;
    expect(stopped.write.code).not.toBe('success');
    expect(stopped.next.code).not.toBe('success');
    // The original page's factory is still open. Durable pause independently refuses its next request.
    expect(
      (await browser.page.evaluate(() => window.webdavTransferHarness.connection.probe())).code
    ).not.toBe('success');
    expect({
      gets: lab.proxy.counts.gets,
      puts: lab.proxy.counts.puts,
      propfinds: lab.proxy.counts.propfinds,
    }).toEqual(beforePause);
    lab.proxy.releaseFault();
    const retained = await browser.page.evaluate(
      (id) => window.webdavTransferHarness.portable.outgoing.prepare(id),
      seed.source.projectId
    );
    expect(retained.operationId).toBe(seed.prepared.operationId);
    expect(retained.recordSha256).toBe(seed.prepared.recordSha256);
    expect(retained.objects).toEqual(seed.prepared.objects);
    const retainedRemote = await lab.externalProof('Restart/original.bin');
    expect(retainedRemote).toEqual(seed.file);
    await browser.page.evaluate(() => window.webdavTransferHarness.connection.close());
    await saveProof(info, {
      configured: seed.configured,
      queued,
      dependency,
      queueExternal,
      restored,
      rotated,
      paused,
      external,
      downloaded,
      staleRefused: stale.code !== 'success',
      pauseStopped: stopped,
      retainedNativeOperation: retained.operationId,
      retainedNativeObjects: retained.objects.map(({ size, sha256 }) => ({ size, sha256 })),
      retainedRemote,
    });
  } finally {
    lab.proxy.releaseFault();
    await browser.context.close();
  }
});

test('ordinary full backup and Settings transfer exclude native connection authority', async ({
  lab,
}, info) => {
  const browser = await openProvider(lab, info, 'connection-backup', false);
  try {
    const proof = await browser.page.evaluate(async (credentials) => {
      const harness = window.webdavTransferHarness;
      const source = await harness.portable.source();
      // The source fixture intentionally creates a PNG as a synthetic video-project export.
      // The full backup accepts video exports only. Remove that synthetic row through its owner.
      await harness.connection.removeSyntheticExport(source.exportId);
      await harness.connection.configure(credentials);
      return harness.connection.transferExclusion();
    }, lab.credentials);
    expect(proof.backupRoots).toBeGreaterThan(0);
    expect(proof.backupEntries).toBeGreaterThan(proof.backupRoots);
    expect(proof.backupProfiles).toContain('video-project');
    expect(proof.backupExcluded).toBe(true);
    expect(proof.settingsExcluded).toBe(true);
    expect(proof.nativeConnectionUnchanged).toBe(true);
    await saveProof(info, proof);
  } finally {
    await browser.context.close();
  }
});
