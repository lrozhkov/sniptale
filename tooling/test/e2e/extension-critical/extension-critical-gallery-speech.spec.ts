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

test('explicit speech batch publishes selected phrases to their own clips', async ({
  page,
}, info) => {
  const host = await startHostServer();
  const dialog = page.locator('dialog');
  const panel = dialog.locator('[data-ui="gallery.videoReview.speechPanel"]');
  const button = (key: Parameters<typeof translate>[0]) =>
    dialog.getByRole('button', { name: translate(key, 'en'), exact: true });
  const voice = (name: string) =>
    dialog.getByRole('button', {
      name: `${translate('gallery.videoReview.audioVoiceover', 'en')} · ${name}`,
      exact: true,
    });
  try {
    await page.setViewportSize({ width: 1280, height: 560 });
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
      runtimeResponses: { AI_SETTINGS_QUERY: speechModelResponse },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.reload();
    await installSpeechPortFixture(page);
    await openReview(page);
    await button('gallery.videoReview.advancedEditing').click();
    const header = dialog
      .locator('[data-ui="gallery.videoReview.trackHeader"]')
      .filter({ hasText: translate('gallery.videoReview.audioVoiceover', 'en') });
    for (const name of ['first-voice.wav', 'second-voice.wav']) {
      const chooser = page.waitForEvent('filechooser');
      await header
        .getByRole('button', {
          name: translate('gallery.videoReview.audioImport', 'en'),
          exact: true,
        })
        .click();
      await (
        await chooser
      ).setFiles({ name, mimeType: 'audio/wav', buffer: syntheticSpeechWav(6) });
      await voice(name).click();
      if (!(await panel.isVisible()))
        await dialog
          .getByRole('heading', {
            name: translate('gallery.videoReview.speechTitle', 'en'),
            exact: true,
          })
          .click();
      await panel
        .getByRole('button', {
          name: translate('gallery.videoReview.speechRecognize', 'en'),
          exact: true,
        })
        .click();
      await page
        .getByRole('button', {
          name: translate('gallery.videoReview.speechConsentContinue', 'en'),
          exact: true,
        })
        .click();
      await expect(panel.locator('[data-ui="gallery.videoReview.speechPhrase"]')).toHaveCount(3);
    }
    await panel.locator('[data-speech-batch="toggle"]').click();
    const batch = panel.locator('[data-ui="gallery.videoReview.speechBatch"]');
    await expect(batch.locator('section')).toHaveCount(2);
    await expect(
      batch.getByRole('button', {
        name: translate('gallery.videoReview.speechGenerateSelected', 'en'),
        exact: true,
      })
    ).toBeDisabled();
    for (const group of await batch.locator('section').all())
      await group.getByRole('checkbox', { name: 'First phrase.', exact: true }).check();
    await batch
      .getByRole('button', {
        name: translate('gallery.videoReview.speechGenerateSelected', 'en'),
        exact: true,
      })
      .click();
    await page
      .getByRole('button', {
        name: translate('gallery.videoReview.speechConsentContinue', 'en'),
        exact: true,
      })
      .click();
    await expect(
      batch.getByRole('button', {
        name: translate('gallery.videoReview.speechPreview', 'en'),
        exact: true,
      })
    ).toHaveCount(2);
    await expect(panel.getByRole('status')).toHaveText('Generated 2 of 2');
    const previews = batch.getByRole('button', {
      name: translate('gallery.videoReview.speechPreview', 'en'),
      exact: true,
    });
    await previews.first().click();
    await expect(batch.locator('audio')).toHaveCount(1);
    await previews.last().click();
    await expect(batch.locator('audio')).toHaveCount(1);
    await batch.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('speech-batch-two-clips.png'), fullPage: false });
    await batch
      .getByRole('button', {
        name: translate('gallery.videoReview.speechApplySelected', 'en'),
        exact: true,
      })
      .click();
    await expect(
      batch.getByRole('button', {
        name: translate('gallery.videoReview.speechPreview', 'en'),
        exact: true,
      })
    ).toHaveCount(0);
    await expect
      .poll(async () => (await persistedSpeech(page))?.clip.transcript?.replacements.length)
      .toBe(1);
    const accepted = (await persistedSpeech(page))!.clips;
    expect(accepted).toHaveLength(2);
    expect(accepted.map((clip) => clip.transcript?.replacements.length)).toEqual([1, 1]);
    expect(new Set(accepted.map((clip) => clip.transcript?.replacements[0]?.assetId)).size).toBe(2);
    const calls = await page.evaluate(() => Reflect.get(window, 'speechFixtureRequests'));
    expect(calls.filter((call: { operation: string }) => call.operation === 'speech')).toEqual([
      { operation: 'speech', text: 'First phrase.' },
      { operation: 'speech', text: 'First phrase.' },
    ]);
    await button('common.actions.close').click();
    await page.reload();
    await installSpeechPortFixture(page);
    await openReview(page);
    for (const name of ['first-voice.wav', 'second-voice.wav']) {
      await voice(name).click();
      await expect(
        panel.getByRole('button', {
          name: translate('gallery.videoReview.speechRestore', 'en'),
          exact: true,
        })
      ).toBeVisible();
    }
    expect((await persistedSpeech(page))!.clips).toEqual(accepted);
    expect(await page.evaluate(() => Reflect.get(window, 'speechFixtureRequests'))).toEqual([]);
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

async function importSpeechFixture(page: Page, locale: 'en' | 'ru') {
  const dialog = page.locator('dialog');
  const header = dialog
    .locator('[data-ui="gallery.videoReview.trackHeader"]')
    .filter({ hasText: translate('gallery.videoReview.audioVoiceover', locale) });
  const chooser = page.waitForEvent('filechooser');
  await header
    .getByRole('button', {
      name: translate('gallery.videoReview.audioImport', locale),
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
}

/** Publication, edited audio planning and undo/redo use the same durable project evidence. */
async function verifySpeechPublicationHistory(
  page: Page,
  originalAssetId: string,
  locale: 'en' | 'ru'
) {
  const dialog = page.locator('dialog');
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
  await dialog
    .getByRole('button', { name: translate('gallery.videoReview.undo', locale), exact: true })
    .click();
  await expect
    .poll(async () => (await persistedSpeech(page))?.clip.transcript?.replacements.length)
    .toBe(0);
  expect((await persistedSpeech(page))!.plan).toMatchObject([
    { assetId: originalAssetId, duration: 6 },
  ]);
  await dialog
    .getByRole('button', { name: translate('gallery.videoReview.redo', locale), exact: true })
    .click();
  await expect
    .poll(async () => (await persistedSpeech(page))?.clip.transcript?.replacements[0]?.assetId)
    .toBe(generatedAssetId);
  return { accepted, generatedAssetId };
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
      await importSpeechFixture(page, variant.locale);
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
      await page
        .getByRole('button', {
          name: translate('gallery.videoReview.speechConsentContinue', variant.locale),
          exact: true,
        })
        .click();
      const phrases = panel.locator('[data-ui="gallery.videoReview.speechPhrase"]');
      await expect(phrases).toHaveCount(3);
      const middle = phrases.nth(1);
      await middle.locator('button[aria-expanded="false"]').click();
      await middle
        .getByRole('button', {
          name: translate('gallery.videoReview.speechJump', variant.locale),
          exact: true,
        })
        .click();
      await expect
        .poll(() =>
          dialog
            .locator('[data-ui="gallery.videoReview.stage"] video')
            .evaluate((node: HTMLVideoElement) => node.currentTime)
        )
        .toBeCloseTo(2, 2);
      await expect(middle).toHaveAttribute('data-speech-active', 'true');
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
      await page
        .getByRole('button', {
          name: translate('gallery.videoReview.speechConsentContinue', variant.locale),
          exact: true,
        })
        .click();
      const audition = middle.locator('[data-ui="gallery.videoReview.speechAudition"]');
      await audition
        .getByRole('button', {
          name: translate('gallery.videoReview.speechPreview', variant.locale),
          exact: true,
        })
        .click();
      const preview = audition.locator('audio');
      await expect(audition).toBeVisible();
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
      await audition.scrollIntoViewIfNeeded();
      await expect(audition).toBeInViewport();
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
      await expect(audition).toBeVisible();
      await expect
        .poll(() => preview.evaluate((node: HTMLAudioElement) => node.duration))
        .toBeCloseTo(1, 4);
      await audition
        .getByRole('button', {
          name: translate('gallery.videoReview.play', variant.locale),
          exact: true,
        })
        .click();
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
      const auditionPlay = audition.getByRole('button', {
        name: translate('gallery.videoReview.play', variant.locale),
        exact: true,
      });
      await auditionPlay.hover();
      await expect
        .poll(() => auditionPlay.evaluate((node) => getComputedStyle(node).borderTopColor))
        .toBe('rgba(0, 0, 0, 0)');
      await page.screenshot({ path: info.outputPath('speech-preview.png'), fullPage: false });
      await apply.click();
      await expect
        .poll(async () => (await persistedSpeech(page))?.clip.transcript?.replacements.length)
        .toBe(1);
      const { accepted, generatedAssetId } = await verifySpeechPublicationHistory(
        page,
        originalAssetId,
        variant.locale
      );
      const calls = await page.evaluate(() => Reflect.get(window, 'speechFixtureRequests'));
      expect(calls).toEqual([
        { operation: 'transcription' },
        { operation: 'input', inputBytes: 192044, wav: true },
        { operation: 'speech', text: 'An overflow phrase.' },
        { operation: 'speech', text: 'Edited middle phrase.' },
      ]);
      await button('common.actions.close').click();
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
      await middle.locator('button[aria-expanded="false"]').click();
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
