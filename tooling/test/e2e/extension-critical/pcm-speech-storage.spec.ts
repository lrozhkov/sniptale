import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';

for (const sourceVersion of [21, 23] as const) {
  test(`native admission from physical${sourceVersion} rolls back interruption, retains released rows/objects and refuses old writers`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    try {
      await page.goto(host.origin);
      const bundle = await build({
        entryPoints: ['tooling/test/e2e/support/pcm-speech-storage-probe.ts'],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
      });
      const result = await page.evaluate(
        async ({ text, sourceVersion }) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
          try {
            return await (await import(url)).probe(sourceVersion);
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { text: bundle.outputFiles[0]!.text, sourceVersion }
      );
      await writeFile(
        info.outputPath('pcm-native-admission.json'),
        JSON.stringify(result, null, 2)
      );
      expect(result).toEqual({
        interruption: 'AbortError',
        rolledBack: true,
        retainedRows: true,
        retainedObjects: true,
        admitted: true,
        expectedContracts: true,
        oldWriter: 'VersionError',
        reopenedUnchanged: true,
      });
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
