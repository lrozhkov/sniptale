import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';

test('native scenario units preserve logical history and write only changed entities', async ({
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
    expect(result.unitAdmission).toEqual({
      aborted: true,
      rollback: true,
      emptyUnits: 0,
      unchangedHead: true,
      unchangedHistory: true,
    });
    expect(result.unitProof).toMatchObject({
      initialUnits: 4,
      nameUnitWrites: 0,
      nameHistoryClones: 0,
      detachedSnapshots: true,
      nameRetained: true,
      guideUnitWrites: 1,
      tourUnitWrites: 1,
      reorderUnitWrites: 0,
      reorderRetained: true,
      logical: true,
      clearedUnits: 4,
      clearedLogical: true,
      deleted: true,
      orphan: { refused: true, zeroWrites: true, graphUnchanged: true, bytesUnchanged: true },
    });
    expect(result.unitProof.nameRequests.map((row: { store: string }) => row.store).sort()).toEqual(
      ['scenario_project_history', 'scenario_projects']
    );
    expect(
      result.unitProof.guideRequests.map((row: { store: string }) => row.store).sort()
    ).toEqual(['scenario_project_history', 'scenario_project_units', 'scenario_projects']);
    expect(result.failedUnitWrites).toBe(1);
    expect(result.successfulRequestsBeforeFailure).toBeGreaterThanOrEqual(3);
    expect(result).toMatchObject({
      failure: 'QuotaExceededError',
      rollback: true,
      bytesAfterRollback: true,
      retainedCount: 50,
      physicalCount: 50,
      cleared: true,
      orphanRetained: true,
      corruption: { invalid: true, refused: true, zeroWrites: true, preserved: true },
    });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
