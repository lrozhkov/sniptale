import { expect } from '@playwright/test';
import { test, openProvider, saveProof } from './webdav-fixtures';

test('durable queue preserves paused edits, fences two pages and survives browser restart', async ({
  lab,
}, info) => {
  test.setTimeout(240_000);
  let browser = await openProvider(lab, info, 'durable-queue');
  try {
    const seed = await browser.page.evaluate(async () => {
      const source = await window.webdavTransferHarness.portable.source();
      const outgoing = window.webdavTransferHarness.portable.outgoing;
      const prepared = await outgoing.prepare(source.projectId);
      const first = await outgoing.queueEnqueue(source.projectId);
      const before = await outgoing.queueState();
      await outgoing.queueControl(before.connection.revision, 'pause');
      await outgoing.reviseMetadata(source.projectId);
      const second = await outgoing.queueEnqueue(source.projectId);
      const paused = await outgoing.queueState();
      await outgoing.queueControl(paused.connection.revision, 'resume');
      return { source, prepared, first, second, paused };
    });
    expect(seed.first.operationId).not.toBe(seed.second.operationId);
    expect(seed.paused.connection.paused).toBe(true);
    expect(seed.paused.operations).toHaveLength(2);
    const other = await browser.context.newPage();
    await other.goto(
      `chrome-extension://${browser.extensionId}/tooling/test/harness/webdav-transfer.html`
    );
    await other.waitForFunction(() => Boolean(window.webdavTransferHarness));
    await other.evaluate(
      (credentials) => window.webdavTransferHarness.connect(credentials),
      lab.credentials
    );
    lab.proxy.armFault({ method: 'PUT', key: seed.prepared.objects[0]!.key, kind: 'hold' });
    const pending = browser.page.evaluate(
      ({ operationId, revision }) =>
        window.webdavTransferHarness.portable.outgoing.queueRun(operationId, revision),
      seed.first
    );
    await lab.proxy.waitForFault();
    expect(
      await other.evaluate(
        ({ operationId, revision }) =>
          window.webdavTransferHarness.portable.outgoing.queueRun(operationId, revision),
        seed.first
      )
    ).toEqual({ status: 'busy' });
    const running = await other.evaluate(() =>
      window.webdavTransferHarness.portable.outgoing.queueState()
    );
    const active = running.operations.find((item) => item.operationId === seed.first.operationId)!;
    expect(active.status).toBe('running');
    expect(
      await other.evaluate(
        ({ operationId, revision }) =>
          window.webdavTransferHarness.portable.outgoing.queueRecover(operationId, revision),
        active
      )
    ).toEqual({ status: 'busy' });
    const paused = await other.evaluate(
      ({ operationId, revision }) =>
        window.webdavTransferHarness.portable.outgoing.queueOperationControl(
          operationId,
          revision,
          'pause'
        ),
      active
    );
    await expect(
      other.evaluate(
        ({ operationId, revision }) =>
          window.webdavTransferHarness.portable.outgoing.queueOperationControl(
            operationId,
            revision,
            'cancel'
          ),
        seed.first
      )
    ).rejects.toThrow('Stale');
    lab.proxy.releaseFault();
    expect(await pending).toMatchObject({
      status: 'finished',
      operation: { status: 'paused', outcome: 'unknown' },
    });
    expect(lab.proxy.counts.putBodies.some((item) => item.key === seed.prepared.attemptKey)).toBe(
      false
    );
    await browser.context.close();
    browser = await openProvider(lab, info, 'durable-queue');
    const resumed = await browser.page.evaluate(
      ({ operationId, revision }) =>
        window.webdavTransferHarness.portable.outgoing.queueOperationControl(
          operationId,
          revision,
          'resume'
        ),
      paused
    );
    const completed = await browser.page.evaluate(
      ({ operationId, revision }) =>
        window.webdavTransferHarness.portable.outgoing.queueRun(operationId, revision),
      resumed
    );
    expect(completed).toMatchObject({
      status: 'finished',
      operation: { status: 'published', outcome: 'verified', failureCode: null },
    });
    if (completed.status !== 'finished' || !completed.operation.attemptId)
      throw new Error('Queue completion is missing.');
    const finished = completed.operation;
    expect(finished.attemptId).not.toBe(seed.prepared.attemptKey.split('/').at(-1)!.slice(0, 36));
    const attempt = await browser.page.evaluate(
      ({ spaceId, operationId, attemptId }) =>
        window.webdavTransferHarness.portable.outgoing.attempt(spaceId, operationId, attemptId!),
      finished
    );
    expect(attempt).not.toBeNull();
    const external = [];
    for (const binding of attempt!.objects) {
      const object = seed.prepared.objects.find((item) => item.objectId === binding.objectId)!;
      const proof = await lab.externalProof(binding.remoteKey);
      expect(proof).toEqual({ size: object.size, sha256: object.sha256 });
      external.push(proof);
    }
    const retained = await browser.page.evaluate(
      (id) => window.webdavTransferHarness.portable.outgoing.prepare(id),
      seed.source.projectId
    );
    expect(retained.operationId).toBe(seed.second.operationId);
    expect(retained.objects.map(({ size, sha256 }) => ({ size, sha256 }))).toEqual(
      seed.prepared.objects.map(({ size, sha256 }) => ({ size, sha256 }))
    );
    await browser.context.close();
    browser = await openProvider(lab, info, 'durable-queue');
    const before = {
      gets: lab.proxy.counts.getKeys.length,
      puts: lab.proxy.counts.putBodies.length,
    };
    expect(
      await browser.page.evaluate(
        ({ operationId, revision }) =>
          window.webdavTransferHarness.portable.outgoing.queueRun(operationId, revision),
        finished
      )
    ).toMatchObject({
      status: 'finished',
      operation: { status: 'published', outcome: 'verified' },
    });
    expect(lab.proxy.counts.getKeys).toHaveLength(before.gets);
    expect(lab.proxy.counts.putBodies).toHaveLength(before.puts);
    const state = await browser.page.evaluate(() =>
      window.webdavTransferHarness.portable.outgoing.queueState()
    );
    expect(
      state.operations.find((item) => item.operationId === seed.second.operationId)?.status
    ).toBe('queued');
    await saveProof(info, {
      pausedEdits: state.operations.length,
      completed: finished,
      external,
      retainedNextOperation: seed.second.operationId,
      restartNetwork: { gets: 0, puts: 0 },
    });
  } finally {
    lab.proxy.releaseFault();
    await browser.context.close();
  }
});
