import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';

test('native project indexes migrate atomically and backfill 1001 legacy projects', async ({
  page,
}) => {
  const host = await startHostServer();
  try {
    await page.goto(host.origin);
    const bundle = await build({
      entryPoints: ['tooling/test/e2e/support/project-usage-index-probe.ts'],
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
    expect(result).toMatchObject({
      admission: { databaseVersion: 9, status: 'ready' },
      aborted: true,
      rollback: true,
      pending: true,
      changed: true,
      rollbackCount: 1,
      afterEdit: [],
      indexedCount: 1000,
    });
    expect(result.usage).toEqual([
      expect.objectContaining({ id: 'project-1000', kind: 'video', primary: false }),
    ]);
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
