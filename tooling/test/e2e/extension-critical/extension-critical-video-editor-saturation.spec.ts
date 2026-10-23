import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  createVideoProjectFromRecording,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import {
  VideoTrackKind,
  type VideoProject,
} from '../../../../apps/extension/src/features/video/project/types';
import { createVideoProjectMotionRegion } from '../../../../apps/extension/src/features/video/project/motion';
import { bindMotionRegionToClip } from '../../../../apps/extension/src/features/video/project/motion/source-binding';
import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { parseHydratableVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { resolveVideoCompositionRenderPasses } from '../../../../apps/extension/src/features/video/composition/timeline/render';
import { mapCompositionPointThroughCamera } from '../../../../apps/extension/src/features/video/composition/motion';
import { readNativeVideoProject } from '../support/native-video-project';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import { checkInspectorPaintedFont } from '../support/inspector-utilities';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../support/effect-v1-corpus.test-support';
import { resourcePresetBundle } from './extension-critical-video-editor-resource-bundle.fixture';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

for (const variant of [
  { width: 1280, height: 560, locale: 'en', theme: 'light', format: 'WEBM' },
  { width: 1920, height: 900, locale: 'ru', theme: 'dark', format: 'MP4' },
] as const) {
  test(`two content resources retain all five motion blur exposures through reopen and ${variant.format} export`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(10000);
    const { width, height, locale, theme, format } = variant;
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(
      (value) => localStorage.setItem('sniptale-locale-preference', value),
      locale
    );
    const host = await startHostServer();
    try {
      const storage = { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme };
      await applyHarnessBootstrap(page, { preserveMediaLibrary: true, storage });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await seedReviewVideo(page, 'cache-source.webm', { width: 320, height: 180, duration: 4 });
      const sourceBytes = await readFile('tooling/test/e2e/fixtures/cache-source.webm');
      const baseline = createVideoProjectFromRecording({
        recordingId: 'beta-v1-recording',
        filename: 'beta-v1.webm',
        width: 320,
        height: 180,
        duration: 4,
        size: sourceBytes.length,
        mimeType: 'video/webm',
      });
      baseline.tracks.push(
        createVideoProjectTrack('Import 1', -1, VideoTrackKind.PRIMARY),
        createVideoProjectTrack('Import 2', -2, VideoTrackKind.PRIMARY)
      );
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage,
        videoProjects: [baseline],
      });
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${baseline.id}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const open = () =>
        page
          .locator(
            '[data-ui="video-editor.viewer.open-effects"], [data-ui="video-editor.library-tab.effects"]'
          )
          .first()
          .click();
      await open();
      const dock = page.locator('[data-ui="video-editor.effects-library.dock"]');
      const specimen = EFFECT_BUNDLE_CORPUS.find(
        (item) => item.accepted && item.artifact.includes('asset-bearing-conformance')
      );
      if (!specimen) throw new Error('Missing SDK resource corpus');
      const chooser = page.waitForEvent('filechooser');
      await dock
        .getByRole('button', { name: label('videoEditor.effectsLibrary.importPack'), exact: true })
        .click();
      await (
        await chooser
      ).setFiles({
        name: 'resource.sniptale-bundle.zip',
        mimeType: 'application/zip',
        buffer: await resourcePresetBundle(readEffectBundleCorpusArchive(specimen)),
      });
      for (const style of [
        locale === 'en' ? 'Bright' : 'Светлый',
        locale === 'en' ? 'Deep' : 'Глубокий',
      ]) {
        await page
          .locator('[data-ui="video-editor.timeline.track-select"]')
          .filter({
            hasText: style === (locale === 'en' ? 'Bright' : 'Светлый') ? 'Import 1' : 'Import 2',
          })
          .click();
        await page.locator('[data-ui="video-editor.library-tab.annotations"]').click();
        const card = page
          .locator('[data-effect-document="neutral-runtime-conformance"]')
          .filter({ hasText: style });
        await card.hover();
        await card
          .getByRole('button', {
            name: label('videoEditor.effectsLibrary.applyToScene'),
            exact: true,
          })
          .click();
        await page.locator('[data-ui="video-editor.materials.close"]').click();
        if (style === (locale === 'en' ? 'Bright' : 'Светлый')) await open();
      }
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.effectInstances?.length)
        .toBe(2);
      const imported = (await readNativeVideoProject(page))!;
      const source = imported.clips.find((clip) => clip.type === 'VIDEO');
      if (!source || source.type !== 'VIDEO') throw new Error('Missing actual video');
      const bodies = imported.clips.filter((clip) => clip.type === 'EFFECT');
      const tracks = bodies.map((body) =>
        imported.tracks.find((track) => track.id === body.trackId)!
      );
      const project = parseHydratableVideoProject({
        ...imported,
        version: 44,
        id: crypto.randomUUID(),
        name: 'Two content resources',
        fps: 40,
        tracks: imported.tracks,
        clips: imported.clips.map((clip) => {
          const index = bodies.findIndex((body) => body.id === clip.id);
          return index < 0
            ? clip
            : {
                ...clip,
                trackId: tracks[index]!.id,
                timelineLaneId: 'line-1',
                startTime: 0,
                duration: 2,
                attachment: {
                  kind: 'source',
                  assetId: source.assetId,
                  sourceInstanceId: source.sourceInstanceId ?? source.id,
                },
                sourceRange: {
                  assetId: source.assetId,
                  sourceInstanceId: source.sourceInstanceId ?? source.id,
                  start: 0,
                  end: 2,
                },
                transform: { ...clip.transform, x: index * 160, y: 45, width: 160, height: 90 },
              };
        }),
        motionRegions: [
          bindMotionRegionToClip(
            {
              ...createVideoProjectMotionRegion(imported, 0),
              duration: 2,
              scale: 1.1,
              zoomInDuration: 0.8,
              zoomOutDuration: 0.8,
              motionBlur: {
                enter: { enabled: true, strength: 1 },
                exit: { enabled: true, strength: 1 },
              },
            },
            source
          ),
        ],
      });
      if (!project) throw new Error('Invalid admitted two-layer baseline');
      // The recording and SVGs were imported above. Only geometry/camera are an admitted baseline.
      await applyHarnessBootstrap(page, { preserveMediaLibrary: true, storage });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      const normalized = hydrateVideoProject(project);
      expect(hydrateVideoProject(normalized)).toEqual(normalized);
      await installBaseline(page, normalized, imported.id);
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}`);
      const selected = bodies[1]!;
      await page.locator(`[data-project-timeline-clip="${selected.id}"]`).click();
      const panel = page.locator('[data-ui="video-editor.inspector.content"]');
      if (!(await panel.locator('[data-presentation="all"]').isVisible()))
        await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      const intensity = panel.getByRole('textbox', {
        name: locale === 'en' ? 'Intensity' : 'Интенсивность',
        exact: true,
      });
      await intensity.fill('0.65');
      await intensity.press('Enter');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.effectInstances?.find(
              (instance) => instance.id === selected.effectInstanceId
            )?.controls['intensity']
        )
        .toBe(0.65);
      await checkInspectorPaintedFont(page, intensity, 'two-resource-intensity');
      const saved = (await readNativeVideoProject(page))!;
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect(await readNativeVideoProject(page)).toEqual(saved);
      const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      await playhead.press('Home');
      for (let index = 0; index < 10; index++) await playhead.press('ArrowRight');
      const passes = resolveVideoCompositionRenderPasses(saved, 0.25);
      expect(passes.visualPasses).toHaveLength(5);
      for (const pass of passes.visualPasses) {
        expect(pass.frame.effectRuntimePlans).toHaveLength(2);
        for (const plan of pass.frame.effectRuntimePlans!) expect(plan.assets).toHaveLength(1);
      }
      const points = bodies.map((_body, index) =>
        mapCompositionPointThroughCamera(
          { x: index * 160 + 85.5, y: 90 },
          passes.overlayFrame.camera
        )!
      );
      for (const point of points)
        await expect.poll(() => previewError(page, saved, point)).toBeLessThan(12);
      await page.screenshot({
        path: info.outputPath('two-resource-reopened.png'),
        fullPage: false,
      });
      const output = await encodedNativeVideoSamples(
        page,
        host.origin,
        saved,
        format,
        points.map((point) => ({
          time: 0.25,
          x: Math.round(point.x),
          y: Math.round(point.y),
          expected: [255, 134, 24],
        }))
      );
      for (const sample of output.samples) expect(sample.error).toBeLessThan(12);
      expect(output.samples).toHaveLength(2);
      expect(await readNativeVideoProject(page, saved.id)).toEqual(saved);
      expect(await readNativeVideoProject(page, imported.id)).toEqual(imported);
      await writeFile(
        info.outputPath('two-resource-proof.json'),
        JSON.stringify({
          project: saved,
          passes: passes.visualPasses.map((pass) => ({
            time: pass.time,
            plans: pass.frame.effectRuntimePlans?.map((plan) => ({
              id: plan.effectInstanceId,
              assets: plan.assets.length,
            })),
          })),
          output,
        })
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

async function installBaseline(page: Page, project: VideoProject, sourceProjectId: string) {
  await page.evaluate(
    async ({ project, sourceProjectId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const tx = db.transaction('video_projects', 'readwrite');
        const done = new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
        const entry: unknown = await new Promise((resolve, reject) => {
          const request = tx.objectStore('video_projects').get(sourceProjectId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (
          !entry ||
          typeof entry !== 'object' ||
          !('project' in entry) ||
          !entry.project ||
          typeof entry.project !== 'object' ||
          !('effectSnapshots' in entry.project) ||
          !Array.isArray(entry.project.effectSnapshots) ||
          entry.project.effectSnapshots.length !== project.effectSnapshots?.length
        ) {
          tx.abort();
          await done.catch(() => undefined);
          throw new Error('Missing admitted resource project');
        }
        tx.objectStore('video_projects').put({
          id: project.id,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          project: { ...project, effectSnapshots: entry.project.effectSnapshots },
        });
        await done;
      } finally {
        db.close();
      }
    },
    { project, sourceProjectId }
  );
}
async function previewError(page: Page, project: VideoProject, point: { x: number; y: number }) {
  return page.locator('[data-preview-stage-canvas]').evaluate(
    (node: HTMLCanvasElement, p) => {
      const scale = Math.min(node.width / p.width, node.height / p.height);
      const pixel = node
        .getContext('2d')!
        .getImageData(
          Math.round((node.width - p.width * scale) / 2 + p.x * scale),
          Math.round((node.height - p.height * scale) / 2 + p.y * scale),
          1,
          1
        ).data;
      return (
        [255, 134, 24].reduce((sum, value, index) => sum + Math.abs(pixel[index]! - value), 0) / 3
      );
    },
    { ...point, width: project.width, height: project.height }
  );
}
