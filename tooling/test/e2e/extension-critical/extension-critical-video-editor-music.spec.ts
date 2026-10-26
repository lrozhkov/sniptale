import { expect, test, type Locator } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { syntheticSpeechWav } from '../support/voiceover-speech-fixture';
import { checkInspectorPaintedFont } from '../support/inspector-utilities';
import { readNativeVideoProject as readProject } from '../support/native-video-project';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

async function operate(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await control.click();
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  const theme = index === 0 ? 'dark' : 'light';
  test(`Montage music material and long fade ${viewport.size.width} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const host = await startHostServer();
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript(
        (locale) => localStorage.setItem('sniptale-locale-preference', locale),
        locale
      );
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?id=beta-v1-recording&theme=${theme}`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const before = await readProject(page);
      const materials = page.locator('[data-ui="video-editor.materials"]');
      await materials.locator('input[type="file"][accept*="audio/"]').setInputFiles({
        name: 'Music.wav',
        mimeType: 'audio/wav',
        buffer: syntheticSpeechWav(80),
      });
      await expect
        .poll(async () =>
          (await readProject(page))?.assets.some((asset) => asset.name === 'Music.wav')
        )
        .toBe(true);
      const imported = await readProject(page);
      expect(imported?.clips).toMatchObject(before?.clips ?? []);
      const asset = imported?.assets.find((asset) => asset.name === 'Music.wav');
      const track = imported?.tracks.find((track) => track.kind === 'AUDIO');
      if (!asset || !track) throw new Error('Missing music material or track');
      const material = materials.locator(`[data-material-id="${asset.id}"] [draggable="true"]`);
      await operate(material);
      const source = page.locator('[data-ui="video-editor.source-viewer"]');
      await expect(source.locator('audio')).toHaveCount(1);
      await operate(
        source.getByRole('button', { name: label('videoEditor.timeline.play'), exact: true })
      );
      await expect
        .poll(() => source.locator('audio').evaluate((node) => node.currentTime))
        .toBeGreaterThan(0);
      await operate(
        source.getByRole('button', { name: label('videoEditor.timeline.pause'), exact: true })
      );
      await operate(source.getByTitle(label('videoEditor.app.materialsAppend'), { exact: true }));
      await expect
        .poll(async () =>
          (await readProject(page))?.clips.some(
            (clip) => clip.type === 'AUDIO' && clip.assetId === asset.id
          )
        )
        .toBe(true);
      const inserted = await readProject(page);
      const music = inserted?.clips.find(
        (clip) => clip.type === 'AUDIO' && clip.assetId === asset.id
      );
      if (!music || music.type !== 'AUDIO') throw new Error('Missing placed music');
      expect(music.textSnapshot).toBeUndefined();
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.sceneProperties'),
          exact: true,
        })
      );
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.fit-project"]'));
      await page
        .locator(`[data-project-timeline-clip="${music.id}"]`)
        .click({ modifiers: ['Control'] });
      const sections = page.locator('[data-ui="video-editor.inspector.sections"]');
      await operate(
        sections.locator('nav').getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAudio'),
          exact: true,
        })
      );
      const fade = sections.getByRole('textbox', {
        name: label('videoEditor.sidebar.inspectorAudioFadeIn'),
        exact: true,
      });
      await fade.fill('12');
      await fade.press('Tab');
      const readMusic = async () =>
        (await readProject(page))?.clips.find((clip) => clip.id === music.id);
      await expect.poll(async () => (await readMusic())?.fadeInMs).toBe(12000);
      await checkInspectorPaintedFont(page, fade, 'music-fade');
      await fade.focus();
      await fade.press('Tab');
      expect((await readMusic())?.fadeInMs).toBe(12000);
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
      await expect.poll(async () => (await readMusic())?.fadeInMs).toBe(0);
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.redo"]'));
      await expect.poll(async () => (await readMusic())?.fadeInMs).toBe(12000);
      await fade.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('music-audio-inspector.png'),
        fullPage: false,
      });
      const gain = sections.getByRole('textbox', {
        name: label('videoEditor.sidebar.volumeLabel'),
        exact: true,
      });
      await gain.fill('70');
      await gain.press('Tab');
      await expect
        .poll(async () => {
          const value = await readMusic();
          return value?.type === 'AUDIO' ? value.audioGainStart : undefined;
        })
        .toBe(0.7);
      await operate(
        sections.locator('nav').getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupTiming'),
          exact: true,
        })
      );
      const rate = sections.getByRole('textbox', {
        name: label('videoEditor.sidebar.playbackRateLabel'),
        exact: true,
      });
      await rate.fill('2');
      await rate.press('Tab');
      await expect
        .poll(async () => (await readMusic())?.duration)
        .toBeCloseTo(music.duration / 2, 3);
      const retimed = await readMusic();
      expect(retimed).toMatchObject({
        sourceStart: music.sourceStart,
        sourceDuration: music.sourceDuration,
        fadeInMs: 12000,
        playbackRate: 2,
      });
      const bounds = sections
        .locator('summary')
        .filter({ hasText: label('videoEditor.sidebar.inspectorSourceBounds') });
      if ((await bounds.locator('..').getAttribute('open')) === null) await operate(bounds);
      await expect(
        sections.getByRole('textbox', { name: label('videoEditor.sidebar.sourceIn'), exact: true })
      ).toHaveValue('0');
      await page.screenshot({
        path: info.outputPath('music-timing-inspector.png'),
        fullPage: false,
      });
      await operate(
        sections.locator('nav').getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAudio'),
          exact: true,
        })
      );
      const currentProject = await readProject(page);
      const musicTrack = currentProject?.tracks.find((track) => track.id === music.trackId);
      if (!musicTrack) throw new Error('Missing music owner track');
      await operate(
        page
          .locator('[data-ui="video-editor.timeline.track-select"]')
          .filter({ hasText: musicTrack.name })
          .first()
      );
      await operate(
        sections.locator('nav').getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAudio'),
          exact: true,
        })
      );
      const master = page
        .locator('[data-ui="video-editor.inspector.track-audio"]')
        .getByRole('textbox', { name: label('videoEditor.sidebar.trackVolumeLabel'), exact: true });
      await master.fill('150');
      await master.press('Tab');
      await expect
        .poll(
          async () =>
            (await readProject(page))?.tracks.find((track) => track.id === music.trackId)
              ?.audioVolume
        )
        .toBe(1.5);
      expect((await readMusic())?.fadeInMs).toBe(12000);
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.sceneProperties'),
          exact: true,
        })
      );
      await page
        .locator(`[data-project-timeline-clip="${music.id}"]`)
        .click({ modifiers: ['Control'] });
      await operate(
        sections.locator('nav').getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAudio'),
          exact: true,
        })
      );
      const closeMaterials = page.locator('[data-ui="video-editor.materials.close"]');
      if (await closeMaterials.isVisible()) await operate(closeMaterials);
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
      const rail = sections.locator('nav');
      for (const width of [359, 360, 361]) {
        const box = (await handle.boundingBox())!;
        const current = (await inspector.boundingBox())!.width;
        await page.mouse.move(box.x + box.width / 2, box.y + 12);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + current - width, box.y + 12);
        await page.mouse.up();
        await expect
          .poll(async () => Math.round((await inspector.boundingBox())!.width))
          .toBe(width);
        const before = await rail.boundingBox();
        await fade.scrollIntoViewIfNeeded();
        const after = await rail.boundingBox();
        expect(after?.x).toBe(before?.x);
        expect(after?.y).toBe(before?.y);
        expect(
          await sections.locator('[data-section="audio"]').evaluate((node) => {
            const body = node.closest('[data-ui="video-editor.inspector.categories"] > div');
            if (!(body instanceof HTMLElement)) throw new Error('Missing category scroll owner');
            const bounds = body.getBoundingClientRect();
            return (
              body.scrollWidth <= body.clientWidth + 1 &&
              [...node.querySelectorAll('input,button')].every((control) => {
                const rect = control.getBoundingClientRect();
                return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
              })
            );
          })
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`music-fades-${width}.png`),
          fullPage: false,
        });
      }
      await operate(page.locator('[data-ui="video-editor.inspector.presentation-toggle"]'));
      await expect(fade).toHaveValue('12');
      await page.screenshot({ path: info.outputPath('music-all-sections.png'), fullPage: false });
      await operate(page.locator('[data-ui="video-editor.inspector.presentation-toggle"]'));
      if (viewport.size.width === 1280) {
        await page.setViewportSize({ width: 1200, height: 560 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.setViewportSize({ ...viewport.size });
      }
      const stored = await readProject(page);
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect.poll(async () => (await readMusic())?.fadeInMs).toBe(12000);
      expect((await readMusic())?.type).toBe('AUDIO');
      expect((await readProject(page))?.clips).toEqual(stored?.clips);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
