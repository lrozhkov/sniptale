import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import { createInlineWorkerBundlePlugin } from '../support/inline-worker-bundle';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { translate } from '../support/catalog-fixture';
import type { CapacityEditor } from '../support/editor-history-capacity-probe';
import {
  applyHarnessBootstrap,
  EDITOR_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
  SCENARIO_EDITOR_VISUAL_HARNESS_PATH,
  GALLERY_HARNESS_PATH,
} from '../extension-critical.helpers';

test.use({ actionTimeout: 10_000 });

async function probe(page: Page, text: string, kind: CapacityEditor, id?: string) {
  return page.evaluate(
    async ({ text, kind, id }) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try {
        const module = await import(url);
        return id ? module.inspect(kind, id) : module.seed(kind);
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    { text, kind, id }
  );
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const kind of ['image', 'montage', 'scenario', 'gallery'] as const) {
    test(`default 1000 actions survive native ${kind} navigation and reopening ${viewport.name}`, async ({
      page,
      context,
    }, info) => {
      test.setTimeout(120_000);
      const host = await startHostServer();
      let active = page;
      const bootstrap = async () => {
        await active.setViewportSize(viewport.size);
        await applyHarnessBootstrap(active, {
          preserveMediaLibrary: true,
          editorDispatchBootstrapPayload: false,
          storage: { 'sniptale-locale-preference': 'en' },
        });
      };
      try {
        await bootstrap();
        await active.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
        await active.locator('[data-ui="gallery.page.root"]').waitFor();
        if (kind === 'gallery')
          await seedReviewVideo(active, 'review-vp8-opus.webm', {
            width: 160,
            height: 90,
            duration: 12,
          });
        const bundle = await build({
          entryPoints: ['tooling/test/e2e/support/editor-history-capacity-probe.ts'],
          bundle: true,
          platform: 'browser',
          format: 'esm',
          write: false,
          plugins: [createInlineWorkerBundlePlugin()],
          define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
        });
        const text = bundle.outputFiles[0]!.text;
        const { id } = await probe(active, text, kind);
        const native = () => probe(active, text, kind, id);
        await expect.poll(native).toMatchObject({ count: 1000, cursor: 1000, future: 0 });
        const path =
          kind === 'image'
            ? `${EDITOR_HARNESS_PATH}?assetId=${id}`
            : kind === 'montage'
              ? `${VIDEO_EDITOR_HARNESS_PATH}?project=${id}`
              : kind === 'scenario'
                ? `${SCENARIO_EDITOR_VISUAL_HARNESS_PATH}?projectId=${id}&skipSeed=1&locale=en`
                : `${GALLERY_HARNESS_PATH}?mediaId=${encodeURIComponent(id)}&mode=edit`;
        const open = async () => {
          await active.goto(`${host.origin}${path}`);
          if (kind === 'gallery') {
            await active
              .getByRole('button', {
                name: translate('gallery.videoReview.audioOriginal', 'en'),
                exact: true,
              })
              .click();
            await expect(
              active.getByRole('tab', {
                name: translate('gallery.videoReview.audioOriginal', 'en'),
                exact: true,
              })
            ).toHaveAttribute('aria-selected', 'true');
            const settings = active.getByRole('tab', { name: 'Settings', exact: true });
            if (!(await settings.isVisible())) {
              await active
                .getByRole('button', {
                  name: translate('gallery.videoReview.advancedEditing', 'en'),
                  exact: true,
                })
                .click();
              await active
                .getByRole('button', {
                  name: translate('gallery.videoReview.audioOriginal', 'en'),
                  exact: true,
                })
                .click();
            }
            await settings.click();
            const volume = active.getByRole('textbox', { name: 'Volume', exact: true });
            if (!(await volume.isVisible()))
              await active.getByRole('button', { name: 'Volume', exact: true }).click();
          }
          if (kind === 'image') {
            await expect(active.locator('[data-ui="editor.page.open-loading"]')).toHaveCount(0);
            await active.locator('[data-ui="editor.floating.layers.mode.history"]').click();
            await expect(active.locator('[data-ui="editor.inspector.history.entry"]')).toHaveCount(
              1001
            );
          }
        };
        const undo = () =>
          kind === 'image'
            ? active.locator('[data-ui="editor.floating.tool-rail.history.undo"]')
            : kind === 'montage'
              ? active.locator('[data-ui="video-editor.timeline.toolbar.undo"]')
              : active.getByRole('button', {
                  name: kind === 'gallery' ? 'Undo change' : 'Undo',
                  exact: true,
                });
        const redo = () =>
          kind === 'image'
            ? active.locator('[data-ui="editor.floating.tool-rail.history.redo"]')
            : kind === 'montage'
              ? active.locator('[data-ui="video-editor.timeline.toolbar.redo"]')
              : active.getByRole('button', {
                  name: kind === 'gallery' ? 'Redo change' : 'Redo',
                  exact: true,
                });
        await open();
        await expect(undo()).toBeEnabled();
        await undo().click();
        await expect.poll(native).toMatchObject({ count: 1000, cursor: 999, future: 1 });
        await active.close();
        active = await context.newPage();
        await bootstrap();
        await open();
        await expect(redo()).toBeEnabled();
        await redo().click();
        await expect.poll(native).toMatchObject({ count: 1000, cursor: 1000, future: 0 });
        const edit = async (value: string) => {
          if (kind === 'image') {
            await active.evaluate(async () => {
              if (!window.__sniptaleEditorHarness) throw new Error('Missing editor harness.');
              await window.__sniptaleEditorHarness.applyBrowserFrameMutation();
            });
          } else {
            const field = active.getByRole('textbox', {
              name:
                kind === 'montage'
                  ? translate('videoEditor.app.title', 'en')
                  : kind === 'scenario'
                    ? 'Scenario'
                    : 'Volume',
              exact: true,
            });
            await field.fill(value);
            await field.press('Tab');
          }
        };
        const beforeOverflow = await native();
        await edit(kind === 'gallery' ? '60' : 'Capacity overflow');
        await expect
          .poll(async () => (await native()).revision)
          .toBeGreaterThan(beforeOverflow.revision);
        await expect.poll(native).toMatchObject({ count: 1000, cursor: 1000, future: 0 });
        await undo().click();
        await expect.poll(native).toMatchObject({ count: 1000, cursor: 999, future: 1 });
        await edit(kind === 'gallery' ? '70' : 'Capacity branch');
        await expect(redo()).toBeDisabled();
        await expect.poll(native).toMatchObject({ count: 1000, cursor: 1000, future: 0 });
        if (kind === 'image')
          await active
            .locator('[data-ui="editor.inspector.history.entry"][aria-current]')
            .scrollIntoViewIfNeeded();
        await active.screenshot({
          path: info.outputPath('capacity-after-branch.png'),
          fullPage: false,
        });
      } finally {
        host.server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}
