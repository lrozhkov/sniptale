import { expect, test, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import {
  installSpeechPortFixture,
  persistedSpeech,
  speechModelResponse,
  syntheticSpeechWav,
} from '../support/voiceover-speech-fixture';

async function openReview(page: Page) {
  await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
  await page.locator('[data-ui="gallery.videoReview.enter"]').click();
}

for (const variant of [
  { locale: 'en' as const, theme: 'light', width: 1280, height: 560 },
  { locale: 'ru' as const, theme: 'dark', width: 1920, height: 900 },
  { locale: 'en' as const, theme: 'light', width: 1200, height: 560 },
]) {
  test(`speech replaces only the selected phrase and retains history (${variant.width}x${variant.height}/${variant.locale})`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: translate(key, variant.locale), exact: true });
    let externalRequests = 0;
    try {
      await page.setViewportSize({ width: variant.width, height: variant.height });
      await page.route('https://speech.invalid/**', async (route) => {
        externalRequests++;
        await route.abort();
      });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
        runtimeResponses: { AI_SETTINGS_QUERY: speechModelResponse },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await installSpeechPortFixture(page);
      await openReview(page);
      await button('gallery.videoReview.advancedEditing').click();
      const header = dialog
        .locator('[data-ui="gallery.videoReview.trackHeader"]')
        .filter({ hasText: translate('gallery.videoReview.audioVoiceover', variant.locale) });
      const chooser = page.waitForEvent('filechooser');
      await header
        .getByRole('button', {
          name: translate('gallery.videoReview.audioImport', variant.locale),
          exact: true,
        })
        .click();
      await (
        await chooser
      ).setFiles({
        name: 'synthetic-voice.wav',
        mimeType: 'audio/wav',
        buffer: syntheticSpeechWav(6),
      });
      const voice = dialog.getByRole('button', {
        name: `${translate('gallery.videoReview.audioVoiceover', variant.locale)} · synthetic-voice.wav`,
        exact: true,
      });
      await voice.click();
      await expect.poll(() => persistedSpeech(page)).not.toBeNull();
      const originalAssetId = (await persistedSpeech(page))!.clip.assetId;
      const panel = dialog.locator('[data-ui="gallery.videoReview.speechPanel"]');
      if (!(await panel.isVisible()))
        await dialog
          .getByRole('heading', {
            name: translate('gallery.videoReview.speechTitle', variant.locale),
            exact: true,
          })
          .click();
      await expect(panel).toBeVisible();
      if (variant.width < 1280) {
        const workspaceScroll = dialog.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
        await expect
          .poll(() => workspaceScroll.evaluate((node) => node.scrollWidth - node.clientWidth))
          .toBeGreaterThan(0);
        await workspaceScroll.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
      }
      await panel
        .getByRole('button', {
          name: translate('gallery.videoReview.speechRecognize', variant.locale),
          exact: true,
        })
        .click();
      const phrases = panel.locator('[data-ui="gallery.videoReview.speechPhrase"]');
      await expect(phrases).toHaveCount(3);
      const middle = phrases.nth(1);
      const text = middle.getByRole('textbox', {
        name: translate('gallery.videoReview.speechText', variant.locale),
        exact: true,
      });
      await expect(text).toHaveValue('Middle phrase.');
      await text.fill('An overflow phrase.');
      await text.press('Tab');
      await expect
        .poll(async () => (await persistedSpeech(page))?.clip.transcript?.phrases[1]?.text)
        .toBe('An overflow phrase.');
      await middle
        .getByRole('button', {
          name: translate('gallery.videoReview.speechGenerate', variant.locale),
          exact: true,
        })
        .click();
      const preview = middle.locator('[data-ui="gallery.videoReview.speechPreview"] audio');
      await expect(preview).toBeVisible();
      await expect
        .poll(() => preview.evaluate((node: HTMLAudioElement) => node.duration))
        .toBeCloseTo(3, 4);
      await expect(
        middle.getByRole('button', {
          name: translate('gallery.videoReview.speechApply', variant.locale),
          exact: true,
        })
      ).toBeDisabled();
      expect((await persistedSpeech(page))!.clip.transcript!.replacements).toHaveLength(0);
      await preview.scrollIntoViewIfNeeded();
      await expect(preview).toBeInViewport();
      await page.screenshot({ path: info.outputPath('speech-overflow.png'), fullPage: false });
      await text.fill('Edited middle phrase.');
      await text.press('Tab');
      await expect
        .poll(async () => (await persistedSpeech(page))?.clip.transcript?.phrases[1]?.text)
        .toBe('Edited middle phrase.');
      await middle
        .getByRole('button', {
          name: translate('gallery.videoReview.speechGenerate', variant.locale),
          exact: true,
        })
        .click();
      await expect(preview).toBeVisible();
      await expect
        .poll(() => preview.evaluate((node: HTMLAudioElement) => node.duration))
        .toBeCloseTo(1, 4);
      await preview.evaluate((node: HTMLAudioElement) => node.play());
      await expect
        .poll(() => preview.evaluate((node: HTMLAudioElement) => node.currentTime))
        .toBeGreaterThan(0);
      await preview.evaluate((node: HTMLAudioElement) => node.pause());
      const apply = middle.getByRole('button', {
        name: translate('gallery.videoReview.speechApply', variant.locale),
        exact: true,
      });
      await apply.scrollIntoViewIfNeeded();
      await expect(apply).toBeInViewport();
      await expect(apply).toBeEnabled();
      await page.screenshot({ path: info.outputPath('speech-preview.png'), fullPage: false });
      await apply.click();
      await expect
        .poll(async () => (await persistedSpeech(page))?.clip.transcript?.replacements.length)
        .toBe(1);
      const accepted = (await persistedSpeech(page))!;
      const generatedAssetId = accepted.clip.transcript!.replacements[0]!.assetId;
      expect(generatedAssetId).not.toBe(originalAssetId);
      expect(accepted.clip.assetId).toBe(originalAssetId);
      expect(
        accepted.plan.map((entry) => ({
          assetId: entry.assetId,
          start: entry.timelineStart,
          duration: entry.duration,
          offset: entry.sourceOffset,
        }))
      ).toEqual([
        { assetId: originalAssetId, start: 0, duration: 2, offset: 0 },
        { assetId: generatedAssetId, start: 2, duration: 1, offset: 0 },
        { assetId: originalAssetId, start: 4, duration: 2, offset: 4 },
      ]);
      await button('gallery.videoReview.undo').click();
      await expect
        .poll(async () => (await persistedSpeech(page))?.clip.transcript?.replacements.length)
        .toBe(0);
      expect((await persistedSpeech(page))!.plan).toMatchObject([
        { assetId: originalAssetId, duration: 6 },
      ]);
      await button('gallery.videoReview.redo').click();
      await expect
        .poll(async () => (await persistedSpeech(page))?.clip.transcript?.replacements[0]?.assetId)
        .toBe(generatedAssetId);
      const calls = await page.evaluate(() => Reflect.get(window, 'speechFixtureRequests'));
      expect(calls).toEqual([
        { operation: 'transcription' },
        { operation: 'input', inputBytes: 192044, wav: true },
        { operation: 'speech', text: 'An overflow phrase.' },
        { operation: 'speech', text: 'Edited middle phrase.' },
      ]);
      await button('gallery.videoReview.back').click();
      await page.reload();
      await installSpeechPortFixture(page);
      await openReview(page);
      await voice.click();
      if (!(await panel.isVisible()))
        await dialog
          .getByRole('heading', {
            name: translate('gallery.videoReview.speechTitle', variant.locale),
            exact: true,
          })
          .click();
      await expect(phrases).toHaveCount(3);
      await expect(text).toHaveValue('Edited middle phrase.');
      expect((await persistedSpeech(page))!.clip.transcript!.replacements[0]!.assetId).toBe(
        generatedAssetId
      );
      expect((await persistedSpeech(page))!.plan).toEqual(accepted.plan);
      expect(await page.evaluate(() => Reflect.get(window, 'speechFixtureRequests'))).toEqual([]);
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('speech-restored.png'), fullPage: false });
      const restore = panel.getByRole('button', {
        name: translate('gallery.videoReview.speechRestore', variant.locale),
        exact: true,
      });
      await restore.scrollIntoViewIfNeeded();
      await expect(restore).toBeInViewport();
      await page.screenshot({ path: info.outputPath('speech-footer.png'), fullPage: false });
      await restore.focus();
      await restore.press('Enter');
      await expect
        .poll(async () => (await persistedSpeech(page))?.clip.transcript?.replacements.length)
        .toBe(0);
      expect((await persistedSpeech(page))!.plan).toMatchObject([
        { assetId: originalAssetId, duration: 6 },
      ]);
      await button('gallery.videoReview.undo').click();
      await expect
        .poll(async () => (await persistedSpeech(page))?.clip.transcript?.replacements[0]?.assetId)
        .toBe(generatedAssetId);
      expect(externalRequests).toBe(0);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
