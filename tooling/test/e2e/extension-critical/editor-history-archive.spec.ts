import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { createInlineWorkerBundlePlugin } from '../support/inline-worker-bundle';

for (const scenario of [
  { strategy: 'skip', failSecondRoot: false, roots: 2 },
  { strategy: 'replace', failSecondRoot: false, roots: 2 },
  { strategy: 'duplicate', failSecondRoot: false, roots: 4 },
  { strategy: 'duplicate', failSecondRoot: true, roots: 3 },
] as const) {
  test(`native shared archive ${scenario.strategy}, second-root failure ${scenario.failSecondRoot}`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    const host = await startHostServer();
    try {
      await page.goto(host.origin);
      const bundle = await build({
        entryPoints: ['tooling/test/e2e/support/editor-history-archive-probe.ts'],
        plugins: [createInlineWorkerBundlePlugin()],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
      });
      const result = await page.evaluate(
        async ({ source, strategy, failSecondRoot }) => {
          const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
          try {
            return await (await import(url)).probe(strategy, failSecondRoot);
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { source: bundle.outputFiles[0]!.text, ...scenario }
      );
      await writeFile(
        info.outputPath('native-shared-archive.json'),
        JSON.stringify(result, null, 2)
      );
      expect(result.legacyServiceCopies).toBe(2);
      expect(result.sharedServiceCopies).toBe(0);
      expect(result.selectedVisibleFiles).toBe(2);
      expect(result.sharedObjects).toBe(1);
      expect(result.logicalObjects).toBe(6);
      expect(result.readableRoots).toBe(scenario.roots);
      expect(result.failure).toBe(scenario.failSecondRoot);
      expect(result.json).toHaveLength(2);
      for (const entry of result.json) expect(entry.compressedSize).toBeLessThan(entry.size / 2);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
