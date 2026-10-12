import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';

for (const published of [false, true])
  test(`stale Undo resources survive rollover and retire only without independent publication (${published})`, async ({
    page,
    context,
  }) => {
    const host = await startHostServer();
    const reader = await context.newPage();
    let readerUrl: string | undefined;
    try {
      await page.goto(host.origin);
      await reader.goto(host.origin);
      const source = await readFile(
        'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json',
        'utf8'
      );
      const bundle = await build({
        entryPoints: ['tooling/test/e2e/support/editor-history-resources-probe.ts'],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
      });
      const text = bundle.outputFiles[0]!.text;
      const actor = await page.evaluate(
        async ({ text, source }) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
          return { url, source: await (await import(url)).seed(source) };
        },
        { text, source }
      );
      if (published)
        await page.evaluate(async (url) => (await import(url)).publishIndependentCard(), actor.url);
      const held = await reader.evaluate(async (text) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        return { url, state: await (await import(url)).holdReader() };
      }, text);
      readerUrl = held.url;
      expect(held.state).toEqual({ oldEffectCount: 1, dirty: true });
      expect(
        await reader.evaluate(async (url) => (await import(url)).readReaderSource(), held.url)
      ).toEqual({ status: 'ready', ...actor.source });
      expect(await page.evaluate(async (url) => (await import(url)).trim(), actor.url)).toEqual({
        historyLength: 50,
        snapshots: 0,
      });
      expect(
        await reader.evaluate(async (url) => (await import(url)).readReaderSource(), held.url)
      ).toEqual({ status: 'ready', ...actor.source });
      await reader.evaluate(async (url) => (await import(url)).releaseReader(), held.url);
      expect(await page.evaluate(async (url) => (await import(url)).replay(), actor.url)).toEqual(
        published
          ? { status: 'ready', ...actor.source }
          : {
              status: 'not-found',
              bytes: 0,
              sha256: null,
            }
      );
      expect(
        await page.evaluate(async (url) => (await import(url)).inspectRetirement(), actor.url)
      ).toEqual(
        published
          ? { bytes: actor.source.bytes, source: true, ref: true, owner: true, intents: 1 }
          : {
              bytes: 0,
              source: false,
              ref: false,
              owner: false,
              intents: 0,
            }
      );
    } finally {
      if (readerUrl)
        await reader.evaluate(async (url) => (await import(url)).releaseReader(), readerUrl);
      await reader.close();
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
