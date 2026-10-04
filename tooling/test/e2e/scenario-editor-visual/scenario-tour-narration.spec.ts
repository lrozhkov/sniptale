import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { expect, type Locator } from '@playwright/test';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';
import { test } from '../support/extension-fixture';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

/** Five seconds of real PCM exercise decoding without microphone permissions or mocked play(). */
function narrationWav(seconds = 5) {
  const samples = 8000 * seconds;
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
  test(`narration and music controls work live fullscreen and offline ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    const issues = createPageIssueCollector(page);
    await page.context().addInitScript(() => {
      if (Object.hasOwn(window, 'observedMusicGain')) return;
      const nodes: GainNode[] = [];
      const create = AudioContext.prototype.createGain;
      AudioContext.prototype.createGain = function () {
        const node = create.call(this);
        nodes.push(node);
        return node;
      };
      Object.defineProperty(window, 'observedMusicGain', { get: () => nodes.at(-1)?.gain.value });
    });
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
      .locator('.guide-page-header')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
      .click();
    await panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.tourMusic'), exact: true })
      .click();
    await panel
      .locator('.tour-audio-acquisition input[type="file"]')
      .setInputFiles({ name: 'Music.wav', mimeType: 'audio/wav', buffer: narrationWav(60) });
    await expect(panel.locator('.tour-audio-binding')).toContainText('Music.wav');
    await expect(
      panel.getByRole('switch', { name: t('scenario.editor.tourMusicLoop'), exact: true })
    ).toBeChecked();
    await expect(
      panel.getByRole('switch', { name: t('scenario.editor.tourMusicDucking'), exact: true })
    ).toBeChecked();
    await expect(
      panel.getByRole('textbox', { name: t('scenario.editor.tourMusicLevel'), exact: true })
    ).toHaveValue('25');
    await panel
      .getByRole('button', { name: t('scenario.editor.tourMusicRemove'), exact: true })
      .click();
    await expect(panel.locator('.tour-audio-binding')).toHaveCount(0);
    await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
    await expect(panel.locator('.tour-audio-binding')).toContainText('Music.wav');
    await expect(page.getByRole('status').first()).toHaveText(t('scenario.editor.guideSaved'));
    const reopen = new URL(page.url());
    reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
    reopen.searchParams.set('tourFixture', '1');
    reopen.searchParams.set('locale', locale);
    reopen.searchParams.set('theme', theme);
    await page.goto(reopen.href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: t('scenario.editor.appearance'), exact: true })
      .click();
    await panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.tourMusic'), exact: true })
      .click();
    await expect(panel.locator('.tour-audio-binding')).toContainText('Music.wav');
    await page.screenshot({
      path: info.outputPath(`music-inspector-${locale}.png`),
      fullPage: false,
    });
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();

    const check = async (player: Locator, surface: string) => {
      const audio = player.locator('audio:not([data-tour-music])');
      const music = player.locator('audio[data-tour-music]');
      const musicMute = player.locator('[data-tour-music-mute]');
      const gain = () => page.evaluate(() => Number(Reflect.get(window, 'observedMusicGain')));
      const direct = async (index: number) => {
        await player.locator('[data-tour-contents]').click();
        await player.locator('.tour-contents-list button').nth(index).click();
        await expect(player).toHaveAttribute('data-slide-id', ids[index]!);
        await expect(player.locator('[data-tour-stage]')).toHaveAttribute('data-motion', 'settled');
      };
      await player.locator('[data-tour-manual]').click();
      await direct(0);
      await expect
        .poll(() => music.evaluate((node: HTMLAudioElement) => node.currentTime))
        .toBeGreaterThan(0.05);
      const musicSource = await music.getAttribute('src');
      const toggle = player.locator('[data-tour-narration-toggle]:visible');
      const replay = player.locator('[data-tour-narration-replay]:visible');
      await expect(toggle).toHaveCount(1);
      await replay.click();
      await expect
        .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
        .toBeGreaterThan(0.65);
      await expect(toggle).toHaveAccessibleName(t('scenario.editor.tourNarrationPause'));
      await expect.poll(gain).toBeCloseTo(0.25, 2);
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(true);
      await expect(toggle).toHaveAccessibleName(t('scenario.editor.tourNarrationResume'));
      await expect.poll(gain).toBeCloseTo(1, 2);
      expect(await music.evaluate((node: HTMLAudioElement) => node.paused)).toBe(false);
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
      await expect
        .poll(() => music.evaluate((node: HTMLAudioElement) => node.volume))
        .toBeCloseTo(0.12, 2);
      await musicMute.click();
      await expect(musicMute).toHaveAccessibleName(t('scenario.editor.tourMusicUnmute'));
      await expect.poll(() => music.evaluate((node: HTMLAudioElement) => node.volume)).toBe(0);
      expect(await audio.evaluate((node: HTMLAudioElement) => node.volume)).toBeCloseTo(0.4, 2);
      await musicMute.click();
      await mute.focus();
      await page.keyboard.press('Space');
      await expect(mute).toHaveAccessibleName(t('scenario.editor.tourUnmute'));
      await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.volume)).toBe(0);
      expect(await music.evaluate((node: HTMLAudioElement) => node.volume)).toBe(0);
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
      const beforeNavigation = await music.evaluate((node: HTMLAudioElement) => node.currentTime);
      await direct(1);
      expect(await music.getAttribute('src')).toBe(musicSource);
      expect(
        await music.evaluate((node: HTMLAudioElement) => node.currentTime)
      ).toBeGreaterThanOrEqual(beforeNavigation);
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
      const placement = await toggle.evaluate((button) => {
        const hint = button.closest('.tour-hint')!;
        const group = button.parentElement!.getBoundingClientRect();
        const footer = hint.querySelector('.tour-hint-controls')!.getBoundingClientRect();
        const header = hint.querySelector('.tour-hint-header')!.getBoundingClientRect();
        const close = hint.querySelector('[data-tour-hint-close]')!.getBoundingClientRect();
        const icon = hint.querySelector('[data-tour-hint-close] svg')!.getBoundingClientRect();
        return {
          group: { x: group.x, y: group.y },
          footer: { x: footer.x, y: footer.y },
          headerBottom: header.bottom,
          close: { width: close.width, height: close.height },
          icon: { width: icon.width, height: icon.height },
        };
      });
      expect(placement.group.x).toBeCloseTo(placement.footer.x, 0);
      expect(placement.group.y).toBeGreaterThanOrEqual(placement.headerBottom);
      expect(placement.close).toEqual({ width: 28, height: 28 });
      expect(placement.icon).toEqual({ width: 20, height: 20 });
      const bounds = await player.boundingBox();
      for (const control of [toggle, replay, volume, mute, musicMute]) {
        const box = await control.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
        expect(box!.y).toBeGreaterThanOrEqual(bounds!.y - 1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
      }
      if (surface === 'normal') {
        await direct(0);
        const beforeAutomatic = await music.evaluate((node: HTMLAudioElement) => node.currentTime);
        await player.locator('[data-tour-play]').click();
        await expect(player).toHaveAttribute('data-slide-id', ids[1]!, { timeout: 12000 });
        expect(await music.getAttribute('src')).toBe(musicSource);
        expect(await music.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThan(
          beforeAutomatic
        );
        await player.locator('[data-tour-play]').click();
        await expect.poll(() => music.evaluate((node: HTMLAudioElement) => node.paused)).toBe(true);
        const retained = await music.evaluate((node: HTMLAudioElement) => node.currentTime);
        await player.locator('[data-tour-play]').click();
        await expect
          .poll(() => music.evaluate((node: HTMLAudioElement) => node.currentTime))
          .toBeGreaterThan(retained);
        await player.locator('[data-tour-manual]').click();
      }
      await expect(player.locator('[data-tour-stage]')).toHaveAttribute('data-motion', 'settled');
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
    issues.assertClean();
    const hosted = page;
    page = await hosted.context().newPage();
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.bringToFront();
    const offlineIssues = createPageIssueCollector(page);
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
      const musicBinding = await page
        .locator('#tour-data')
        .evaluate((node) => JSON.parse(node.textContent!).tour.backgroundMusic);
      expect(musicBinding).toMatchObject({
        duration: 60,
        volume: 0.3,
        loop: true,
        ducking: { enabled: true, level: 0.25 },
      });
      await check(page.locator('#tour-player'), 'offline');
      offlineIssues.assertClean();
    } finally {
      await page.context().setOffline(false);
      await page.close();
      page = hosted;
    }
    issues.assertClean();
  });
}
