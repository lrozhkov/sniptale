import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { startHostServer } from '../support/host-server';

for (const probe of ['exportProbe', 'previewProbe'] as const) {
  test(`quick-editor slow motion ${probe} preserves source cadence`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const host = await startHostServer();
    try {
      await page.goto(host.origin);
      const bundle = await build({
        entryPoints: ['tooling/test/e2e/support/slow-motion-probe.ts'],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        loader: { '.svg': 'text' },
        define: { 'process.env.NODE_ENV': '"production"' },
      });
      const result = await page.evaluate(
        async ({ text, probe }) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
          try {
            return await (await import(url))[probe]();
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { text: bundle.outputFiles[0]!.text, probe }
      );
      await writeFile(info.outputPath(`${probe}.json`), JSON.stringify(result, null, 2));
      if (probe === 'exportProbe') {
        expect(result.source.frames.map((frame: { id: number }) => frame.id)).toEqual(
          Array.from({ length: 30 }, (_, i) => i)
        );
        for (const row of result.results) {
          if (row.mode === 'cut-edge') {
            expect(row.frames.map((frame: { id: number }) => frame.id)).toEqual([0, 1, 1]);
            expect(Math.abs(row.duration - 0.0668)).toBeLessThan(0.001);
            continue;
          }
          expect(Math.abs(row.duration - result.source.duration / row.rate)).toBeLessThan(0.04);
          expect([...new Set(row.frames.map((frame: { id: number }) => frame.id))]).toEqual(
            Array.from({ length: 30 }, (_, i) => i)
          );
          if (row.mode === 'copy') {
            expect(row.byteIdentity).toBe(true);
            expect(row.packets).toHaveLength(30);
            for (let i = 0; i < 30; i++)
              expect(
                Math.abs(row.packets[i].time - result.source.frames[i].time / row.rate)
              ).toBeLessThan(0.002);
          } else {
            expect(row.frames).toHaveLength(
              Math.ceil((result.source.duration / row.rate) * row.fps - 1e-9)
            );
            for (let id = 0; id < 30; id++)
              expect(row.frames.filter((frame: { id: number }) => frame.id === id)).toHaveLength(
                row.fps / (30 * row.rate)
              );
            for (let i = 0; i < row.frames.length; i++) {
              expect(row.frames[i].id).toBe(Math.floor((i * row.rate * 30) / row.fps));
              expect(Math.abs(row.frames[i].time - i / row.fps)).toBeLessThan(0.001);
            }
          }
        }
      } else {
        for (const row of result) {
          expect(row.failure).toBe(false);
          expect(row.actualRate).toBe(row.rate);
          expect(row.frames.length).toBeGreaterThanOrEqual(2);
          for (let i = 1; i < row.frames.length; i++)
            expect(row.frames[i].time).toBeGreaterThan(row.frames[i - 1].time);
          const first = row.frames[0];
          const last = row.frames.at(-1);
          const measured = (last.time - first.time) / ((last.wall - first.wall) / 1000);
          expect(Math.abs(measured / row.rate - 1)).toBeLessThan(0.25);
        }
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
