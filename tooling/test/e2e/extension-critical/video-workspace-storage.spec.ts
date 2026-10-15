import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';

test('native workspace appends and moves cursor incrementally and aborts a late draft failure atomically', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.goto(host.origin);
    const bundle = await build({
      entryPoints: ['tooling/test/e2e/support/video-workspace-storage-probe.ts'],
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
    await writeFile(
      info.outputPath('native-workspace-storage.json'),
      JSON.stringify(result, null, 2)
    );
    expect(result.admission).toEqual({
      aborted: true,
      rollback: true,
      retainedLegacy: true,
      emptyHistory: 0,
    });
    expect(result.corruption).toEqual({
      gap: 'invalid',
      gapPreserved: true,
      orphan: 'invalid',
      orphanPreserved: true,
    });
    expect(result.appendWrites.map((row: { store: string }) => row.store).sort()).toEqual([
      'video_workspace_history',
      'video_workspaces',
    ]);
    expect(
      result.appendWrites.find((row: { store: string }) => row.store === 'video_workspaces').bytes
    ).toBeLessThan(1500);
    expect(
      result.appendWrites.find((row: { store: string }) => row.store === 'video_workspace_history')
        .bytes
    ).toBeLessThan(400);
    expect(result.cursorWrites).toEqual([{ store: 'video_workspaces', bytes: expect.any(Number) }]);
    expect(result.branch.writes.map((row: { store: string }) => row.store).sort()).toEqual([
      'video_workspace_history',
      'video_workspaces',
    ]);
    expect(result.branch.deleted).toEqual([
      { store: 'video_workspace_history', key: ['recording:beta-v1-recording', 41] },
    ]);
    expect(result).toMatchObject({
      retainedPrefix: true,
      unchangedRows: true,
      failure: 'QuotaExceededError',
      successfulRequestsBeforeFailure: 2,
      rollback: true,
      recoveredDraft: 'text-41',
    });
    expect(result.recoveredRevision).toBe(result.expectedRevision);
    expect(result.branch.historyLength).toBe(41);
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
