import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  for (const historyLength of [51, 100, 1190]) {
    test(`native ${historyLength}-operation storage scale at ${viewport.width}x${viewport.height}`, async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      await page.setViewportSize(viewport);
      const host = await startHostServer();
      try {
        await page.goto(host.origin);
        const source = await readFile(
          'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json',
          'utf8'
        );
        const bundle = await build({
          entryPoints: ['tooling/test/e2e/support/editor-history-retention-probe.ts'],
          bundle: true,
          format: 'esm',
          platform: 'browser',
          write: false,
          define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
        });
        const text = bundle.outputFiles[0]!.text;
        const result = await page.evaluate(
          async ({ text, source, historyLength }) => {
            const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
            try {
              return await (await import(url)).probe(source, historyLength);
            } finally {
              URL.revokeObjectURL(url);
            }
          },
          { text, source, historyLength }
        );
        await writeFile(
          info.outputPath('native-history-scale.json'),
          JSON.stringify(
            {
              viewport,
              sourceBundleSha256: createHash('sha256').update(text).digest('hex'),
              ...result,
            },
            null,
            2
          )
        );
        expect(result.initialHistoryLength).toBe(historyLength);
        if (historyLength === 1190) {
          expect(result.fixtureBytes).toBeGreaterThan(65 * 1024 * 1024);
          expect(result.fixtureBytes).toBeLessThan(80 * 1024 * 1024);
        }
        expect(result.saves).toHaveLength(6);
        expect(result.readback).toMatchObject({
          cuts: 14,
          speeds: 14,
          notes: 1,
          comments: 1,
        });
        expect(result.currentPreserved).toBe(true);
        expect(result.physicalHistoryRows).toBe(result.readback.historyLength + 1);
        expect(result.readback.cursor).toBe(result.readback.historyLength);
        expect(result.readback.historyLength).toBeLessThanOrEqual(50);
        if (historyLength > 64) {
          expect(result.readback).toMatchObject({ fragments: 112, effects: 1, actionAudio: 1 });
          expect(result.typing).toEqual({
            historyLength: 50,
            typedTailPuts: 1,
            retainedRowsUnchanged: true,
            actionCount: 1,
            finalText: 'Native field final',
          });
        } else {
          expect(result.readback.fragments).toBeUndefined();
          expect(result.typing).toBeNull();
        }
      } finally {
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}
