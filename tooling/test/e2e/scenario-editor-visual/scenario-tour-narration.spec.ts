import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { expect, type Locator } from '@playwright/test';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';
import { test } from '../support/extension-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

/** Five seconds of real PCM exercise decoding without microphone permissions or mocked play(). */
function narrationWav() {
  const samples = 8000 * 5;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.write('data', 36);
  for (const [offset, value] of [
    [4, wav.length - 8],
    [16, 16],
    [24, 8000],
    [28, 16000],
    [40, samples * 2],
  ])
    wav.writeUInt32LE(value, offset);
  for (const [offset, value] of [
    [20, 1],
    [22, 1],
    [32, 2],
    [34, 16],
  ])
    wav.writeUInt16LE(value, offset);
  for (let index = 0; index < samples; index++)
    wav.writeInt16LE(
      Math.round(Math.sin((index * 2 * Math.PI * 220) / 8000) * 1000),
      44 + index * 2
    );
  return wav;
}

for (const [locale, theme, viewport] of [
  ['ru', 'light', { width: 1280, height: 560 }],
  ['en', 'dark', { width: 1920, height: 900 }],
] as const) {
  test(`narration local controls and master volume work live fullscreen and offline ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    const issues = createPageIssueCollector(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openVisualHarness(page, hostOrigin, theme, locale, viewport, 'compare', {
      tourFixture: '1',
    });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    const library = page.locator('#guide-library-panel');
    const category = (key: 'tourObjects' | 'tourNarration') =>
      panel
        .getByRole('navigation')
        .getByRole('button', { name: t(`scenario.editor.${key}`), exact: true });
    await library
      .locator('.guide-left-navigation')
      .getByRole('button', { name: t('scenario.editor.guideResources'), exact: true })
      .click();
    await library
      .locator('.tour-audio-acquisition input[type="file"]')
      .setInputFiles({ name: 'Voice.wav', mimeType: 'audio/wav', buffer: narrationWav() });
    await expect(library.locator('.tour-audio-resource')).toHaveCount(1);
    const ids: string[] = [];
    for (const index of [0, 1]) {
      await library
        .locator('.guide-left-navigation')
        .getByRole('button', { name: t('scenario.editor.tourSlides'), exact: true })
        .click();
      await page.locator('.tour-slide-select:has(img)').nth(index).click();
      await category('tourObjects').click();
      await panel
        .getByRole('button', { name: t('scenario.editor.tourHotspot'), exact: true })
        .click();
      await expect(page.locator('.tour-stage-host .tour-hotspot')).toHaveCount(1);
      await library
        .locator('.guide-left-navigation')
        .getByRole('button', { name: t('scenario.editor.guideResources'), exact: true })
        .click();
      await library.locator('.tour-audio-resource').hover();
      await library
        .getByRole('button', { name: t('scenario.editor.tourAudioAttach'), exact: true })
        .click();
      await category('tourNarration').click();
      if (index === 0) {
        await panel
          .getByRole('button', { name: t('scenario.editor.tourAudioTrigger'), exact: true })
          .click();
        await page
          .getByRole('option', { name: t('scenario.editor.tourAudioOnEnter'), exact: true })
          .click();
      }
      const start = panel.getByRole('textbox', {
        name: t('scenario.editor.tourAudioStart'),
        exact: true,
      });
      await start.fill('0.5');
      await start.press('Enter');
      ids.push(
        (await page.locator('.tour-stage-host #tour-player').getAttribute('data-slide-id'))!
      );
    }
    await expect(
      library.getByRole('button', { name: `${t('scenario.editor.tourAudioUsed')}: 2`, exact: true })
    ).toBeVisible();
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();

    const check = async (player: Locator, surface: string) => {
      const audio = player.locator('audio');
      const direct = async (index: number) => {
        await player.locator('[data-tour-contents]').click();
        await player.locator('.tour-contents-list button').nth(index).click();
        await expect(player).toHaveAttribute('data-slide-id', ids[index]!);
        await expect(player.locator('[data-tour-stage]')).toHaveAttribute('data-motion', 'settled');
      };
      await player.locator('[data-tour-manual]').click();
      await direct(0);
      const toggle = player.locator('[data-tour-narration-toggle]:visible');
      const replay = player.locator('[data-tour-narration-replay]:visible');
      await expect(toggle).toHaveCount(1);
      await replay.click();
      await expect
        .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
        .toBeGreaterThan(0.65);
      await expect(toggle).toHaveAccessibleName(t('scenario.editor.tourNarrationPause'));
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(true);
      await expect(toggle).toHaveAccessibleName(t('scenario.editor.tourNarrationResume'));
      const paused = await audio.evaluate((node: HTMLAudioElement) => node.currentTime);
      await expect(player).toHaveAttribute('data-slide-id', ids[0]!);
      await expect(player).toHaveAttribute('data-tour-mode', 'manual');
      await page.keyboard.press('Space');
      await expect
        .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
        .toBeGreaterThan(paused + 0.1);
      await toggle.click();
      const volume = player.locator('[data-tour-volume]');
      await expect(volume).toHaveAccessibleName(t('scenario.editor.tourVolume'));
      await volume.fill('0.4');
      await expect
        .poll(() => audio.evaluate((node: HTMLAudioElement) => node.volume))
        .toBeCloseTo(0.4, 2);
      const mute = player.locator('[data-tour-mute]');
      await mute.focus();
      await page.keyboard.press('Space');
      await expect(mute).toHaveAccessibleName(t('scenario.editor.tourUnmute'));
      await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.volume)).toBe(0);
      await page.keyboard.press('Space');
      await expect
        .poll(() => audio.evaluate((node: HTMLAudioElement) => node.volume))
        .toBeCloseTo(0.4, 2);
      expect(await audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(true);
      await replay.click();
      await expect
        .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
        .toBeGreaterThan(0.55);
      expect(await audio.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeLessThan(1.5);
      await direct(1);
      await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(true);
      await expect(toggle).toHaveAccessibleName(t('scenario.editor.tourNarrationReplay'));
      await toggle.click();
      await expect
        .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
        .toBeGreaterThan(0.65);
      await toggle.click();
      await expect(toggle).toHaveAccessibleName(t('scenario.editor.tourNarrationResume'));
      expect(await audio.evaluate((node: HTMLAudioElement) => node.error)).toBeNull();
      await expect(player.locator('[data-tour-status]')).toBeHidden();
      const bounds = await player.boundingBox();
      for (const control of [toggle, replay, volume, mute]) {
        const box = await control.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
        expect(box!.y).toBeGreaterThanOrEqual(bounds!.y - 1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
      }
      const screenshot = info.outputPath(`narration-${surface}-${locale}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      await info.attach(`narration-${surface}-${locale}`, {
        path: screenshot,
        contentType: 'image/png',
      });
    };
    const player = page.locator('.tour-stage-host #tour-player');
    await check(player, 'normal');
    await player.evaluate((root) => root.requestFullscreen());
    await check(player, 'fullscreen');
    await page.evaluate(() => document.exitFullscreen());
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
      Object.defineProperty(window, 'savedNarrationTour', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: t('scenario.editor.export'), exact: true }).click();
    await page
      .locator('.guide-export-stage')
      .getByRole('button', { name: t('scenario.editor.tourHtmlPrepare'), exact: true })
      .click();
    await page.getByRole('button', { name: t('scenario.editor.htmlSave'), exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => String(Reflect.get(window, 'savedNarrationTour'))))
      .toContain('<!doctype html>');
    const output = info.outputPath('narration-tour.html');
    await writeFile(
      output,
      await page.evaluate(() => String(Reflect.get(window, 'savedNarrationTour')))
    );
    await page.context().setOffline(true);
    try {
      await page.goto(pathToFileURL(output).href);
      const attachments = await page.locator('#tour-data').evaluate((node) => {
        const payload = JSON.parse(node.textContent!);
        return payload.tour.slides.map(
          (slide: {
            hotspots: { narration: { trigger: string; trimStart: number; gain: number } }[];
          }) =>
            slide.hotspots.map((point) => ({
              trigger: point.narration.trigger,
              trimStart: point.narration.trimStart,
              gain: point.narration.gain,
            }))
        );
      });
      expect(attachments).toEqual([
        [{ trigger: 'enter', trimStart: 0.5, gain: 1 }],
        [{ trigger: 'activation', trimStart: 0.5, gain: 1 }],
      ]);
      await check(page.locator('#tour-player'), 'offline');
    } finally {
      await page.context().setOffline(false);
    }
    issues.assertClean();
  });
}
