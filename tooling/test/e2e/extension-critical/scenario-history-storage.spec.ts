import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';

test('native scenario history is incremental, atomic, bounded and preserves unavailable evidence', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.goto(host.origin);
    const bundle = await build({
      entryPoints: ['tooling/test/e2e/support/scenario-history-storage-probe.ts'],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      metafile: true,
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    });
    if (!bundle.metafile) throw new Error('Missing native scenario source provenance.');
    await writeFile(
      info.outputPath('native-scenario-history-source-proof.json'),
      JSON.stringify(
        {
          defines: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
          bundleSha256: createHash('sha256').update(bundle.outputFiles[0]!.contents).digest('hex'),
          inputs: await Promise.all(
            Object.keys(bundle.metafile.inputs)
              .filter((path) => path !== '<define:import.meta.env>')
              .map(async (path) => ({
                path,
                sha256: createHash('sha256')
                  .update(await readFile(path))
                  .digest('hex'),
              }))
          ),
        },
        null,
        2
      )
    );
    const result = await page.evaluate(async (text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try {
        return await (await import(url)).probe();
      } finally {
        URL.revokeObjectURL(url);
      }
    }, bundle.outputFiles[0]!.text);
    await writeFile(
      info.outputPath('native-scenario-history.json'),
      JSON.stringify(result, null, 2)
    );
    expect(result.admission).toEqual({
      aborted: true,
      rollback: true,
      retainedLegacy: true,
      emptyHistory: 0,
    });
    expect(result.legacyReadonly).toBe(true);
    expect(result.appendWrites.map((row: { store: string }) => row.store).sort()).toEqual([
      'scenario_project_history',
      'scenario_projects',
    ]);
    expect(result).toMatchObject({
      unchangedRows: true,
      logicalHistoryLength: 5,
      noop: true,
      failure: 'QuotaExceededError',
      rollback: true,
      bytesAfterRollback: true,
      retainedCount: 50,
      physicalCount: 50,
      cleared: true,
      orphanRetained: true,
    });
    expect(result.successfulRequestsBeforeFailure).toBeGreaterThanOrEqual(2);
    expect(result.orphan).toEqual({
      refused: true,
      zeroWrites: true,
      graphUnchanged: true,
      bytesUnchanged: true,
    });
    expect(result.corruption).toEqual({
      invalid: true,
      refused: true,
      zeroWrites: true,
      preserved: true,
    });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
