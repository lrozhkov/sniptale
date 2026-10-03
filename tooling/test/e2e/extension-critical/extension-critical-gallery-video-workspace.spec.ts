import { expect, test, type Page, type Locator } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import {
  seedReviewVideo,
  clickReviewExport,
  expectTimelineSelection,
  recordingCount,
} from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`quick editor advanced workspace (${variant.locale}, ${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', variant.theme);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(
        page,
        'review-vp8-opus.webm',
        { width: 160, height: 90, duration: 12 },
        false,
        true
      );
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await expect(button('gallery.videoReview.cutMode')).toBeEnabled();
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.workspaceTools"] button')
      ).toHaveCount(2);
      await expect(button('gallery.videoReview.telemetry')).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: testInfo.outputPath('basic.png') });
      await button('gallery.videoReview.advancedEditing').click();
      const inspectorTabs = dialog.locator('[data-ui="gallery.videoReview.inspectorNavigation"]');
      const sceneTab = inspectorTabs.getByRole('button', {
        name: label('gallery.videoReview.scene'),
        exact: true,
      });
      const sceneText = sceneTab.locator('span');
      const sceneTextX = (await sceneText.boundingBox())!.x;
      await inspectorTabs
        .getByRole('button', { name: label('gallery.videoReview.comments'), exact: true })
        .click();
      expect((await sceneText.boundingBox())!.x).toBeCloseTo(sceneTextX, 1);
      await sceneTab.click();
      expect((await sceneText.boundingBox())!.x).toBeCloseTo(sceneTextX, 1);
      await expect(sceneTab).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(sceneTab).toHaveCSS('min-height', '36px');
      const laneControls = dialog.locator('[data-ui="gallery.videoReview.trackControls"]');
      await expect(laneControls).toBeInViewport();
      await expect(laneControls.getByRole('button')).toHaveCount(4);
      expect(
        await button('gallery.videoReview.zoomTrack').evaluate(
          (node) => !!node.closest('[data-ui="gallery.videoReview.trackHeader"]')
        )
      ).toBe(true);
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.workspaceTools"] button')
      ).toHaveCount(0);
      await expect(button('gallery.videoReview.advancedEditing')).toBeInViewport();
      await expect(button('gallery.videoReview.advancedEditing').locator('span')).toBeHidden();
      await expect(dialog.locator('[data-ui="gallery.videoReview.audioLane"]')).toHaveCount(3);
      await expect(button('gallery.videoReview.zoomTrack')).toHaveAttribute('aria-pressed', 'true');
      await expect(button('gallery.videoReview.audioTrack')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await button('gallery.videoReview.zoomAdd').first().click();
      const zoomRegion = dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first();
      await expectTimelineSelection(zoomRegion);
      await expect(dialog.locator('[data-ui="gallery.videoReview.zoomInspector"]')).toBeVisible();
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.backgroundInspector"]')
      ).toHaveCount(0);
      await button('gallery.videoReview.scene').click();
      await page.mouse.move(0, 0);
      await expect(button('gallery.videoReview.backgroundNone')).not.toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)'
      );
      await button('gallery.videoReview.backgroundNone').hover();
      await expect(button('gallery.videoReview.backgroundNone')).not.toHaveCSS(
        'border-color',
        'rgba(0, 0, 0, 0)'
      );
      const image = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#4488bb';
        context.fillRect(0, 0, 16, 16);
        return canvas.toDataURL('image/png').split(',')[1]!;
      });
      await dialog.locator('input[accept="image/png,image/jpeg,image/webp"]').setInputFiles({
        name: 'background.png',
        mimeType: 'image/png',
        buffer: Buffer.from(image, 'base64'),
      });
      await expect(dialog.locator('[data-ui="gallery.videoReview.stage"] img')).toHaveCount(1);
      await dialog
        .getByRole('textbox', {
          name: label('gallery.videoReview.backgroundPadding'),
          exact: true,
        })
        .fill('8');
      await dialog
        .getByRole('textbox', { name: label('gallery.videoReview.backgroundPadding'), exact: true })
        .press('Tab');
      const mode = button('gallery.videoReview.advancedEditing');
      await page.mouse.move(0, 0);
      await expect(mode).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(mode).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
      const idleModeColor = await mode.evaluate((node) => getComputedStyle(node).color);
      await mode.hover();
      await expect(mode).not.toHaveCSS('color', idleModeColor);
      await expect(mode).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
      await expect(mode).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await page.mouse.move(0, 0);
      await expect(mode).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
      const inspector = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
      const heading = inspector.locator('header h2');
      const backBox = await button('gallery.videoReview.back').boundingBox();
      const titleBox = await heading.boundingBox();
      const closeBox = await button('common.actions.close').boundingBox();
      expect(
        Math.abs(backBox!.y + backBox!.height / 2 - titleBox!.y - titleBox!.height / 2)
      ).toBeLessThan(2);
      expect(closeBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width);
      const format = button('videoEditor.sidebar.canvasFormatLabel');
      const formatRow = format.locator('xpath=../..');
      expect((await formatRow.boundingBox())!.height).toBeLessThan(40);
      const padding = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.backgroundPadding'),
        exact: true,
      });
      await expect(padding).toHaveCSS('font-size', '12px');
      await expect(format).toHaveCSS('font-size', '12px');
      await expect(formatRow.locator(':scope > span')).toHaveCSS('font-size', '12px');
      await exerciseWorkspaceAudio(page, dialog, label, (name) => testInfo.outputPath(name));
      const playhead = dialog.locator('[data-ui="gallery.videoReview.playhead"]');
      expect((await playhead.boundingBox())!.height).toBeGreaterThan(150);
      const timePlane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
      await timePlane.focus();
      await page.keyboard.press('Space');
      await expect(button('gallery.videoReview.pause')).toBeVisible();
      await expect(timePlane).toHaveCSS('outline-style', 'none');
      await expect(timePlane).toHaveCSS('box-shadow', 'none');
      await page.keyboard.press('Space');
      await expect(button('gallery.videoReview.addOverlayComment')).toHaveCount(0);
      await expect(button('gallery.videoReview.copyReport')).toHaveCount(0);
      await button('gallery.videoReview.comments').click();
      const addNote = button('gallery.videoReview.addComment').and(dialog.locator('aside button'));
      const noteBounds = (await addNote.boundingBox())!;
      const listBounds = (await dialog.locator('aside ol').boundingBox())!;
      expect(noteBounds.width).toBeCloseTo(listBounds.width, 0);
      await expect(addNote).toHaveCSS('justify-content', 'center');
      await addNote.click();
      await dialog
        .getByRole('textbox', { name: label('gallery.videoReview.commentText'), exact: true })
        .fill('Explicit note');
      await button('gallery.videoReview.save').click();
      await expect(dialog.locator('ol')).toContainText('Explicit note');
      await page.screenshot({ path: testInfo.outputPath('advanced.png') });
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect(button('gallery.videoReview.back')).toBeInViewport();
      await expect(button('gallery.videoReview.advancedEditing')).toBeInViewport();
      const stage = await dialog.locator('[data-ui="gallery.videoReview.stage"]').boundingBox();
      expect(stage!.height).toBeGreaterThan(140);
      const navigation = dialog.locator('[data-ui="gallery.videoReview.inspectorNavigation"]');
      expect((await navigation.boundingBox())!.height).toBeGreaterThanOrEqual(36);
      await expect(dialog.locator('ol').getByText('Explicit note', { exact: true })).toBeInViewport(
        { ratio: 1 }
      );
      await page.screenshot({ path: testInfo.outputPath('minimum.png') });
      await button('gallery.videoReview.advancedEditing').click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.stage"] img')).toHaveCount(0);
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.stage"] img')).toHaveCount(1);
      await clickReviewExport(button, 'gallery.videoReview.exportVideo');
      await expect.poll(() => recordingCount(page)).toBe(2);
      await expect(button('common.actions.close')).toBeEnabled();
      await button('common.actions.close').click();
      await expect(page.locator('[data-ui="gallery.videoReview.dialog"]')).toHaveCount(0);
      await expect(page.locator('[data-ui="gallery.videoReview.enter"]')).toHaveCount(0);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

/** Source controls, imported audio and speed geometry share the Advanced workspace transaction. */
async function exerciseWorkspaceAudio(
  page: Page,
  dialog: Locator,
  label: (key: Parameters<typeof translate>[0]) => string,
  outputPath: (name: string) => string
) {
  const button = (key: Parameters<typeof translate>[0]) =>
    dialog.getByRole('button', { name: label(key), exact: true });
  const mute = button('gallery.videoReview.muteSourceAudio');
  const enabledColor = await mute.evaluate((node) => getComputedStyle(node).color);
  await mute.click();
  const restore = button('gallery.videoReview.restoreSourceAudio');
  await expect(restore).toHaveAttribute('aria-pressed', 'false');
  await expect
    .poll(() => restore.evaluate((node) => getComputedStyle(node).color))
    .not.toBe(enabledColor);
  await restore.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0);
  await expect(mute).toHaveCSS('color', enabledColor);
  await dialog
    .locator('[data-ui="gallery.videoReview.inspector"]')
    .locator('[data-ui="gallery.videoReview.canvasSettings"]')
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: outputPath('scene-inspector.png') });
  await button('gallery.videoReview.audioTrack').click();
  await expect(dialog.locator('[data-ui="gallery.videoReview.audioLane"]')).toHaveCount(1);
  await expect(dialog.locator('[data-audio-lane="music"]')).toHaveCount(0);
  await button('gallery.videoReview.audioTrack').click();
  await expect(dialog.locator('[data-audio-lane="music"]')).toBeVisible();

  const headers = dialog.locator('[data-ui="gallery.videoReview.trackHeader"]');
  const originalWave = dialog
    .locator('[data-ui="gallery.videoReview.audioLane"]')
    .first()
    .locator('path');
  await expect
    .poll(async () => (await originalWave.getAttribute('d'))?.length ?? 0)
    .toBeGreaterThan(100);
  const wav = Buffer.alloc(44 + 48000 * 2 * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(96000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  for (let i = 0; i < 96000; i++)
    wav.writeInt16LE(
      Math.round(Math.sin((i / 48000) * 440 * Math.PI * 2) * (i < 48000 ? 4000 : 12000)),
      44 + i * 2
    );
  await dialog
    .locator('input[accept="audio/*"]')
    .first()
    .setInputFiles({ name: 'peaks.wav', mimeType: 'audio/wav', buffer: wav });
  const music = dialog.locator('[data-ui="gallery.videoReview.audioLane"]').last();
  await expect
    .poll(async () => (await music.locator('path').getAttribute('d'))?.length ?? 0)
    .toBeGreaterThan(100);
  const audioClip = music.locator('[role="button"]').first();
  await expect(audioClip).toHaveAttribute('title', 'peaks.wav');
  await expect(audioClip).toHaveText('');
  const originalClipBox = (await audioClip.boundingBox())!;
  const handle = audioClip.locator('[data-audio-edge="end"]');
  await expect(handle.locator('span')).toBeVisible();
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 150, handleBox.y + handleBox.height / 2, { steps: 3 });
  expect((await audioClip.boundingBox())!.width).toBeLessThanOrEqual(originalClipBox.width + 1);
  await page.mouse.up();
  expect((await audioClip.boundingBox())!.width).toBeLessThanOrEqual(originalClipBox.width + 1);
  await audioClip.click();
  await expectTimelineSelection(audioClip, audioClip.locator(':scope > div').first());
  const clipMute = button('gallery.videoReview.audioClipMute');
  await clipMute.click();
  await page.mouse.move(0, 0);
  await expect(clipMute).toHaveAttribute('aria-pressed', 'true');
  await expect(clipMute).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await clipMute.hover();
  await expect(clipMute).not.toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
  await clipMute.click();
  const zoomControl = dialog.getByRole('slider', {
    name: label('videoEditor.timeline.zoom'),
    exact: true,
  });
  await zoomControl.focus();
  await zoomControl.press('End');
  const headerX = (await headers.last().boundingBox())!.x;
  const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
  await viewport.evaluate((node) => {
    node.scrollLeft = 120;
  });
  expect((await headers.last().boundingBox())!.x).toBeCloseTo(headerX, 1);
  await viewport.evaluate((node) => {
    node.scrollLeft = 0;
  });
  await button('gallery.videoReview.fit').click();
  const [voiceFile] = await Promise.all([
    page.waitForEvent('filechooser'),
    button('gallery.videoReview.audioImport').first().click(),
  ]);
  await voiceFile.setFiles({ name: 'voice.wav', mimeType: 'audio/wav', buffer: wav });
  const voice = dialog.locator('[data-audio-lane="voiceover"] [role="button"]');
  await expect(voice).toHaveCount(1);
  const voiceBefore = (await voice.boundingBox())!;
  await button('gallery.videoReview.speedMode').click();
  const sourceBox = (await dialog
    .locator('[data-ui="gallery.videoReview.sourceLane"]')
    .boundingBox())!;
  await page.mouse.move(sourceBox.x + 1, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width * 0.6, sourceBox.y + sourceBox.height / 2, {
    steps: 4,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await voice.boundingBox())!.width)
    .toBeGreaterThan(voiceBefore.width * 1.9);
  await button('gallery.videoReview.pointerTool').click();
  const voiceBox = (await voice.boundingBox())!;
  await expect
    .poll(async () => (await voice.locator('path').getAttribute('d'))?.length ?? 0)
    .toBeGreaterThan(100);
  const loudStart = async () =>
    voice.locator('path').evaluate((node) => {
      const bars = [...(node.getAttribute('d') ?? '').matchAll(/M([\d.]+) ([\d.]+)V/g)];
      return Number(bars.find((bar) => Number(bar[2]) < 40)?.[1] ?? -1);
    });
  const voicePeakStart = await loudStart();
  expect(voicePeakStart).toBeGreaterThan(45);
  expect(voicePeakStart).toBeLessThan(55);
  await page.mouse.move(voiceBox.x + voiceBox.width / 2, voiceBox.y + voiceBox.height / 2);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(voiceBox.x + voiceBox.width / 2 + 25, voiceBox.y + voiceBox.height / 2, {
    steps: 3,
  });
  expect((await voice.boundingBox())!.x).toBeGreaterThan(voiceBox.x + 20);
  expect(Math.abs((await loudStart()) - voicePeakStart)).toBeLessThan(1);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect((await voice.boundingBox())!.x).toBeCloseTo(voiceBox.x, 0);
  await page.screenshot({ path: outputPath('voiceover-speed-preview.png') });
}
