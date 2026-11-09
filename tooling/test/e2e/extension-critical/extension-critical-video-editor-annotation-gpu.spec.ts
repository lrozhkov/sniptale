import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  parseEffectV1Source,
  resolveEffectV1ControlDefault,
} from '@sniptale/runtime-contracts/effect-v1';
import {
  createVideoProjectFromRecording,
  resolveVideoOverlayTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createEffectHostClip } from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';
import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { isHydratableVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';
import { expect, test } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { enableGpuPreviewProof, observeEffectGpuPlans } from '../support/gpu-preview-proof';
import { startHostServer } from '../support/host-server';
import { readNativeVideoProject } from '../support/native-video-project';
import { VIDEO_EDITOR_PLAY_LABEL, VIDEO_EDITOR_PAUSE_LABEL } from '../extension-critical.helpers';

async function openAnnotationProject(page: import('@playwright/test').Page, origin: string) {
  const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
  const source = await readFile(
    new URL(
      '../../../../apps/extension/public/video-effects/effects/annotations/sniptale-title/effect.sniptale-effect.json',
      import.meta.url
    ),
    'utf8'
  );
  const document = parseEffectV1Source(source).document;
  if (!document || document.kind !== 'standalone' || !document.objectLayout)
    throw new Error('Invalid standalone annotation fixture.');
  const project = createVideoProjectFromRecording({
    recordingId: 'beta-v1-recording',
    filename: 'beta-v1.webm',
    width: 160,
    height: 90,
    duration: 12,
    mimeType: 'video/webm',
    size: bytes.length,
  });
  project.width = 1280;
  project.height = 720;
  const video = project.clips.find((clip) => clip.type === 'VIDEO')!;
  video.transform = {
    ...video.transform,
    x: 0,
    y: 0,
    width: project.width,
    height: project.height,
  };
  const track = resolveVideoOverlayTrack(project, 0, 12);
  if (!project.tracks.includes(track)) project.tracks.push(track);
  const host = createEffectHostClip({
    objectLayout: document.objectLayout,
    duration: 12,
    effectInstanceId: 'parent-gpu-title',
    name: 'GPU annotation',
    projectWidth: project.width,
    projectHeight: project.height,
    startTime: 0,
    trackId: track.id,
  });
  project.clips.push(host);
  const sha256 = createHash('sha256').update(source).digest('hex'),
    snapshotId = 'effect:' + sha256;
  project.effectSnapshots = [
    {
      id: snapshotId,
      sha256,
      source,
      assets: [],
      retainedByteLength: Buffer.byteLength(source),
      schemaVersion: 'sniptale.effect.v1',
      documentId: document.id,
      kind: 'standalone',
    },
  ];
  project.effectInstances = [
    {
      id: 'parent-gpu-title',
      kind: 'standalone',
      target: { kind: 'scene' },
      snapshotId,
      controls: Object.fromEntries(
        document.controls.map((control) => [
          control.id,
          resolveEffectV1ControlDefault(control, 'ru'),
        ])
      ),
      enabled: true,
      startTime: 0,
      duration: 12,
      playbackRate: document.duration / 12,
    },
  ];
  Object.assign(project, hydrateVideoProject(project));
  expect(isHydratableVideoProject(project)).toBe(true);
  await applyHarnessBootstrap(page, {
    preserveMediaLibrary: true,
    videoProjects: [project],
    storage: { 'sniptale-locale-preference': 'ru' },
  });
  await page.goto(origin + GALLERY_HARNESS_PATH);
  await page.locator('[data-ui="gallery.page.root"]').waitFor();
  await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
  await page.goto(
    origin + VIDEO_EDITOR_HARNESS_PATH + '?project=' + encodeURIComponent(project.id)
  );
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
}

enableGpuPreviewProof();
for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Native standalone annotation uses parent GPU scene and retains canvas editing ${viewport.name}`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ ...viewport.size });
    const completed = await observeEffectGpuPlans(page, { requireParentScene: true });
    const host = await startHostServer();
    try {
      await openAnnotationProject(page, host.origin);
      await page.getByRole('button', { name: VIDEO_EDITOR_PLAY_LABEL, exact: true }).click();
      await expect
        .poll(completed, {
          message: 'The standalone annotation must complete on the parent preview device.',
        })
        .toBeGreaterThan(0);
      await page.getByRole('button', { name: VIDEO_EDITOR_PAUSE_LABEL, exact: true }).click();
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.some((clip) => clip.type === 'EFFECT')
        )
        .toBe(true);
      const before = (await readNativeVideoProject(page))!;
      const annotation = before.clips.find((clip) => clip.type === 'EFFECT');
      expect(annotation).toBeTruthy();
      await page.locator(`[data-project-timeline-clip="${annotation!.id}"]`).click();
      const canvas = page.locator('[data-preview-stage-canvas]');
      const box = (await canvas.boundingBox())!;
      const scale = Math.min(box.width / before.width, box.height / before.height);
      const center = {
        x:
          box.x +
          (box.width - before.width * scale) / 2 +
          (annotation!.transform.x + annotation!.transform.width / 2) * scale,
        y:
          box.y +
          (box.height - before.height * scale) / 2 +
          (annotation!.transform.y + annotation!.transform.height / 2) * scale,
      };
      const completedBeforeDrag = completed();
      await page.mouse.move(center.x, center.y);
      await page.mouse.down();
      await page.mouse.move(center.x + 24, center.y + 12, { steps: 8 });
      await page.mouse.up();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))!.clips.find((clip) => clip.id === annotation!.id)!
              .transform.x
        )
        .not.toBe(annotation!.transform.x);
      const moved = (await readNativeVideoProject(page))!.clips.find(
        (clip) => clip.id === annotation!.id
      )!;
      expect(
        Math.abs((moved.transform.x - annotation!.transform.x) * scale - 24)
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs((moved.transform.y - annotation!.transform.y) * scale - 12)
      ).toBeLessThanOrEqual(1);
      await expect.poll(completed).toBeGreaterThan(completedBeforeDrag);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))!.clips.find((clip) => clip.id === annotation!.id)!
              .transform
        )
        .toEqual(annotation!.transform);
      const beforePlay = completed();
      await page.getByRole('button', { name: VIDEO_EDITOR_PLAY_LABEL, exact: true }).click();
      await expect.poll(completed).toBeGreaterThan(beforePlay);
      await page.getByRole('button', { name: VIDEO_EDITOR_PAUSE_LABEL, exact: true }).click();
      await page.screenshot({
        path: info.outputPath('native-parent-gpu-annotation.png'),
        fullPage: false,
      });
    } finally {
      await page.close();
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
