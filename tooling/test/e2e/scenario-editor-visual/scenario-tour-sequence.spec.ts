import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

function pcmAudio(seconds: number) {
  const size = 16000 * seconds;
  const wav = Buffer.alloc(size + 44);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(size, 40);
  for (let sample = 0; sample < size / 2; sample += 1)
    wav.writeInt16LE(Math.round(Math.sin((sample * Math.PI) / 20) * 1000), 44 + sample * 2);
  return wav;
}

async function choose(page: Page, label: string, option: string) {
  const control = page
    .locator('#guide-inspector-panel')
    .getByRole('button', { name: label, exact: true });
  if ((await control.textContent())?.trim() === option) return;
  await control.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function editTourImage(page: Page, t: ReturnType<typeof createTranslator>) {
  const originalImage = await page.locator('.tour-stage-host .tour-image').getAttribute('src');
  await page
    .locator('.tour-header-controls')
    .getByRole('button', { name: t('scenario.editor.guideEditImage'), exact: true })
    .click();
  const imageEditor = page.frameLocator('.guide-image-editor iframe');
  await imageEditor.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
  const drawing = imageEditor.locator('canvas.upper-canvas');
  await expect(drawing).toBeVisible();
  const drawingBounds = await drawing.boundingBox();
  if (!drawingBounds) throw new Error('Missing embedded image editor canvas');
  await page.mouse.move(
    drawingBounds.x + drawingBounds.width * 0.3,
    drawingBounds.y + drawingBounds.height * 0.3
  );
  await page.mouse.down();
  await page.mouse.move(
    drawingBounds.x + drawingBounds.width * 0.6,
    drawingBounds.y + drawingBounds.height * 0.6,
    { steps: 5 }
  );
  await page.mouse.up();
  await imageEditor
    .locator('[data-ui="editor.floating.document-bar.apply-scenario-button"]')
    .click();
  await expect(page.locator('.guide-image-editor')).toHaveCount(0);
  await expect(page.locator('.tour-stage-host .tour-image')).not.toHaveAttribute(
    'src',
    originalImage!
  );
}

async function authorTourActions(page: Page, t: ReturnType<typeof createTranslator>) {
  const panel = page.locator('#guide-inspector-panel');
  const library = page.locator('#guide-library-panel');
  const slides = page.locator('.tour-slide-select');
  for (let slide = 0; slide < 3; slide += 1) {
    await slides.nth(slide).click();
    const category = panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.tourObjects'), exact: true });
    if (await category.isVisible()) await category.click();
    for (let action = 0; action < 3; action += 1) {
      const add = panel.getByRole('button', {
        name: t('scenario.editor.tourAddObject'),
        exact: true,
      });
      if (await add.isVisible()) {
        await add.click();
        await page
          .locator('.guide-action-menu')
          .getByRole('button', { name: t('scenario.editor.tourHotspot'), exact: true })
          .click();
      } else
        await panel
          .getByRole('button', { name: t('scenario.editor.tourHotspot'), exact: true })
          .click();
      const label = `Action ${slide * 3 + action + 1}`;
      await panel
        .getByRole('textbox', { name: t('scenario.editor.tourObjectLabel'), exact: true })
        .fill(label);
      await expect(page.locator('.tour-stage-host [data-tour-hint-action-title]')).toHaveText(
        label
      );
      const text = panel.getByRole('textbox', {
        name: t('scenario.editor.textLabel'),
        exact: true,
      });
      await text.click();
      await expect(text).toBeFocused();
      await text.pressSequentially(`Instruction ${label}`);
      await expect(
        panel.getByRole('textbox', { name: t('scenario.editor.textLabel'), exact: true })
      ).toHaveValue(`Instruction ${label}`);
      await expect(
        panel.getByRole('button', { name: t('scenario.editor.tourAction'), exact: true })
      ).toHaveCount(0);
      if (slide === 0 && action === 0) {
        await library
          .locator('.guide-left-navigation')
          .getByRole('button', { name: t('scenario.editor.guideResources'), exact: true })
          .click();
        await expect(page.getByRole('status').first()).toHaveText(t('scenario.editor.guideSaved'));
        await expect(library.locator('.tour-audio-acquisition input[type="file"]')).toBeEnabled();
        await library.locator('.tour-audio-acquisition input[type="file"]').setInputFiles({
          name: 'Sequence voice.wav',
          mimeType: 'audio/wav',
          buffer: pcmAudio(5),
        });
        await expect(library.locator('.tour-audio-resource')).toHaveCount(1);
        await library.locator('.tour-audio-resource').hover();
        await library
          .getByRole('button', { name: t('scenario.editor.tourAudioAttach'), exact: true })
          .click();
        await library
          .locator('.guide-left-navigation')
          .getByRole('button', { name: t('scenario.editor.tourSlides'), exact: true })
          .click();
      }
      const appearance = panel
        .getByRole('navigation')
        .getByRole('button', { name: t('scenario.editor.appearance'), exact: true });
      if (await appearance.isVisible()) await appearance.click();
      const visualKeys = [
        'tourVisualPoint',
        'tourVisualFrame',
        'tourHighlight',
        'tourSpotlight',
      ] as const;
      for (const key of slide === 0 && action === 0
        ? visualKeys
        : [visualKeys[(slide * 3 + action) % 4]!]) {
        const objectId = await page
          .locator('.tour-stage-host [data-tour-object-id]')
          .last()
          .getAttribute('data-tour-object-id');
        await choose(page, t('scenario.editor.tourVisual'), t(`scenario.editor.${key}`));
        await expect(
          page.locator(`.tour-stage-host [data-tour-object-id="${objectId}"]`)
        ).toHaveCount(1);
        await expect(page.locator('.tour-stage-host [data-tour-hint-text]')).toHaveText(
          `Instruction ${label}`
        );
        if (slide === 0 && action === 0) {
          await panel
            .getByRole('navigation')
            .getByRole('button', { name: t('scenario.editor.tourNarration'), exact: true })
            .click();
          await expect(panel.locator('.tour-audio-binding')).toContainText('Sequence voice.wav');
          await appearance.click();
        }
      }
      await panel
        .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
        .click();
    }
  }
  await page
    .locator('.guide-page-header')
    .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
    .click();
  await expect(
    panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.tourMask'), exact: true })
  ).toHaveCount(0);
  await panel
    .getByRole('navigation')
    .getByRole('button', { name: t('scenario.editor.tourMusic'), exact: true })
    .click();
  await expect(page.getByRole('status').first()).toHaveText(t('scenario.editor.guideSaved'));
  await expect(panel.locator('.tour-audio-acquisition input[type="file"]')).toBeEnabled();
  await panel
    .locator('.tour-audio-acquisition input[type="file"]')
    .setInputFiles({ name: 'Sequence music.wav', mimeType: 'audio/wav', buffer: pcmAudio(60) });
  await expect(panel.locator('.tour-audio-binding')).toContainText('Sequence music.wav');
}

async function reorderTourActionsAndSlides(page: Page, t: ReturnType<typeof createTranslator>) {
  const panel = page.locator('#guide-inspector-panel');
  const library = page.locator('#guide-library-panel');
  const slides = page.locator('.tour-slide-select');
  await slides.nth(0).click();
  const category = panel
    .getByRole('navigation')
    .getByRole('button', { name: t('scenario.editor.tourObjects'), exact: true });
  if (await category.isVisible()) await category.click();
  await expect(panel.locator('.tour-object-row').nth(0)).toHaveText(/1\.\s*Action 1/);
  await expect(panel.locator('.tour-object-row').nth(1)).toHaveText(/2\.\s*Action 2/);
  await panel.locator('.tour-object-item').nth(1).hover();
  await panel
    .locator('.tour-object-item')
    .nth(1)
    .getByRole('button', { name: t('scenario.editor.tourMoveObjectUp'), exact: true })
    .click();
  await expect(panel.locator('.tour-object-row').nth(0)).toHaveText(/1\.\s*Action 2/);
  await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
  await expect(panel.locator('.tour-object-row').nth(0)).toHaveText(/1\.\s*Action 1/);
  await page.getByRole('button', { name: t('scenario.editor.guideRedo'), exact: true }).click();
  await expect(panel.locator('.tour-object-row').nth(0)).toHaveText(/1\.\s*Action 2/);
  await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
  await panel.locator('.tour-object-row').nth(2).dragTo(panel.locator('.tour-object-row').nth(0));
  await expect(panel.locator('.tour-object-row').nth(0)).toHaveText(/1\.\s*Action 3/);
  await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
  await expect(panel.locator('.tour-object-row').nth(0)).toHaveText(/1\.\s*Action 1/);
  const thirdHandle = library
    .locator('.tour-slide-row')
    .nth(2)
    .getByRole('button', { name: t('scenario.editor.tourMoveSlide'), exact: true });
  await thirdHandle.focus();
  await thirdHandle.press('Home');
  await slides.first().click();
  if (await category.isVisible()) await category.click();
  await expect(panel.locator('.tour-object-row').first()).toHaveText(/1\.\s*Action 7/);
  await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
  await page.getByRole('button', { name: t('scenario.editor.guideRedo'), exact: true }).click();
  await slides.first().click();
  if (await category.isVisible()) await category.click();
  await expect(panel.locator('.tour-object-row').first()).toHaveText(/1\.\s*Action 7/);
  await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
  await slides.first().click();
  await library
    .getByRole('button', { name: t('scenario.editor.tourAddNavigation'), exact: true })
    .click();
  const contentsRow = library
    .locator('.tour-slide-row')
    .filter({ has: page.locator('.tour-slide-select:not(:has(img))') });
  await contentsRow
    .getByRole('button', { name: t('scenario.editor.tourMoveSlide'), exact: true })
    .press('Home');
  await contentsRow
    .getByRole('button', { name: t('scenario.editor.tourMoveSlide'), exact: true })
    .press('ArrowDown');
  await expect(slides.nth(1).locator('img')).toHaveCount(0);
  await slides.first().click();
  if (await category.isVisible()) await category.click();
  await expect(
    panel.getByRole('button', { name: t('scenario.editor.tourMask'), exact: true })
  ).toHaveCount(0);
  await panel
    .getByRole('button', { name: t('scenario.editor.tourAddObject'), exact: true })
    .click();
  await expect(
    page
      .locator('.guide-action-menu')
      .getByRole('button', { name: t('scenario.editor.tourMask'), exact: true })
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
}

async function frameSelectedTourAction(page: Page, t: ReturnType<typeof createTranslator>) {
  const panel = page.locator('#guide-inspector-panel');
  const category = panel
    .getByRole('navigation')
    .getByRole('button', { name: t('scenario.editor.tourObjects'), exact: true });
  const cameraCategory = panel
    .getByRole('navigation')
    .getByRole('button', { name: t('scenario.editor.tourCamera'), exact: true });
  await cameraCategory.click();
  await choose(page, t('scenario.editor.tourCameraMode'), t('scenario.editor.tourCameraManual'));
  const zoom = panel.getByRole('textbox', {
    name: t('scenario.editor.tourCameraZoom'),
    exact: true,
  });
  await zoom.fill('200');
  await zoom.press('Enter');
  const frameControl = page
    .locator('.tour-header-controls')
    .getByRole('button', { name: t('scenario.editor.tourCameraFrame'), exact: true });
  await frameControl.click();
  const frame = page.locator('.tour-stage-host .tour-camera-frame');
  await expect(frame).toBeVisible();
  const frameBefore = await frame.getAttribute('style');
  await frame.focus();
  await frame.press('Shift+ArrowRight');
  await expect(frame).not.toHaveAttribute('style', frameBefore!);
  const frameAfter = await frame.getAttribute('style');
  await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
  await expect(frame).toHaveAttribute('style', frameBefore!);
  await page.getByRole('button', { name: t('scenario.editor.guideRedo'), exact: true }).click();
  await expect(frame).toHaveAttribute('style', frameAfter!);
  await frameControl.click();
  await panel
    .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
    .click();
  await cameraCategory.click();
  await expect(
    panel.getByRole('button', { name: t('scenario.editor.tourCameraMode'), exact: true })
  ).toContainText(t('scenario.editor.tourInherited'));
  if (await category.isVisible()) await category.click();
  await panel.locator('.tour-object-row[title="Action 3"]').click();
  await cameraCategory.click();
  await expect(
    panel.getByRole('button', { name: t('scenario.editor.tourCameraMode'), exact: true })
  ).toContainText(t('scenario.editor.tourInherited'));
  await panel
    .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
    .click();
  if (await category.isVisible()) await category.click();
  await panel.locator('.tour-object-row[title="Action 2"]').click();
  await cameraCategory.click();
  await expect(
    panel.getByRole('button', { name: t('scenario.editor.tourCameraMode'), exact: true })
  ).toContainText(t('scenario.editor.tourCameraManual'));
  await expect(zoom).toHaveValue('200');
}

for (const [locale, theme, size] of [
  ['ru', 'light', { width: 1280, height: 560 }],
  ['en', 'dark', { width: 1920, height: 900 }],
] as const) {
  test(`authors one ordered action sequence and previews the selected action ${locale}`, async ({
    page,
    extensionId,
  }, info) => {
    test.setTimeout(180_000);
    const t = createTranslator(locale);
    const issues = createPageIssueCollector(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openVisualHarness(
      page,
      `chrome-extension://${extensionId}`,
      theme,
      locale,
      size,
      'compare',
      { tourFixture: '1' }
    );
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    const slides = page.locator('.tour-slide-select');
    await page.getByRole('button', { name: t('scenario.editor.export'), exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: t('scenario.editor.tourHtmlPrepare'), exact: true })
      .click();
    await expect(page.locator('.guide-export-status')).toContainText(
      t('scenario.editor.tourHtmlBlockerNoActions')
    );
    await expect(
      page.getByRole('button', { name: t('scenario.editor.htmlSave'), exact: true })
    ).toBeDisabled();
    await page
      .getByRole('button', { name: t('scenario.editor.guideReaderBack'), exact: true })
      .click();
    await editTourImage(page, t);
    const library = page.locator('#guide-library-panel');
    await slides.nth(1).click();
    await library.locator('.tour-slide-row').nth(1).hover();
    await library
      .locator('.tour-slide-row')
      .nth(1)
      .getByRole('button', { name: t('scenario.editor.tourSlideActions'), exact: true })
      .click();
    await page
      .locator('.guide-action-menu')
      .getByRole('button', { name: t('scenario.editor.tourDuplicate'), exact: true })
      .click();
    await expect(slides).toHaveCount(3);
    await authorTourActions(page, t);
    await reorderTourActionsAndSlides(page, t);
    await expect(page.getByRole('status').first()).toHaveText(t('scenario.editor.guideSaved'));
    const reopen = new URL(page.url());
    reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
    reopen.searchParams.set('tourFixture', '1');
    reopen.searchParams.set('locale', locale);
    reopen.searchParams.set('theme', theme);
    await page.goto(reopen.href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const category = panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.tourObjects'), exact: true });
    await slides.nth(0).click();
    if (await category.isVisible()) await category.click();
    await expect(panel.locator('.tour-object-row')).toHaveCount(3);
    await panel.locator('.tour-object-row[title="Action 2"]').click();
    await expect(
      panel.getByRole('textbox', { name: t('scenario.editor.textLabel'), exact: true })
    ).toHaveValue('Instruction Action 2');
    await frameSelectedTourAction(page, t);
    await panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
      .click();
    const inspectorScroll = panel.locator('.guide-panel-scroll');
    await inspectorScroll.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const scrollBeforePreview = await inspectorScroll.evaluate((node) => node.scrollTop);
    expect(scrollBeforePreview).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath('action-inspector.png'), fullPage: false });
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();
    const player = page.locator('.tour-stage-host #tour-player');
    await expect(player.locator('[data-tour-counter]')).toHaveText('2 / 9');
    await expect(player.locator('audio[data-tour-music]')).toHaveAttribute('src', /^(blob:|data:)/);

    await expect(player.locator('[data-tour-hint-action-title]')).toHaveText('Action 2');
    await expect(player.locator('[data-tour-hint-text]')).toHaveText('Instruction Action 2');
    await expect(player.locator('[data-tour-object-id]')).toHaveCount(1);
    await player.locator('[data-tour-manual]').click();
    await player.locator('[data-tour-next]').click();
    await expect(player.locator('[data-tour-counter]')).toHaveText('3 / 9');
    await player.locator('[data-tour-next]').click();
    await expect(player.locator('[data-tour-counter]')).toBeHidden();
    await expect(player.locator('[data-tour-object-id]')).toHaveCount(0);
    await player.locator('[data-tour-next]').click();
    await expect(player.locator('[data-tour-counter]')).toHaveText('4 / 9');
    await player.locator('[data-tour-contents]').click();
    await expect(player.locator('.tour-contents-title')).toHaveText(
      t('scenario.editor.tourContentsTitle')
    );
    await expect(player.locator('.tour-contents-list button').nth(4)).toHaveText('4. Action 4');
    await page.screenshot({ path: info.outputPath('action-preview-menu.png'), fullPage: false });
    await page.keyboard.press('Escape');
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourReturnToEditing'), exact: true })
      .click();
    await expect
      .poll(() => inspectorScroll.evaluate((node) => node.scrollTop))
      .toBeCloseTo(scrollBeforePreview, 0);
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewStart'), exact: true })
      .click();
    await expect(player.locator('[data-tour-counter]')).toHaveText('1 / 9');
    await player.locator('[data-tour-next]').click();
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourReplayPreview'), exact: true })
      .click();
    await expect(player.locator('[data-tour-counter]')).toHaveText('1 / 9');
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourReturnToEditing'), exact: true })
      .click();
    await expect
      .poll(() => inspectorScroll.evaluate((node) => node.scrollTop))
      .toBeCloseTo(scrollBeforePreview, 0);
    await panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.textLabel'), exact: true })
      .click();
    await expect(
      panel.getByRole('textbox', { name: t('scenario.editor.textLabel'), exact: true })
    ).toHaveValue('Instruction Action 2');
    await page.getByRole('button', { name: t('scenario.editor.export'), exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: t('scenario.editor.tourHtmlPrepare'), exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: t('scenario.editor.htmlSave'), exact: true })
    ).toBeEnabled();
    const exported = page
      .frameLocator('.tour-export-frame iframe')
      .frameLocator('iframe')
      .locator('#tour-player');
    await exported.locator('[data-tour-manual]').click();
    await expect(exported.locator('[data-tour-counter]')).toHaveText('1 / 9');
    await expect(exported.locator('[data-tour-narration-replay]:visible')).toHaveCount(1);
    await expect(exported.locator('audio[data-tour-music]')).toHaveAttribute(
      'src',
      /^(blob:|data:)/
    );
    for (let action = 1; action <= 9; action += 1) {
      await expect(exported.locator('[data-tour-counter]')).toHaveText(`${action} / 9`);
      await expect(exported.locator('[data-tour-hint-action-title]')).toHaveText(
        `Action ${action}`
      );
      await expect(exported.locator('[data-tour-object-id]')).toHaveCount(1);
      await exported.locator('[data-tour-next]').click();
      if (action === 3) {
        await expect(exported.locator('[data-tour-counter]')).toBeHidden();
        await exported.locator('[data-tour-next]').click();
      }
    }
    await page.screenshot({ path: info.outputPath('export-retry-complete.png'), fullPage: false });
    await page.evaluate(() => {
      const chunks: Uint8Array[] = [];
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => ({
          createWritable: async () =>
            new WritableStream<Uint8Array>({
              write(chunk) {
                chunks.push(chunk);
              },
            }),
        }),
      });
      Object.defineProperty(window, 'savedSequenceTour', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: t('scenario.editor.htmlSave'), exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => String(Reflect.get(window, 'savedSequenceTour'))))
      .toContain('<!doctype html>');
    const output = info.outputPath('authored-sequence.html');
    await writeFile(
      output,
      await page.evaluate(() => String(Reflect.get(window, 'savedSequenceTour')))
    );
    const offline = await page.context().newPage();
    await offline.setViewportSize(size);
    await page.context().setOffline(true);
    try {
      await offline.goto(pathToFileURL(output).href);
      const offlinePlayer = offline.locator('#tour-player');
      await offlinePlayer.locator('[data-tour-manual]').click();
      for (let action = 1; action <= 9; action += 1) {
        await expect(offlinePlayer.locator('[data-tour-counter]')).toHaveText(`${action} / 9`);
        await expect(offlinePlayer.locator('[data-tour-hint-action-title]')).toHaveText(
          `Action ${action}`
        );
        await expect(offlinePlayer.locator('[data-tour-object-id]')).toHaveCount(1);
        await offlinePlayer.locator('[data-tour-next]').click();
        if (action === 3) {
          await expect(offlinePlayer.locator('[data-tour-counter]')).toBeHidden();
          await offlinePlayer.locator('[data-tour-next]').click();
        }
      }
      await offline.screenshot({
        path: info.outputPath('authored-offline-complete.png'),
        fullPage: false,
      });
    } finally {
      await page.context().setOffline(false);
      await offline.close();
    }

    issues.assertClean();
  });
}
