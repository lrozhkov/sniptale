import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { createVideoProjectFromMultiSourceRecording } from '../../../../apps/extension/src/features/video/project/factories/multi-source-recording';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewWebcamBundle } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

async function pixel(canvas: ReturnType<Page['locator']>, x: number, y: number) {
  return canvas.evaluate(
    (node: HTMLCanvasElement, point) => {
      const data = node
        .getContext('2d')!
        .getImageData(
          Math.floor(node.width * point.x),
          Math.floor(node.height * point.y),
          1,
          1
        ).data;
      return [...data];
    },
    { x, y }
  );
}

for (const { size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Gallery composes and edits split camera at ${size.width}×${size.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(size);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewWebcamBundle(page);
      await page.reload();
      await page.getByRole('button', { name: /: Screen$/ }).click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing') })
        .click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.trackSettings'), exact: true })
        .click();
      const enableCamera = dialog.getByRole('switch', {
        name: `${label('gallery.videoReview.trackEnabled')}: ${label('gallery.videoReview.webcam')}`,
      });
      await expect(enableCamera).toBeEnabled();
      await enableCamera.click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.webcamTrack"]')).toBeVisible();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.webcamSettings'), exact: true })
        .click();
      const inspector = dialog.locator('[data-ui="gallery.videoReview.webcamInspector"]');
      await expect(inspector).toBeVisible();
      const layout = inspector.getByRole('button', {
        name: label('gallery.videoReview.webcamSplit'),
        exact: true,
      });
      await layout.scrollIntoViewIfNeeded();
      await layout.click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.webcamSplit_left'), exact: true })
        .click();
      const composition = dialog.locator('[data-ui="gallery.videoReview.manualPreview"] canvas');
      await expect(composition).toBeVisible();
      await dialog
        .locator('video')
        .first()
        .evaluate((video) => {
          video.currentTime = 1;
        });
      await expect.poll(() => pixel(composition, 0.5, 0.5)).toEqual([16, 16, 20, 255]);
      await expect.poll(() => pixel(composition, 0.25, 0.5)).not.toEqual([16, 16, 20, 255]);
      await page.screenshot({ path: info.outputPath('gallery-split.png'), fullPage: false });
      await layout.click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.webcamSplit_docked'), exact: true })
        .click();
      await expect.poll(() => composition.count()).toBe(0);
      await page.screenshot({ path: info.outputPath('gallery-docked.png'), fullPage: false });
      await layout.click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.webcamSplit_left'), exact: true })
        .click();
      const addPosition = inspector.getByRole('button', {
        name: label('gallery.videoReview.webcamAddPosition'),
        exact: true,
      });
      await addPosition.click();
      await layout.click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.webcamSplit_docked'), exact: true })
        .click();
      await dialog
        .locator('video')
        .first()
        .evaluate(async (video) => {
          const settled = new Promise<void>((resolve) =>
            video.addEventListener('seeked', () => resolve(), { once: true })
          );
          video.currentTime = 3;
          await settled;
        });
      await addPosition.click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.webcamPosition"]')).toHaveCount(2);
      await expect(layout).toContainText(label('gallery.videoReview.webcamSplit_docked'));
      await page.screenshot({
        path: info.outputPath('gallery-added-docked-position.png'),
        fullPage: false,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  test(`full editor renders split and returns to saved dock at ${size.width}×${size.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(size);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const project = createVideoProjectFromMultiSourceRecording({
        name: 'Camera split',
        videos: [
          {
            recordingId: 'beta-v1-recording',
            filename: 'screen.webm',
            width: 160,
            height: 90,
            duration: 12,
            mimeType: 'video/webm',
            size: bytes.length,
          },
        ],
        webcamVideo: {
          recordingId: 'webcam-clock',
          filename: 'camera.webm',
          width: 160,
          height: 90,
          duration: 12,
          mimeType: 'video/webm',
          size: bytes.length,
        },
      });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewWebcamBundle(page, 'review-vp8-opus.webm');
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}`);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const camera = project.clips.find(
        (clip) =>
          clip.type === 'VIDEO' &&
          project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
      );
      if (!camera || camera.type !== 'VIDEO') throw new Error('Missing camera fixture');
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      await page
        .locator(`[data-project-timeline-clip="${camera.id}"]`)
        .click({ modifiers: ['Control'] });
      await page
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupCamera'),
          exact: true,
        })
        .click();
      const split = page.locator('[data-ui="video-editor.camera-layout-split_left"]');
      await split.scrollIntoViewIfNeeded();
      await page.locator('[data-ui="video-editor.camera-layout-hidden"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === camera.id)
              ?.transform.opacity
        )
        .toBe(0);
      await split.click();
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === camera.id)
        )
        .toMatchObject({ cameraSplit: 'left', transform: camera.transform });
      const stage = page.locator('[data-preview-stage-canvas]');
      await expect.poll(() => pixel(stage, 0.5, 0.5)).toEqual([16, 16, 20, 255]);
      await page.screenshot({ path: info.outputPath('native-split.png'), fullPage: false });
      await page.locator('[data-ui="video-editor.camera-layout-overlay"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === camera.id)
              ?.transform
        )
        .toEqual(camera.transform);
      await page.screenshot({ path: info.outputPath('native-docked.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
