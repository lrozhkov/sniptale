import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { createInlineWorkerBundlePlugin } from '../support/inline-worker-bundle';

async function bundle() {
  const result = await build({
    entryPoints: ['tooling/test/e2e/support/editor-known-source-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    plugins: [createInlineWorkerBundlePlugin()],
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  });
  return result.outputFiles[0]!.text;
}

for (const kind of ['recording', 'export'] as const)
  test(`native ${kind} insertion shares immutable bytes across two Montage projects`, async ({
    page,
  }) => {
    const host = await startHostServer();
    try {
      await page.goto(host.origin);
      const state = await page.evaluate(
        async ({ text, kind }) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
          try {
            const probe = await import(url);
            return { seeded: await probe.seed(), inserted: await probe.insertTwice(kind) };
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { text: await bundle(), kind }
      );
      expect(new Set(state.inserted.ids).size).toBe(2);
      expect(state.inserted.before).toEqual({
        objectCount: 1,
        objectBytes: state.seeded.bytes,
        refs: 1,
        owners: 2,
        children: 0,
      });
      expect(state.inserted.after).toEqual({
        objectCount: 1,
        objectBytes: state.seeded.bytes,
        refs: 1,
        owners: 4,
        children: 2,
      });
      expect(state.inserted.sha256).toBe(state.seeded.sha256);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });

for (const deleted of [false, true])
  test(`native accepted receipt survives lost ACK and origin removal ${deleted}`, async ({
    page,
  }) => {
    const host = await startHostServer();
    try {
      await page.goto(host.origin);
      const state = await page.evaluate(
        async ({ text, deleted }) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
          try {
            const probe = await import(url);
            const seeded = await probe.seed();
            return { seeded, result: await probe.replayAfterOriginChange(deleted) };
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { text: await bundle(), deleted }
      );
      expect(state.result.after).toEqual(state.result.before);
      expect(state.result.readableBytes).toBe(state.seeded.bytes);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });

test('native ambiguous destination keeps its ready receipt during startup recovery', async ({
  page,
}) => {
  const host = await startHostServer();
  try {
    await page.goto(host.origin);
    const result = await page.evaluate(
      async (text) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        try {
          const probe = await import(url);
          const seeded = await probe.seed();
          return { seeded, state: await probe.recoverAmbiguousDestination() };
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      await bundle()
    );
    expect(result.state.retained).toBe(true);
    expect(result.state.readableBytes).toBe(result.seeded.bytes);
    expect(result.state.state).toEqual({
      objectCount: 1,
      objectBytes: result.seeded.bytes,
      refs: 1,
      owners: 3,
      children: 1,
    });
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
