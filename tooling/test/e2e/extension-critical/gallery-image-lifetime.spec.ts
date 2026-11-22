import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import { createInlineWorkerBundlePlugin } from '../support/inline-worker-bundle';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { translate } from '../support/catalog-fixture';

async function runProbe(
  page: Page,
  source: string,
  action: 'seed' | 'replace' | 'inspect',
  id: string
) {
  return page.evaluate(
    async ({ source, action, id }) => {
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try {
        const probe: typeof import('../support/editor-history-archive-probe') = await import(url);
        if (action === 'seed') return (await probe.seedEditableImageLifetime()).state;
        if (action === 'replace') return await probe.replaceImageLifetimeFromArchive(id);
        return await probe.inspectImageLifetime(id);
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    { source, action, id }
  );
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const replace of [false, true]) {
    test(`Gallery Restore Original lifetime at ${viewport.name}, archive replacement ${replace}`, async ({
      page,
    }, info) => {
      const host = await startHostServer();
      const id = 'gallery-history-lifetime';
      try {
        await page.setViewportSize(viewport.size);
        await applyHarnessBootstrap(page, {
          preserveMediaLibrary: true,
          storage: { 'sniptale-locale-preference': 'en' },
        });
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
        await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
        const bundle = await build({
          entryPoints: ['tooling/test/e2e/support/editor-history-archive-probe.ts'],
          plugins: [createInlineWorkerBundlePlugin()],
          bundle: true,
          format: 'esm',
          platform: 'browser',
          write: false,
          define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
        });
        const source = bundle.outputFiles[0]!.text;
        const initial = await runProbe(page, source, 'seed', id);
        expect(initial.workspace.history?.cursor).toBe(1);
        await page.reload();
        await page
          .getByRole('button', { name: 'Lifetime history.png', exact: true })
          .first()
          .click();
        await page
          .getByRole('button', {
            name: translate('gallery.preview.restoreOriginal', 'en'),
            exact: true,
          })
          .click();
        const confirmation = page.getByRole('alertdialog', {
          name: translate('gallery.preview.restoreOriginalTitle', 'en'),
          exact: true,
        });
        await expect(confirmation).toBeVisible();
        const replacement = replace ? await runProbe(page, source, 'replace', id) : initial;
        if (replace) {
          expect(replacement.generation).not.toBe(initial.generation);
          expect(replacement.workspace.revision).toBe(initial.workspace.revision);
          expect(replacement.workspace.history?.cursor).toBe(1);
        }
        await confirmation
          .getByRole('button', {
            name: translate('gallery.preview.restoreOriginalConfirm', 'en'),
            exact: true,
          })
          .click();
        await expect(confirmation).toBeHidden();
        if (replace) {
          await expect.poll(() => runProbe(page, source, 'inspect', id)).toEqual(replacement);
          await expect(page.locator('[data-ui="gallery.preview.inspector"]')).toBeVisible();
        } else {
          await expect
            .poll(() => runProbe(page, source, 'inspect', id))
            .toMatchObject({
              generation: initial.generation,
              imageContentState: 'original',
              workspace: { revision: initial.workspace.revision + 1 },
            });
          expect((await runProbe(page, source, 'inspect', id)).workspace.history).toBeUndefined();
        }
        await writeFile(
          info.outputPath('image-lifetime.json'),
          JSON.stringify(
            { initial, replacement, final: await runProbe(page, source, 'inspect', id) },
            null,
            2
          )
        );
        await page.screenshot({
          path: info.outputPath('image-lifetime-result.png'),
          fullPage: false,
        });
      } finally {
        host.server.closeAllConnections();
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}
