import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';

test('Gallery orphan maintenance skips idle scans and validates a batch once with cooperative parsing', async ({
  page,
}) => {
  const host = await startHostServer();
  try {
    await page.goto(host.origin);
    const bundle = await build({
      entryPoints: ['tooling/test/e2e/support/library-maintenance-probe.ts'],
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
      idleReads: 0,
      batchReads: 12,
      remaining: ['retained'],
      intents: 0,
    });
    expect(result.ticks).toBeGreaterThan(20);
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
