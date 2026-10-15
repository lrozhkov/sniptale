import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import {
  applyHarnessBootstrap,
  EDITOR_HARNESS_PATH,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
  SCENARIO_EDITOR_VISUAL_HARNESS_PATH,
} from '../extension-critical.helpers';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createTextClip } from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';
import { translate } from '../../../../apps/extension/src/platform/i18n';

type Measurement = {
  frames: number;
  inputToFrameMs: number[];
  inputTimings: { type: string; eventMs: number; handlerMs: number; frameMs: number }[];
  frameTimes: number[];
  longTasks: { start: number; duration: number }[];
  writes: { store: string; elapsedMs: number }[];
  acknowledgements: { store: string; elapsedMs: number }[];
};
declare global {
  interface Window {
    __sniptaleAutosaveMeasure?: () => Measurement;
    __sniptaleAutosaveFailed?: boolean;
  }
}

async function startMeasurement(page: Page) {
  await page.evaluate(() => {
    const result: Measurement = {
      frames: 0,
      inputToFrameMs: [],
      inputTimings: [],
      frameTimes: [],
      longTasks: [],
      writes: [],
      acknowledgements: [],
    };
    const started = performance.now();
    let stopped = false;
    const frame = () => {
      if (!stopped) {
        result.frames++;
        result.frameTimes.push(performance.now() - started);
        requestAnimationFrame(frame);
      }
    };
    requestAnimationFrame(frame);
    const input = (event: Event) => {
      const at = event.timeStamp;
      const handlerMs = performance.now() - started;
      requestAnimationFrame(() => {
        if (!stopped) {
          const frameMs = performance.now() - started;
          result.inputToFrameMs.push(frameMs + started - at);
          result.inputTimings.push({ type: event.type, eventMs: at - started, handlerMs, frameMs });
        }
      });
    };
    window.addEventListener('input', input, true);
    window.addEventListener('keydown', input, true);
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        result.longTasks.push({ start: entry.startTime - started, duration: entry.duration });
    });
    observer.observe({ type: 'longtask' });
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (
        ['image_workspaces', 'video_workspaces', 'video_projects', 'scenario_projects'].includes(
          this.name
        )
      ) {
        result.writes.push({ store: this.name, elapsedMs: performance.now() - started });
        const store = this.name;
        this.transaction.addEventListener(
          'complete',
          () => result.acknowledgements.push({ store, elapsedMs: performance.now() - started }),
          { once: true }
        );
      }
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    };
    window.__sniptaleAutosaveMeasure = () => {
      stopped = true;
      observer.disconnect();
      IDBObjectStore.prototype.put = original;
      window.removeEventListener('input', input, true);
      window.removeEventListener('keydown', input, true);
      return result;
    };
  });
}

async function readRoot(page: Page, store: string, id?: string) {
  return page.evaluate(
    async ({ store, id }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('sniptale-db');
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      try {
        return await new Promise<unknown>((resolve, reject) => {
          const tx = db.transaction(store, 'readonly');
          const request = id ? tx.objectStore(store).get(id) : tx.objectStore(store).getAll();
          let result: unknown;
          request.onsuccess = () => {
            result = request.result;
          };
          tx.oncomplete = () => resolve(result);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    { store, id }
  );
}

function revision(value: unknown): number {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') return 0;
  const raw =
    'revision' in row ? row.revision : 'workspaceRevision' in row ? row.workspaceRevision : 0;
  return typeof raw === 'number' ? raw : 0;
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const owner of ['image', 'montage', 'scenario', 'gallery', 'gallery-nearcap'] as const) {
    test(`actual ${owner} warm autosave and reopen at ${viewport.name}`, async ({
      page,
      context,
    }, info) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport.size);
      await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
      const host = await startHostServer();
      const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
      let id: string | undefined;
      let fixture: unknown;
      const store =
        owner === 'image'
          ? 'image_workspaces'
          : owner === 'montage'
            ? 'video_projects'
            : owner === 'scenario'
              ? 'scenario_projects'
              : 'video_workspaces';
      try {
        await applyHarnessBootstrap(page, {
          preserveMediaLibrary: true,
          storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
        });
        if (owner === 'image') {
          await page.goto(`${host.origin}${EDITOR_HARNESS_PATH}`);
          await expect(page.locator('[data-ui="editor.page.open-loading"]')).toHaveCount(0);
          await expect.poll(async () => revision(await readRoot(page, store))).toBeGreaterThan(0);
          id = new URL(page.url()).searchParams.get('assetId') ?? undefined;
          await page.locator('[data-ui="editor.floating.layers.mode.browser-frame"]').click();
          await page.getByRole('button', { name: 'Browser', exact: true }).click();
          await expect(page.getByRole('textbox', { name: 'Tab title', exact: true })).toBeVisible();
        } else if (owner === 'montage') {
          const project = createEmptyVideoProject('Native warm montage');
          id = project.id;
          project.duration = 120;
          project.clips.push({
            ...createTextClip(project.tracks[0]!.id, project.width, project.height, 0),
            duration: 120,
          });
          await applyHarnessBootstrap(page, {
            preserveMediaLibrary: true,
            videoProjects: [project],
            storage: { 'sniptale-locale-preference': 'en' },
          });
          await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${id}`);
          const title = page.getByRole('textbox', {
            name: label('videoEditor.app.title'),
            exact: true,
          });
          await expect(title).toBeVisible();
          await title.fill('Native cold montage');
        } else if (owner === 'scenario') {
          id = `native-autosave-${viewport.name}`;
          await page.goto(
            `${host.origin}${SCENARIO_EDITOR_VISUAL_HARNESS_PATH}?projectId=${id}&locale=en`
          );
          await expect(page.getByRole('textbox', { name: 'Scenario', exact: true })).toBeVisible();
        } else {
          await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
          await page.locator('[data-ui="gallery.page.root"]').waitFor();
          await seedReviewVideo(page, 'review-vp8-opus.webm', {
            width: 160,
            height: 90,
            duration: 12,
          });
          const source = await readFile(
            'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json',
            'utf8'
          );
          const bundle = await build({
            entryPoints: ['tooling/test/e2e/support/editor-autosave-probe.ts'],
            bundle: true,
            platform: 'browser',
            format: 'esm',
            write: false,
            define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
          });
          const text = bundle.outputFiles[0]!.text;
          fixture = await page.evaluate(
            async ({ text, source, fragments }) => {
              const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
              try {
                return await (await import(url)).seedGallery(source, fragments);
              } finally {
                URL.revokeObjectURL(url);
              }
            },
            { text, source, fragments: owner === 'gallery-nearcap' ? 270 : 112 }
          );
          if (owner === 'gallery-nearcap') {
            if (
              !fixture ||
              typeof fixture !== 'object' ||
              !('historyBytes' in fixture) ||
              typeof fixture.historyBytes !== 'number'
            )
              throw new Error('Missing canonical near-cap bytes');
            expect(fixture.historyBytes).toBeGreaterThan(0.9 * 8 * 1024 * 1024);
            expect(fixture.historyBytes).toBeLessThan(0.98 * 8 * 1024 * 1024);
          }
          fixture = {
            fixture,
            sourceBundleSha256: createHash('sha256').update(text).digest('hex'),
          };
          id = 'recording:beta-v1-recording';
          await page.reload();
          await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
          await page.locator('[data-ui="gallery.videoReview.enter"]').click();
          await page
            .getByRole('button', {
              name: label('gallery.videoReview.advancedEditing'),
              exact: true,
            })
            .click();
          await expect(
            page.getByRole('textbox', {
              name: label('gallery.videoReview.sourceAudioVolume'),
              exact: true,
            })
          ).toBeVisible();
        }
        if (owner === 'image') {
          await page.evaluate(async () => {
            if (!window.__sniptaleEditorHarness) throw new Error('Missing actual Image owner');
            for (let index = 0; index < 50; index++)
              await window.__sniptaleEditorHarness.applyBrowserFrameMutation();
          });
        } else if (owner === 'montage' || owner === 'scenario') {
          const title = page.getByRole('textbox', {
            name: owner === 'montage' ? label('videoEditor.app.title') : 'Scenario',
            exact: true,
          });
          for (let index = 0; index < 50; index++) {
            await title.fill(`Cold action ${index}`);
            if (owner === 'scenario') await title.press('Tab');
          }
        }
        if (owner === 'image' || owner === 'montage' || owner === 'scenario')
          await expect
            .poll(async () => JSON.stringify(await readRoot(page, store, id)))
            .toContain(owner === 'image' ? 'change-50' : 'Cold action 49');
        // Cold loading, 50 authored actions and initial presentation are outside the warm interval.
        await page.evaluate(() => document.fonts.ready);
        await expect.poll(async () => revision(await readRoot(page, store, id))).toBeGreaterThan(0);
        await page.waitForTimeout(3_200);
        if (owner === 'montage' || owner.startsWith('gallery'))
          await page
            .getByRole('button', {
              name: label(
                owner === 'montage' ? 'videoEditor.timeline.play' : 'gallery.videoReview.play'
              ),
              exact: true,
            })
            .first()
            .click();
        let previewOnly: Measurement | undefined;
        if (owner === 'montage' && viewport.name === '1920x900') {
          await startMeasurement(page);
          for (let index = 0; index < 39; index++) {
            await page.keyboard.press('Shift');
            await page.waitForTimeout(130);
          }
          previewOnly = await page.evaluate(() => {
            if (!window.__sniptaleAutosaveMeasure) throw new Error('Missing preview measurement');
            return window.__sniptaleAutosaveMeasure();
          });
          expect(previewOnly.writes).toEqual([]);
        }
        await startMeasurement(page);
        const revisions: number[] = [];
        const previewTimes: Array<Array<number | string | null>> = [];
        const previewOwner = owner === 'montage' || owner.startsWith('gallery');
        const play = page
          .getByRole('button', {
            name: label(
              owner === 'montage' ? 'videoEditor.timeline.play' : 'gallery.videoReview.play'
            ),
            exact: true,
          })
          .first();
        const readPreview = async () =>
          owner.startsWith('gallery')
            ? page
                .locator('dialog video')
                .first()
                .evaluate((video: HTMLVideoElement) => video.currentTime)
            : owner === 'montage'
              ? page.locator('[data-playback-counter="true"]').first().textContent()
              : null;
        for (let index = 0; index < 5; index++) {
          const prior = revision(await readRoot(page, store, id));
          const field = page.getByRole('textbox', {
            name:
              owner === 'image'
                ? 'Tab title'
                : owner === 'montage'
                  ? label('videoEditor.app.title')
                  : owner === 'scenario'
                    ? 'Scenario'
                    : label('gallery.videoReview.sourceAudioVolume'),
            exact: true,
          });
          await field.fill(
            owner.startsWith('gallery') ? String(80 + index) : `Native warm ${index}`
          );
          if (owner.startsWith('gallery') || owner === 'image') await field.press('Enter');
          const samples: Array<number | string | null> = [];
          if (previewOwner && (await play.isVisible())) await play.click();
          if (previewOwner) samples.push(await readPreview());
          await expect
            .poll(
              async () => {
                if (previewOwner && (await play.isVisible())) await play.click();
                if (previewOwner) samples.push(await readPreview());
                await page.keyboard.press('Shift');
                return revision(await readRoot(page, store, id));
              },
              { intervals: [50, 100, 150] }
            )
            .toBeGreaterThan(prior);
          revisions.push(revision(await readRoot(page, store, id)));
          previewTimes.push(samples);
          await expect(field).toHaveValue(
            owner.startsWith('gallery') ? String(80 + index) : `Native warm ${index}`
          );
          if (owner === 'montage' || owner === 'scenario') await expect(field).toBeFocused();
        }
        const evidence = await page.evaluate(() => {
          if (!window.__sniptaleAutosaveMeasure) throw new Error('Missing measurement');
          return window.__sniptaleAutosaveMeasure();
        });
        const sorted = [...evidence.inputToFrameMs].sort((a, b) => a - b);
        await writeFile(
          info.outputPath('warm-autosave.json'),
          JSON.stringify(
            {
              owner,
              viewport,
              fixture,
              revisions,
              previewTimes,
              previewOnly,
              inputToFrameP95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)],
              ...evidence,
            },
            null,
            2
          )
        );
        expect(revisions).toHaveLength(5);
        if (owner === 'montage' || owner.startsWith('gallery')) {
          for (const samples of previewTimes) expect(new Set(samples).size).toBeGreaterThan(1);
          const pause = page
            .getByRole('button', {
              name: label(
                owner === 'montage' ? 'videoEditor.timeline.pause' : 'gallery.videoReview.pause'
              ),
              exact: true,
            })
            .first();
          if (await pause.isVisible()) await pause.click();
        }
        expect(evidence.frames).toBeGreaterThan(5);
        expect(evidence.inputToFrameMs.length).toBeGreaterThanOrEqual(5);
        await page.screenshot({ path: info.outputPath('warm-settled.png'), fullPage: false });
        const saved = await readRoot(page, store, id);
        const url = page.url();
        await page.evaluate((store) => {
          const original = IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
            if (this.name === store) {
              window.__sniptaleAutosaveFailed = true;
              throw new DOMException('Native quota proof', 'QuotaExceededError');
            }
            return key === undefined ? original.call(this, value) : original.call(this, value, key);
          };
        }, store);
        const failedField = page.getByRole('textbox', {
          name:
            owner === 'image'
              ? 'Tab title'
              : owner === 'montage'
                ? label('videoEditor.app.title')
                : owner === 'scenario'
                  ? 'Scenario'
                  : label('gallery.videoReview.sourceAudioVolume'),
          exact: true,
        });
        await failedField.fill(owner.startsWith('gallery') ? '90' : 'Uncommitted quota draft');
        if (owner === 'image' || owner.startsWith('gallery')) await failedField.press('Enter');
        await expect.poll(() => page.evaluate(() => window.__sniptaleAutosaveFailed)).toBe(true);
        expect(await readRoot(page, store, id)).toEqual(saved);
        let warned = false;
        page.on('dialog', async (dialog) => {
          warned = dialog.type() === 'beforeunload';
          await dialog.accept();
        });
        const closed = page.waitForEvent('close');
        await page.close({ runBeforeUnload: true });
        await closed;
        expect(warned).toBe(true);
        const reopened = await context.newPage();
        await reopened.setViewportSize(viewport.size);
        await applyHarnessBootstrap(reopened, {
          preserveMediaLibrary: true,
          editorDispatchBootstrapPayload: false,
          storage: { 'sniptale-locale-preference': 'en' },
        });
        await reopened.goto(url);
        await expect
          .poll(async () => revision(await readRoot(reopened, store, id)))
          .toBe(revisions.at(-1));
        expect(await readRoot(reopened, store, id)).toEqual(saved);
        await reopened.close();
      } finally {
        host.server.closeAllConnections();
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}

test('bounded policy comparison uses native Gallery commits and keeps the latest held-write draft', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 560 });
  const host = await startHostServer();
  try {
    await applyHarnessBootstrap(page, { preserveMediaLibrary: true });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    const source = await readFile(
      'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json',
      'utf8'
    );
    const bundle = await build({
      entryPoints: ['tooling/test/e2e/support/editor-autosave-probe.ts'],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    });
    const text = bundle.outputFiles[0]!.text;
    const results = await page.evaluate(
      async ({ text, source }) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        try {
          return await (await import(url)).compareTiming(source);
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      { text, source }
    );
    await writeFile(
      info.outputPath('native-policy-comparison.json'),
      JSON.stringify(
        {
          sourceBundleSha256: createHash('sha256').update(text).digest('hex'),
          results,
          scope:
            'Browser scheduling and native Gallery persistence; alternative React/input latencies are not measured.',
        },
        null,
        2
      )
    );
    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.acknowledged).toBe(result.requests);
      expect(result.maxActive).toBe(1);
      expect(result.finalVolume).toBe(result.expectedVolume);
      expect(
        result.commits.filter((commit: { phase: string }) => commit.phase === 'held')
      ).toHaveLength(2);
    }
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
