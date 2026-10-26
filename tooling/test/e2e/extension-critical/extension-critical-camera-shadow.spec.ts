import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { translate, type AppLocale } from '../../../../apps/extension/src/platform/i18n';
import { createVideoProjectFromMultiSourceRecording } from '../../../../apps/extension/src/features/video/project/factories/multi-source-recording';
import { resolveCameraVisualClip } from '../../../../apps/extension/src/features/video/project/camera/animation';
import { isValidVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
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

/** Reset the actual Gallery or Native inspector scroll owner before each capture. */
async function inspectorTop(page: Page) {
  const owners = page.locator(
    '.review-inspector-scroll:visible, [data-ui="video-editor.inspector.body"]:visible'
  );
  await expect.poll(() => owners.count()).toBeGreaterThan(0);
  await owners.evaluateAll((nodes) => {
    for (const node of nodes) node.scrollTop = 0;
  });
  await expect
    .poll(() => owners.evaluateAll((nodes) => nodes.every((node) => node.scrollTop === 0)))
    .toBe(true);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function captureGalleryAll(page: Page, screenshot: string) {
  const dialog = page.locator('dialog');
  const scroll = dialog.locator('.review-inspector-scroll');
  const handle = dialog.locator('[data-ui="gallery.videoReview.resizeInspector"]');
  const width = () =>
    scroll.evaluate((node) => {
      const style = getComputedStyle(node);
      return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    });
  const original = await width();
  const resize = async (target: number) => {
    const current = await width();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + current - target, box.y + 12);
    await page.mouse.up();
    await expect.poll(width).toBe(target);
  };
  try {
    await resize(600);
    const sections = dialog.locator(
      '[data-ui="gallery.videoReview.webcamInspector"] [data-ui="gallery.videoReview.inspectorSections"]'
    );
    await expect(sections).toHaveAttribute('data-presentation', 'all');
    const columns = sections.locator(':scope > .review-inspector-section-column');
    await expect(columns).toHaveCount(2);
    const first = (await columns.first().boundingBox())!;
    const second = (await columns.last().boundingBox())!;
    expect(second.x - first.x).toBeGreaterThan(200);
    const placement = (await sections.locator('[data-section="webcam-layout"]').boundingBox())!;
    const appearance = (await sections
      .locator('[data-section="webcam-appearance"]')
      .boundingBox())!;
    expect(
      appearance.x - placement.x,
      'camera appearance must use the second column'
    ).toBeGreaterThan(200);
    expect(Math.abs(appearance.y - placement.y)).toBeLessThanOrEqual(0.5);
    await inspectorTop(page);
    await page.screenshot({ path: screenshot, fullPage: false });
  } finally {
    await resize(original);
  }
}

type Message = Parameters<typeof translate>[0];
type Direction = 'classic' | 'angle' | 'center' | 'nearest-edge';

async function savedCamera(page: Page) {
  const workspace = await readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
  const operation = workspace?.history
    .slice(0, workspace.cursor)
    .findLast((item) => item.target === 'advancedContent');
  return operation?.target === 'advancedContent'
    ? operation.after.webcam
    : workspace?.baseline?.advancedContent.webcam;
}

async function chooseDirection(surface: Locator, locale: AppLocale, mode: Direction) {
  const group = surface.getByRole('group', {
    name: translate('gallery.videoReview.webcamShadowDirection', locale),
    exact: true,
  });
  const choice = group.getByRole('button', {
    name: translate(`gallery.videoReview.webcamShadowDirection_${mode}`, locale),
    exact: true,
  });
  await choice.scrollIntoViewIfNeeded();
  await choice.click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await expect(surface.page().getByRole('option')).toHaveCount(0);
}

async function setNumber(surface: Locator, locale: AppLocale, key: Message, value: number) {
  const input = surface.getByRole('textbox', { name: translate(key, locale), exact: true });
  await input.scrollIntoViewIfNeeded();
  await input.fill(String(value));
  await input.press('Enter');
}

/** Measure only shadow outside a 400x240 camera rotated 90 degrees on the white scene. */
async function shadowCentroid(canvas: Locator, centerX: number) {
  return canvas.evaluate((node: HTMLCanvasElement, cx) => {
    const sx = Math.min(node.width / 1280, node.height / 720),
      sy = sx;
    const ox = (node.width - 1280 * sx) / 2,
      oy = (node.height - 720 * sy) / 2;
    const context = node.getContext('2d');
    if (!context) throw new Error('Camera preview canvas is unavailable');
    const image = context.getImageData(0, 0, node.width, node.height);
    const left = cx - 120,
      right = cx + 120,
      top = 160,
      bottom = 560;
    let mass = 0,
      xMass = 0,
      yMass = 0;
    for (let y = Math.ceil(oy + (top - 65) * sy); y < oy + (bottom + 65) * sy; y++) {
      for (let x = Math.ceil(ox + (left - 65) * sx); x < ox + (right + 65) * sx; x++) {
        const px = (x + 0.5 - ox) / sx,
          py = (y + 0.5 - oy) / sy;
        if (px >= left - 2 && px <= right + 2 && py >= top - 2 && py <= bottom + 2) continue;
        const i = (y * node.width + x) * 4;
        const darkness = 255 - (image.data[i]! + image.data[i + 1]! + image.data[i + 2]!) / 3;
        if (darkness < 2 || image.data[i + 3]! < 250) continue;
        mass += darkness;
        xMass += (px - cx) * darkness;
        yMass += (py - 360) * darkness;
      }
    }
    return {
      mass,
      x: mass ? xMass / mass : 0,
      y: mass ? yMass / mass : 0,
      width: node.width,
      height: node.height,
      pixelQuantum: 1 / sx,
    };
  }, centerX);
}

/** Read the actual ruler projection instead of assuming a timeline zoom or scroll offset. */
async function seekNative(page: Page, seconds: number) {
  const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
  if (seconds === 0) {
    await playhead.press('Home');
    await expect(playhead).toHaveAttribute('aria-valuenow', '0');
    return;
  }
  const ruler = page.locator('[data-ui="video-editor.timeline.ruler"]');
  const point = await ruler.evaluate((node, time) => {
    const markers = [...node.querySelectorAll('div > span')]
      .flatMap((span) => {
        const text = span.textContent?.trim() ?? '';
        const parts = text.split(':');
        if (
          parts.length !== 2 ||
          parts.some((part) => !part.trim() || !Number.isFinite(Number(part)))
        )
          return [];
        const second = parts.map(Number).reduce((value, part) => value * 60 + part, 0);
        return [{ second, x: span.parentElement!.getBoundingClientRect().left }];
      })
      .sort((a, b) => a.second - b.second);
    const a = markers[0],
      b = markers.find((item) => a && item.second > a.second);
    if (!a || !b) throw new Error('Native ruler needs two major time markers');
    return {
      x: a.x + ((time - a.second) * (b.x - a.x)) / (b.second - a.second),
      y: node.getBoundingClientRect().top + 10,
    };
  }, seconds);
  await page.mouse.click(point.x, point.y);
}

for (const { size } of PRIMARY_BROWSER_VIEWPORTS) {
  const locale: AppLocale = size.width === 1280 ? 'en' : 'ru';
  test(`Gallery shadow history and transfer ${size.width}x${size.height} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize(size);
    const host = await startHostServer();
    const label = (key: Message) => translate(key, locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': locale },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewWebcamBundle(page, 'review-vp8-opus.webm');
      await page.reload();
      await page.getByRole('button', { name: /: Screen$/ }).click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.webcamTrack"]')).toBeVisible();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.webcamSettings'), exact: true })
        .click();
      const inspector = dialog.locator('[data-ui="gallery.videoReview.webcamInspector"]');
      const showAll = dialog.getByRole('button', {
        name: label('scenario.editor.inspectorShowAll'),
        exact: true,
      });
      if (await showAll.isVisible()) await showAll.click();
      await setNumber(inspector, locale, 'gallery.videoReview.webcamShadow', 100);
      await chooseDirection(inspector, locale, 'angle');
      await setNumber(inspector, locale, 'gallery.videoReview.webcamShadowAngle', 225);
      await expect
        .poll(() => savedCamera(page))
        .toMatchObject({ shadowDirection: { mode: 'angle', angle: 225 } });
      await chooseDirection(inspector, locale, 'center');
      await expect
        .poll(() => savedCamera(page))
        .toMatchObject({ shadowDirection: { mode: 'center', angle: 225 } });
      await chooseDirection(inspector, locale, 'nearest-edge');
      await expect
        .poll(() => savedCamera(page))
        .toMatchObject({ shadowDirection: { mode: 'nearest-edge', angle: 225 } });
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
        .click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.webcamSettings'), exact: true })
        .click();
      await expect
        .poll(() => savedCamera(page))
        .toMatchObject({ shadowDirection: { mode: 'center', angle: 225 } });
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.redo'), exact: true })
        .click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.webcamSettings'), exact: true })
        .click();
      await expect
        .poll(() => savedCamera(page))
        .toMatchObject({ shadowDirection: { mode: 'nearest-edge', angle: 225 } });
      await chooseDirection(inspector, locale, 'classic');
      await chooseDirection(inspector, locale, 'angle');
      await expect(
        inspector.getByRole('textbox', {
          name: label('gallery.videoReview.webcamShadowAngle'),
          exact: true,
        })
      ).toHaveValue('225');
      await expect
        .poll(() => savedCamera(page))
        .toMatchObject({ shadowDirection: { mode: 'angle', angle: 225 } });
      await dialog
        .locator('video')
        .first()
        .evaluate((video) => {
          video.currentTime = 1;
        });
      await expect
        .poll(() =>
          dialog
            .locator('video')
            .first()
            .evaluate(
              (video) =>
                video.readyState >= 2 && !video.seeking && Math.abs(video.currentTime - 1) < 0.02
            )
        )
        .toBe(true);
      const cameraCanvas = dialog.locator('[data-ui="gallery.videoReview.webcamOverlay"] canvas');
      await expect
        .poll(() =>
          cameraCanvas.evaluate((node: HTMLCanvasElement) => {
            const pixels = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
            let painted = 0;
            for (let i = 0; i < pixels.length; i += 4)
              if (pixels[i + 3]! > 0 && Math.max(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!) > 30)
                painted++;
            return painted;
          })
        )
        .toBeGreaterThan(100);
      if (size.width === 1280) {
        await page.setViewportSize({ width: 1100, height: size.height });
        await inspector
          .getByRole('textbox', {
            name: label('gallery.videoReview.webcamShadowAngle'),
            exact: true,
          })
          .scrollIntoViewIfNeeded();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await inspectorTop(page);
        await page.screenshot({
          path: info.outputPath('gallery-narrow-shadow.png'),
          fullPage: false,
        });
        await page.setViewportSize(size);
      } else {
        await captureGalleryAll(page, info.outputPath('gallery-camera-all-wide-top.png'));
        await dialog
          .getByRole('button', {
            name: label('scenario.editor.inspectorShowSections'),
            exact: true,
          })
          .click();
        await inspector
          .getByRole('button', { name: label('gallery.videoReview.webcamAppearance'), exact: true })
          .click();
        const columns = inspector.locator(
          '[data-section="webcam-appearance"] .review-inspector-columns'
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
          await inspector
            .getByRole('textbox', {
              name: label('gallery.videoReview.webcamShadowAngle'),
              exact: true,
            })
            .scrollIntoViewIfNeeded();
          if (width !== originalWidth) {
            await inspectorTop(page);
            await page.screenshot({
              path: info.outputPath(`gallery-shadow-breakpoint-${width}.png`),
              fullPage: false,
            });
          }
        }
      }
      await inspectorTop(page);
      await page.screenshot({ path: info.outputPath('gallery-shadow-angle.png'), fullPage: false });
      await page.reload();
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.webcamSettings'), exact: true })
        .click();
      await expect(
        inspector.getByRole('textbox', {
          name: label('gallery.videoReview.webcamShadowAngle'),
          exact: true,
        })
      ).toHaveValue('225');
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
      await expect
        .poll(async () => {
          const project = await readNativeVideoProject(page);
          const track = project?.tracks.find((entry) => entry.role === 'CAMERA');
          return project?.clips.find((entry) => entry.trackId === track?.id);
        })
        .toMatchObject({
          cameraShadowDirection: { mode: 'angle', angle: 225 },
          shadowIntensity: 100,
        });
      expect((await readNativeVideoProject(page))!.version).toBeGreaterThanOrEqual(47);
      await seekNative(page, 1);
      await expect
        .poll(() =>
          page.locator('[data-preview-stage-canvas]').evaluate((node: HTMLCanvasElement) => {
            const pixels = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
            let painted = 0;
            for (let i = 0; i < pixels.length; i += 4)
              if (Math.max(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!) > 30) painted++;
            return painted;
          })
        )
        .toBeGreaterThan(100);
      await inspectorTop(page);
      await page.screenshot({
        path: info.outputPath('transferred-camera-shadow.png'),
        fullPage: false,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  test(`Native shadow rotation and motion ${size.width}x${size.height} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize(size);
    const host = await startHostServer();
    const label = (key: Message) => translate(key, locale);
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const metadata = {
        width: 160,
        height: 90,
        duration: 12,
        mimeType: 'video/webm',
        size: bytes.length,
      };
      const project = createVideoProjectFromMultiSourceRecording({
        name: 'Directional camera shadow',
        videos: [{ ...metadata, recordingId: 'beta-v1-recording', filename: 'screen.webm' }],
        webcamVideo: { ...metadata, recordingId: 'webcam-clock', filename: 'camera.webm' },
      });
      project.width = 1280;
      project.height = 720;
      project.fps = 40;
      project.backgroundColor = '#ffffff';
      project.sceneBackground = { kind: 'solid', color: '#ffffff' };
      const camera = project.clips.find(
        (clip) =>
          clip.type === 'VIDEO' &&
          project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
      );
      if (!camera || camera.type !== 'VIDEO') throw new Error('Missing camera fixture');
      for (const clip of project.clips) if (clip !== camera) clip.transform.opacity = 0;
      camera.transform = { x: 120, y: 240, width: 400, height: 240, rotation: 90, opacity: 1 };
      camera.fitMode = 'COVER';
      camera.cameraAppearance = { shape: 'rounded', roundness: 0, zoom: 1, panX: 0, panY: 0 };
      camera.shadowIntensity = 100;
      camera.shadowColor = '#000000';
      camera.shadowMode = 'BACKDROP';
      camera.cameraPositions = [
        {
          id: 'moving-camera',
          sourceTime: 2,
          fitMode: 'COVER',
          transform: { ...camera.transform, x: 760 },
          transition: { kind: 'smooth', duration: 1 },
        },
      ];
      project.version = 47;
      expect(isValidVideoProject(project)).toBe(true);
      const centerAt = (time: number) => {
        const transform = resolveCameraVisualClip(project, camera, time).transform;
        return transform.x + transform.width / 2;
      };
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
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      await page
        .locator(`[data-project-timeline-clip="${camera.id}"]`)
        .click({ modifiers: ['Control'] });
      await page
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupStyle'),
          exact: true,
        })
        .click();
      await page.addInitScript(() => {
        const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
        if (typeof bootstrap === 'object' && bootstrap !== null)
          Reflect.deleteProperty(bootstrap, 'videoProjects');
      });
      const surface = page.locator('[data-ui="video-editor.camera-appearance"]');
      const stage = page.locator('[data-preview-stage-canvas]');
      await chooseDirection(surface, locale, 'angle');
      await setNumber(surface, locale, 'gallery.videoReview.webcamShadowAngle', 0);
      await expect
        .poll(async () => (await shadowCentroid(stage, centerAt(0))).mass)
        .toBeGreaterThan(100);
      await expect
        .poll(async () => (await shadowCentroid(stage, centerAt(0))).x)
        .toBeGreaterThan(3);
      const right = await shadowCentroid(stage, centerAt(0));
      await inspectorTop(page);
      await page.screenshot({
        path: info.outputPath('native-rotated-shadow-right.png'),
        fullPage: false,
      });
      if (size.width === 1280) {
        await page.setViewportSize({ width: 1100, height: size.height });
        await surface
          .getByRole('textbox', {
            name: label('gallery.videoReview.webcamShadowAngle'),
            exact: true,
          })
          .scrollIntoViewIfNeeded();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await inspectorTop(page);
        await page.screenshot({
          path: info.outputPath('native-narrow-shadow.png'),
          fullPage: false,
        });
        await page.setViewportSize(size);
      }
      await setNumber(surface, locale, 'gallery.videoReview.webcamShadowAngle', 180);
      await expect.poll(async () => (await shadowCentroid(stage, centerAt(0))).x).toBeLessThan(-3);
      const left = await shadowCentroid(stage, centerAt(0));
      expect(right.x - left.x).toBeGreaterThan(6);
      // One preview pixel can exceed two scene pixels at the short viewport.
      expect(Math.abs(right.y - left.y)).toBeLessThan(Math.max(2, right.pixelQuantum));
      await info.attach('rotated-shadow-centroids', {
        body: JSON.stringify({ right, left }),
        contentType: 'application/json',
      });
      await chooseDirection(surface, locale, 'center');
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === camera.id)
        )
        .toMatchObject({ cameraShadowDirection: { mode: 'center', angle: 180 } });
      await page
        .getByRole('button', {
          name: `${label('videoEditor.app.undo')} (${label('videoEditor.app.undoShortcut')})`,
          exact: true,
        })
        .click();
      await expect(
        surface.getByRole('textbox', {
          name: label('gallery.videoReview.webcamShadowAngle'),
          exact: true,
        })
      ).toHaveValue('180');
      await page
        .getByRole('button', {
          name: `${label('videoEditor.app.redo')} (${label('videoEditor.app.redoShortcut')})`,
          exact: true,
        })
        .click();
      await expect
        .poll(async () => (await shadowCentroid(stage, centerAt(0))).x)
        .toBeGreaterThan(3);
      await seekNative(page, 2.25);
      await expect
        .poll(async () => (await shadowCentroid(stage, centerAt(2.25))).x)
        .toBeGreaterThan(3);
      await inspectorTop(page);
      await page.screenshot({
        path: info.outputPath('native-moving-shadow-center-left.png'),
        fullPage: false,
      });
      await seekNative(page, 2.75);
      await expect
        .poll(async () => (await shadowCentroid(stage, centerAt(2.75))).x)
        .toBeLessThan(-3);
      await inspectorTop(page);
      await page.screenshot({
        path: info.outputPath('native-moving-shadow-center-right.png'),
        fullPage: false,
      });
      await seekNative(page, 0);
      await chooseDirection(surface, locale, 'nearest-edge');
      await expect.poll(async () => (await shadowCentroid(stage, centerAt(0))).x).toBeLessThan(-3);
      await chooseDirection(surface, locale, 'classic');
      await expect.poll(async () => (await shadowCentroid(stage, centerAt(0))).x).toBeLessThan(-3);
      await chooseDirection(surface, locale, 'angle');
      await expect(
        surface.getByRole('textbox', {
          name: label('gallery.videoReview.webcamShadowAngle'),
          exact: true,
        })
      ).toHaveValue('180');
      await setNumber(surface, locale, 'gallery.videoReview.webcamShadowAngle', 0);
      await expect
        .poll(async () => (await shadowCentroid(stage, centerAt(0))).x)
        .toBeGreaterThan(3);
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === camera.id)
        )
        .toMatchObject({ cameraShadowDirection: { mode: 'angle', angle: 0 } });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === camera.id)
        )
        .toMatchObject({
          cameraShadowDirection: { mode: 'angle', angle: 0 },
          transform: camera.transform,
        });
      await seekNative(page, 0);
      await info.attach('reopened-shadow-centroid', {
        body: JSON.stringify(await shadowCentroid(stage, centerAt(0))),
        contentType: 'application/json',
      });
      await inspectorTop(page);
      await page.screenshot({
        path: info.outputPath('native-reopened-shadow.png'),
        fullPage: false,
      });
      await expect
        .poll(async () => (await shadowCentroid(stage, centerAt(0))).x)
        .toBeGreaterThan(3);
      if (size.width === 1280) {
        const final = (await readNativeVideoProject(page))!;
        const samples = await stage.evaluate((node: HTMLCanvasElement) => {
          const context = node.getContext('2d')!;
          const scale = Math.min(node.width / 1280, node.height / 720);
          const ox = (node.width - 1280 * scale) / 2,
            oy = (node.height - 720 * scale) / 2;
          return [190, 450].map((x) => ({
            time: 0,
            x,
            y: 360,
            expected: [
              ...context.getImageData(
                Math.round(ox + x * scale),
                Math.round(oy + 360 * scale),
                1,
                1
              ).data,
            ].slice(0, 3),
          }));
        });
        const exported = await encodedNativeVideoSamples(
          page,
          host.origin,
          final,
          'WEBM',
          samples,
          { start: 0, end: 0.5 }
        );
        await info.attach('encoded-shadow-pixels', {
          body: JSON.stringify(exported.samples),
          contentType: 'application/json',
        });
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
