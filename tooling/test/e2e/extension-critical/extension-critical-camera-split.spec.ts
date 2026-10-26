import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { createVideoProjectFromMultiSourceRecording } from '../../../../apps/extension/src/features/video/project/factories/multi-source-recording';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewWebcamBundle } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
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

async function readSavedCamera(page: Page) {
  const workspace = await readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
  const operation = workspace?.history
    .slice(0, workspace.cursor)
    .findLast((item) => item.target === 'advancedContent');
  return operation?.target === 'advancedContent' ? operation.after.webcam : undefined;
}

for (const { size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Gallery composes and edits split camera at ${size.width}×${size.height}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15_000);
    await page.setViewportSize(size);
    const host = await startHostServer();
    const locale = size.width === 1280 ? 'en' : 'ru';
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': locale },
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
      const behavior = inspector.getByRole('button', {
        name: label('gallery.videoReview.webcamScreenBehavior'),
        exact: true,
      });
      await expect(behavior).toContainText(
        label('gallery.videoReview.webcamScreenBehavior_shrink')
      );
      await expect.poll(() => pixel(composition, 0.75, 0.1)).toEqual([16, 16, 20, 255]);
      await expect.poll(() => readSavedCamera(page)).toMatchObject({ screenBehavior: 'shrink' });
      const cameraColor = await pixel(composition, 0.25, 0.5);
      await page.screenshot({ path: info.outputPath('gallery-split.png'), fullPage: false });
      await behavior.click();
      await page
        .getByRole('option', {
          name: label('gallery.videoReview.webcamScreenBehavior_shift'),
          exact: true,
        })
        .click();
      await expect.poll(() => pixel(composition, 0.75, 0.1)).not.toEqual([16, 16, 20, 255]);
      await expect.poll(() => pixel(composition, 0.25, 0.5)).toEqual(cameraColor);
      await page.screenshot({ path: info.outputPath('gallery-shift.png'), fullPage: false });
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
        .click();
      await dialog
        .getByRole('button', {
          name: label('gallery.videoReview.webcamSettings'),
          exact: true,
        })
        .click();
      await expect(behavior).toContainText(
        label('gallery.videoReview.webcamScreenBehavior_shrink')
      );
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.redo'), exact: true })
        .click();
      await dialog
        .getByRole('button', {
          name: label('gallery.videoReview.webcamSettings'),
          exact: true,
        })
        .click();
      await expect(behavior).toContainText(label('gallery.videoReview.webcamScreenBehavior_shift'));
      await behavior.click();
      await page
        .getByRole('option', {
          name: label('gallery.videoReview.webcamScreenBehavior_overlay'),
          exact: true,
        })
        .click();
      await expect.poll(() => pixel(composition, 0.5, 0.5)).not.toEqual([16, 16, 20, 255]);
      await expect.poll(() => pixel(composition, 0.25, 0.5)).toEqual(cameraColor);
      await page.screenshot({ path: info.outputPath('gallery-overlay.png'), fullPage: false });
      await behavior.click();
      await page
        .getByRole('option', {
          name: label('gallery.videoReview.webcamScreenBehavior_shrink'),
          exact: true,
        })
        .click();
      const crop = inspector.getByRole('button', {
        name: label('videoEditor.sidebar.cameraCropPreview'),
        exact: true,
      });
      await crop.scrollIntoViewIfNeeded();
      await expect(crop).toBeEnabled();
      const cropBox = await crop.boundingBox();
      const scene = await composition.evaluate((node: HTMLCanvasElement) => ({
        width: node.width,
        height: node.height,
      }));
      expect(cropBox).not.toBeNull();
      expect(
        Math.abs(cropBox!.width / cropBox!.height - (0.49 * scene.width) / scene.height)
      ).toBeLessThan(0.01);
      const zoom = inspector.getByRole('textbox', {
        name: label('videoEditor.sidebar.cameraCropZoom'),
        exact: true,
      });
      await zoom.fill('2');
      await zoom.press('Enter');
      await crop.focus();
      await crop.press('ArrowLeft');
      if (size.width === 1920) {
        await dialog
          .getByRole('button', {
            name: label('scenario.editor.inspectorShowSections'),
            exact: true,
          })
          .click();
        await inspector
          .getByRole('button', {
            name: label('gallery.videoReview.webcamLayout'),
            exact: true,
          })
          .click();
        const columns = inspector.locator(
          '[data-section="webcam-layout"] .review-inspector-columns'
        );
        const originalWidth = Math.round((await columns.boundingBox())!.width);
        const handle = dialog.getByRole('separator', {
          name: label('videoEditor.sidebar.resizeInspector'),
          exact: true,
        });
        for (const width of [523, 524, 525, originalWidth]) {
          const currentWidth = (await columns.boundingBox())!.width;
          const box = (await handle.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + 10);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + currentWidth - width, box.y + 10);
          await page.mouse.up();
          await expect
            .poll(async () => Math.round((await columns.boundingBox())!.width))
            .toBe(width);
          await expect
            .poll(() =>
              columns.evaluate(
                (node) => getComputedStyle(node).gridTemplateColumns.split(' ').length
              )
            )
            .toBe(width < 524 ? 1 : 2);
          await expect(behavior).toBeVisible();
          await expect(crop).toBeVisible();
        }
      }
      await page.screenshot({ path: info.outputPath('gallery-split-crop.png'), fullPage: false });
      if (size.width === 1280) {
        await page.setViewportSize({ width: 1100, height: size.height });
        await expect(crop).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.screenshot({
          path: info.outputPath('gallery-narrow-crop.png'),
          fullPage: false,
        });
        await page.setViewportSize(size);
      }
      await expect
        .poll(() => readSavedCamera(page))
        .toMatchObject({ screenBehavior: 'shrink', appearance: { zoom: 2, panX: 0.1 } });
      await page.reload();
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole('button', {
          name: label('gallery.videoReview.webcamSettings'),
          exact: true,
        })
        .click();
      await expect(behavior).toContainText(
        label('gallery.videoReview.webcamScreenBehavior_shrink')
      );
      await expect(zoom).toHaveValue('2');
      await dialog
        .locator('video')
        .first()
        .evaluate((video) => {
          video.currentTime = 1;
        });
      await layout.click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.webcamSplit_docked'), exact: true })
        .click();
      await expect.poll(() => composition.count()).toBe(0);
      await page.screenshot({ path: info.outputPath('gallery-docked.png'), fullPage: false });
      if (size.width === 1280) {
        await dialog
          .getByRole('button', {
            name: label('scenario.editor.inspectorShowSections'),
            exact: true,
          })
          .click();
        await inspector
          .getByRole('button', {
            name: label('gallery.videoReview.webcamAppearance'),
            exact: true,
          })
          .click();
        const shape = inspector.getByRole('button', {
          name: label('videoEditor.sidebar.cameraShape'),
          exact: true,
        });
        await shape.click();
        await page
          .getByRole('option', {
            name: label('gallery.videoReview.webcamCircle'),
            exact: true,
          })
          .click();
        await inspector
          .getByRole('button', {
            name: label('gallery.videoReview.webcamLayout'),
            exact: true,
          })
          .click();
        await zoom.fill('1');
        await zoom.press('Enter');
        const pan = inspector.getByRole('textbox', {
          name: label('gallery.videoReview.webcamCropX'),
          exact: true,
        });
        await pan.fill('0');
        await pan.press('Enter');
        await crop.scrollIntoViewIfNeeded();
        await expect(crop).toBeEnabled();
        const aperture = (await crop.boundingBox())!;
        expect(aperture.width / aperture.height).toBeCloseTo(1, 2);
        await page.mouse.move(aperture.x + aperture.width / 2, aperture.y + aperture.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          aperture.x + aperture.width / 2 + 20,
          aperture.y + aperture.height / 2
        );
        await page.mouse.up();
        await expect.poll(async () => Math.abs(Number(await pan.inputValue()))).toBeGreaterThan(1);
        await page.screenshot({
          path: info.outputPath('gallery-circle-crop.png'),
          fullPage: false,
        });
        await zoom.fill('2');
        await zoom.press('Enter');
        await pan.fill('10');
        await pan.press('Enter');
        await inspector
          .getByRole('button', {
            name: label('gallery.videoReview.webcamAppearance'),
            exact: true,
          })
          .click();
        await shape.click();
        await page
          .getByRole('option', {
            name: label('videoEditor.sidebar.cameraShapeRounded'),
            exact: true,
          })
          .click();
        await inspector
          .getByRole('button', {
            name: label('gallery.videoReview.webcamLayout'),
            exact: true,
          })
          .click();
        await dialog
          .getByRole('button', {
            name: label('scenario.editor.inspectorShowAll'),
            exact: true,
          })
          .click();
      }
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
      await layout.click();
      await page
        .getByRole('option', {
          name: label('gallery.videoReview.webcamSplit_left'),
          exact: true,
        })
        .click();
      await expect
        .poll(async () => {
          const box = await crop.boundingBox();
          return box ? box.width / box.height : 0;
        })
        .toBeCloseTo((0.49 * scene.width) / scene.height, 2);
      await layout.click();
      await page
        .getByRole('option', {
          name: label('gallery.videoReview.webcamSplit_docked'),
          exact: true,
        })
        .click();
      await page.screenshot({
        path: info.outputPath('gallery-added-docked-position.png'),
        fullPage: false,
      });
      await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
      await dialog.locator('[data-ui="gallery.videoReview.openVideoEditor"]').click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
        )
        .toBe(1);
      const [tab] = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
      const target = new URL(tab!.url!);
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}${target.search}`);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect.poll(async () => (await readNativeVideoProject(page))?.id).toBeTruthy();
      const transferred = (await readNativeVideoProject(page))!;
      const cameraTrack = transferred.tracks.find((track) => track.role === 'CAMERA');
      const transferredCamera = transferred.clips.find((clip) => clip.trackId === cameraTrack?.id);
      expect(transferredCamera).toMatchObject({
        cameraSplit: 'left',
        cameraScreenBehavior: 'shrink',
        cameraAppearance: { zoom: 2, panX: 0.1 },
      });
      expect(transferred.version).toBeGreaterThanOrEqual(46);
      await page.screenshot({ path: info.outputPath('transferred-camera.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  test(`full editor renders split and returns to saved dock at ${size.width}×${size.height}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize(size);
    const host = await startHostServer();
    const locale = size.width === 1280 ? 'en' : 'ru';
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
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
        storage: { 'sniptale-locale-preference': locale },
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
      const behavior = page.getByRole('button', {
        name: label('gallery.videoReview.webcamScreenBehavior'),
        exact: true,
      });
      await expect(behavior).toContainText(
        label('gallery.videoReview.webcamScreenBehavior_shrink')
      );
      await behavior.click();
      await page
        .getByRole('option', {
          name: label('gallery.videoReview.webcamScreenBehavior_shift'),
          exact: true,
        })
        .click();
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === camera.id)
        )
        .toMatchObject({ cameraScreenBehavior: 'shift' });
      await page.screenshot({ path: info.outputPath('native-shift.png'), fullPage: false });
      await page
        .getByRole('button', {
          name: `${label('videoEditor.app.undo')} (${label('videoEditor.app.undoShortcut')})`,
          exact: true,
        })
        .click();
      await expect(behavior).toContainText(
        label('gallery.videoReview.webcamScreenBehavior_shrink')
      );
      await page
        .getByRole('button', {
          name: `${label('videoEditor.app.redo')} (${label('videoEditor.app.redoShortcut')})`,
          exact: true,
        })
        .click();
      await expect(behavior).toContainText(label('gallery.videoReview.webcamScreenBehavior_shift'));
      await behavior.click();
      await page
        .getByRole('option', {
          name: label('gallery.videoReview.webcamScreenBehavior_overlay'),
          exact: true,
        })
        .click();
      await expect.poll(() => pixel(stage, 0.5, 0.5)).not.toEqual([16, 16, 20, 255]);
      await page.screenshot({ path: info.outputPath('native-overlay.png'), fullPage: false });
      await page.locator('[data-ui="video-editor.camera-layout-overlay"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === camera.id)
              ?.transform
        )
        .toEqual(camera.transform);
      await page.screenshot({ path: info.outputPath('native-docked.png'), fullPage: false });
      await split.click();
      await behavior.click();
      await page
        .getByRole('option', {
          name: label('gallery.videoReview.webcamScreenBehavior_shrink'),
          exact: true,
        })
        .click();
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === camera.id)
        )
        .toMatchObject({ cameraScreenBehavior: 'shrink' });
      await page
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupStyle'),
          exact: true,
        })
        .click();
      const cropSection = page.locator('summary').filter({
        hasText: label('videoEditor.sidebar.cameraCropSection'),
      });
      await cropSection.scrollIntoViewIfNeeded();
      if ((await cropSection.locator('..').getAttribute('open')) === null)
        await cropSection.click();
      const crop = page.getByRole('button', {
        name: label('videoEditor.sidebar.cameraCropPreview'),
        exact: true,
      });
      await crop.scrollIntoViewIfNeeded();
      await expect(crop).toBeEnabled();
      const cropBox = await crop.boundingBox();
      expect(
        Math.abs(cropBox!.width / cropBox!.height - (0.49 * project.width) / project.height)
      ).toBeLessThan(0.01);
      const zoom = page.getByRole('textbox', {
        name: label('videoEditor.sidebar.cameraCropZoom'),
        exact: true,
      });
      await zoom.fill('150');
      await zoom.press('Enter');
      await crop.focus();
      await crop.press('ArrowLeft');
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === camera.id)
        )
        .toMatchObject({ cameraAppearance: { zoom: 1.5, panX: 0.1 } });
      await page.screenshot({ path: info.outputPath('native-split-crop.png'), fullPage: false });
      if (size.width === 1280) {
        const final = (await readNativeVideoProject(page))!;
        const exported = await encodedNativeVideoSamples(
          page,
          host.origin,
          final,
          'WEBM',
          [
            {
              time: 0,
              x: Math.round(final.width * 0.75),
              y: Math.round(final.height * 0.1),
              expected: [16, 16, 20],
            },
            {
              time: 0,
              x: Math.round(final.width * 0.5),
              y: Math.round(final.height * 0.5),
              expected: [16, 16, 20],
            },
          ],
          { start: 0, end: 0.5 }
        );
        expect(exported.size).toBeGreaterThan(0);
        for (const sample of exported.samples) expect(sample.error).toBeLessThanOrEqual(10);
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
