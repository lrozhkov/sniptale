import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { VideoTrackKind } from '../../../../apps/extension/src/features/video/project/types';
import { test, expect } from '../support/extension-fixture';
import { applyHarnessBootstrap, VIDEO_EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

test('long timeline scroll stays uniform and synchronized at HD', async ({ page, hostOrigin }) => {
  const project = createEmptyVideoProject('Scroll proof');
  project.duration = 30;
  for (let index = 0; index < 18; index += 1) {
    project.tracks.push(
      createVideoProjectTrack(
        `Track ${index}`,
        index + 2,
        index % 2 ? VideoTrackKind.AUDIO : VideoTrackKind.PRIMARY
      )
    );
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await applyHarnessBootstrap(page, {
    apiBehavior: { runtimeFallback: 'typed-success' },
    videoProjects: [project],
    storage: {
      [`sniptale_video_editor_track_panel_prefs:${project.id}`]: {
        collapsedCursorLaneVisible: true,
        collapsedTelemetryLaneVisible: true,
        compactRows: false,
        hideTrackNames: false,
        trackHeightByTrackId: Object.fromEntries(
          project.tracks.map((track, index) => [
            track.id,
            index % 3 === 0 ? 2 : index % 3 === 1 ? 0.75 : 1.25,
          ])
        ),
      },
    },
  });
  await page.goto(`${hostOrigin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}`, {
    waitUntil: 'domcontentloaded',
  });
  const rail = page.locator('[data-project-timeline-track-list]');
  const canvas = page.locator('[data-ui="video-editor.timeline.canvas-scroll"]');
  await expect(rail).toBeVisible();
  await expect(canvas).toBeVisible();
  const dimensions = await page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>('[data-project-timeline-track-list]')!;
    const canvas = document.querySelector<HTMLElement>(
      '[data-ui="video-editor.timeline.canvas-scroll"]'
    )!;
    const header = rail.previousElementSibling as HTMLElement;
    const ruler = canvas.querySelector<HTMLElement>('[data-ui="video-editor.timeline.ruler"]')!;
    return {
      rail: [rail.clientHeight, rail.scrollHeight, rail.clientWidth, rail.scrollWidth],
      canvas: [canvas.clientHeight, canvas.scrollHeight, canvas.clientWidth, canvas.scrollWidth],
      header: header.getBoundingClientRect().height,
      ruler: ruler.getBoundingClientRect().height,
    };
  });
  expect(dimensions.header).toBe(30);
  expect(dimensions.ruler).toBe(30);
  expect(dimensions.rail[1] - dimensions.rail[0]).toBeGreaterThan(800);
  expect(dimensions.canvas[1] - dimensions.canvas[0]).toBeGreaterThan(800);
  expect(dimensions.rail[1] - dimensions.rail[0]).toBe(dimensions.canvas[1] - dimensions.canvas[0]);
  const box = await rail.boundingBox();
  if (!box) throw new Error('Missing rail box');
  await page.mouse.move(box.x + box.width / 2, box.y + 90);
  for (let index = 0; index < 10; index += 1) {
    await page.mouse.wheel(0, 80);
    await expect.poll(() => rail.evaluate((node) => node.scrollTop)).toBe((index + 1) * 80);
    await expect.poll(() => canvas.evaluate((node) => node.scrollTop)).toBe((index + 1) * 80);
  }
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('Missing canvas box');
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + 90);
  await page.mouse.wheel(0, -80);
  await expect.poll(() => rail.evaluate((node) => node.scrollTop)).toBe(720);
  await expect.poll(() => canvas.evaluate((node) => node.scrollTop)).toBe(720);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => rail.evaluate((node) => node.scrollTop)).toBe(720);
  await expect.poll(() => canvas.evaluate((node) => node.scrollTop)).toBe(720);
  const resizedCanvasBox = await canvas.boundingBox();
  if (!resizedCanvasBox) throw new Error('Missing resized canvas box');
  await page.mouse.move(resizedCanvasBox.x + resizedCanvasBox.width / 2, resizedCanvasBox.y + 90);
  await page.mouse.wheel(12, 48);
  await expect.poll(() => rail.evaluate((node) => node.scrollTop)).toBe(768);
  await expect.poll(() => canvas.evaluate((node) => node.scrollTop)).toBe(768);

  const resizedRailBox = await rail.boundingBox();
  if (!resizedRailBox) throw new Error('Missing resized rail box');
  await page.mouse.move(resizedRailBox.x + resizedRailBox.width / 2, resizedRailBox.y + 90);
  const maxScroll = await rail.evaluate((node) => node.scrollHeight - node.clientHeight);
  for (let top = 768; top < maxScroll;) {
    await page.mouse.wheel(0, 80);
    top = Math.min(maxScroll, top + 80);
    await expect.poll(() => rail.evaluate((node) => node.scrollTop)).toBe(top);
    await expect.poll(() => canvas.evaluate((node) => node.scrollTop)).toBe(top);
  }
  await page.mouse.wheel(0, 80);
  await expect.poll(() => rail.evaluate((node) => node.scrollTop)).toBe(maxScroll);
  await page.mouse.move(resizedCanvasBox.x + resizedCanvasBox.width / 2, resizedCanvasBox.y + 90);
  await page.mouse.wheel(0, -80);
  await expect.poll(() => rail.evaluate((node) => node.scrollTop)).toBe(maxScroll - 80);
  await expect.poll(() => canvas.evaluate((node) => node.scrollTop)).toBe(maxScroll - 80);
});
