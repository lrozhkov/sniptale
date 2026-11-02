import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';

test('native queue indexes migrate atomically and project complete scoped history without capture values', async ({
  page,
}) => {
  const host = await startHostServer();
  try {
    await page.goto(host.origin);
    const bundle = await build({
      entryPoints: ['tooling/test/e2e/support/sync-queue-index-probe.ts'],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    });
    const result = await page.evaluate(async (text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try {
        return await (await import(url)).probe();
      } finally {
        URL.revokeObjectURL(url);
      }
    }, bundle.outputFiles[0]!.text);
    expect(result.sourceAdmission).toEqual({ databaseVersion: 50, status: 'ready' });
    expect(result.admission).toEqual({ databaseVersion: 51, status: 'ready' });
    expect(result).toMatchObject({
      aborted: true,
      abortVersion: 50,
      rollbackIndexesAbsent: true,
      abortAdmission: { databaseVersion: 50, status: 'ready' },
      reopenAdmission: { databaseVersion: 51, status: 'ready' },
    });
    expect(result.migrationSourceWrites).toEqual({ aborted: 0, completed: 0 });
    expect(result.afterAbort).toEqual(result.before);
    expect(result.afterUpgrade).toEqual(result.before);
    expect(result.afterReopen).toEqual(result.before);
    expect(result.before.blobs).toHaveLength(2);
    for (const blob of result.before.blobs) expect(blob.sha256).toBe(result.expectedBlobSha256);
    expect(result.indexes).toEqual([
      {
        store: 'sync_capture',
        name: 'syncCaptureScopePhase',
        keyPath: ['kind', 'phase', 'spaceId', 'connectionGeneration', 'profileCreatedAt'],
        unique: false,
      },
      {
        store: 'sync_capture',
        name: 'syncPendingScopeDue',
        keyPath: ['kind', 'spaceId', 'connectionGeneration', 'profileCreatedAt', 'dueAt'],
        unique: false,
      },
      {
        store: 'sync_outbox',
        name: 'syncQueueScopeStatus',
        keyPath: ['kind', 'status', 'spaceId', 'connectionGeneration', 'profileCreatedAt'],
        unique: false,
      },
    ]);
    expect(result.automatic).toEqual({
      phases: { native: 1, prepared: 1, published: 3 },
      pendingRoots: 2,
      minimumDueAt: 30,
      queue: {
        queued: 0,
        running: 0,
        paused: 0,
        cancelled: 0,
        failed: 0,
        interrupted: 0,
        published: 3,
      },
    });
    expect(result.migrationSummary.value).toMatchObject({
      knowledge: 'complete',
      configured: true,
      minimumPendingDueAt: 30,
      counts: {
        pendingRoots: 2,
        nativeOperations: 1,
        preparedOperations: 1,
        publishedOperations: 3,
        queue: { published: 3 },
      },
      enrollmentComplete: true,
      localPublication: 'waiting',
    });
    for (const [projection, published] of [
      [result.small, 10],
      [result.large, 1000],
    ]) {
      expect(projection.value).toMatchObject({
        knowledge: 'complete',
        configured: true,
        counts: {
          pendingRoots: 0,
          nativeOperations: 0,
          preparedOperations: 0,
          publishedOperations: published,
          queue: { published, failed: 0 },
        },
        minimumPendingDueAt: null,
        enrollmentComplete: true,
        localPublication: 'published',
      });
      expect(projection.captureValueReads).toBe(0);
      expect(projection.credentialReads).toBe(0);
      expect(projection.requests).toBeGreaterThan(0);
    }
    expect(result.large.requests).toBe(result.small.requests);
    expect(result.hiddenFailure.value).toMatchObject({
      knowledge: 'complete',
      configured: true,
      counts: {
        publishedOperations: 1000,
        preparedOperations: 1,
        queue: { published: 1000, failed: 1 },
      },
      localPublication: 'waiting',
    });
    expect(result.nativeBeforeReconcile.value).toMatchObject({
      knowledge: 'complete',
      configured: true,
      counts: { nativeOperations: 1, queue: { published: 0 } },
      localPublication: 'waiting',
    });
    expect(result.enrollmentPending.value).toMatchObject({
      knowledge: 'complete',
      configured: true,
      enrollmentComplete: false,
      localPublication: 'discovering',
    });
    expect(result.coherentReplacement.before.value).toMatchObject({
      knowledge: 'complete',
      configured: true,
      scope: { spaceId: 'native-index-space', connectionGeneration: 2, profileCreatedAt: 1 },
      authorization: { incarnation: '11111111-1111-4111-8111-111111111111', revision: 1 },
      counts: { publishedOperations: 7, queue: { published: 7 } },
      localPublication: 'published',
    });
    expect(result.coherentReplacement.after.value).toMatchObject({
      knowledge: 'complete',
      configured: true,
      scope: result.coherentReplacement.replacementScope,
      authorization: result.coherentReplacement.replacementAuthorization,
      counts: { publishedOperations: 0, queue: { published: 0 } },
      localPublication: 'published',
    });
    expect(result.malformedDue).toHaveLength(6);
    for (const entry of result.malformedDue) {
      expect(entry.wholeScopeCount).toBe(1);
      expect(entry.summary.value).toEqual({ knowledge: 'unknown', reason: 'index-coverage' });
      expect(entry.summary.captureValueReads).toBe(0);
      expect(entry.summary.credentialReads).toBe(0);
    }
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
