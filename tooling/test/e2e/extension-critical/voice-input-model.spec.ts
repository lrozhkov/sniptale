import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import {
  ASR_MODEL_NAME,
  CORRECTED_TRANSCRIPT,
  CORRECTION_PROMPT,
  RAW_TRANSCRIPT,
  captureVoicePreferences,
  proveCompactVoiceReachability,
  openNativeVoiceScenario,
  openVoiceSettings,
  readVoiceEntries,
  readVoiceStorage,
  recordSettingsMicrophone,
  ui,
  voiceScreenshot,
  withVoiceBrowser,
} from './voice-input-model.test-support';

test.use({ actionTimeout: 10_000 });
test.setTimeout(120_000);

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  test(`native model dictation settings pipeline and private history ${viewport.name} ${locale}`, async ({}, info) => {
    await withVoiceBrowser(viewport.size, locale, async ({ page, extensionId, provider }) => {
      await captureVoicePreferences(page, info, viewport.name);
      const field = page.getByRole('textbox', {
        name: translate('settings.voiceInput.textareaLabel', locale),
        exact: true,
      });
      provider.hold('asr');
      provider.hold('correction');
      await recordSettingsMicrophone(page);
      await expect.poll(() => provider.uploads.length).toBe(1);
      await expect(field).toHaveValue('');
      expect(provider.uploads[0]).toMatchObject({
        magic: 'WAVE',
        format: 1,
        channels: 1,
        sampleRate: 16000,
        sampleBits: 16,
        filenameIsPrivate: true,
        modelIsSelected: true,
      });
      expect(provider.uploads[0]!.dataBytes).toBeGreaterThan(0);
      await expect(ui(page, 'settings.voice.cancel')).toBeEnabled();
      await expect(ui(page, 'settings.voice.start')).toBeDisabled();
      provider.respond('asr');
      await expect.poll(() => provider.corrections.length).toBe(1);
      await expect(field).toHaveValue('');
      expect(provider.corrections).toEqual([
        {
          model: 'synthetic-text',
          messages: [
            { role: 'system', content: CORRECTION_PROMPT },
            { role: 'user', content: RAW_TRANSCRIPT },
          ],
        },
      ]);
      provider.respond('correction');
      await expect(field).toHaveValue(CORRECTED_TRANSCRIPT);
      await expect(ui(page, 'settings.voice.start')).toBeEnabled();
      await ui(page, 'settings.voice.history-refresh').click();
      const row = ui(page, 'settings.voice.history-row');
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute('data-status', 'ready');
      await expect(row).toContainText(CORRECTED_TRANSCRIPT);
      const first = (await readVoiceEntries(page))[0]!;
      expect(first).toMatchObject({
        backend: 'model',
        rawTranscript: RAW_TRANSCRIPT,
        transcript: CORRECTED_TRANSCRIPT,
        correctionStatus: 'applied',
        mimeType: 'audio/wav',
      });
      expect(await readVoiceStorage(page)).toMatchObject({ libraryCount: 0, privateAudio: 1 });
      await ui(row, 'settings.voice.history-play').click();
      const audio = ui(row, 'settings.voice.history-audio');
      await expect(audio).toBeVisible();
      await expect
        .poll(() =>
          audio
            .evaluate((node) => (node instanceof HTMLAudioElement ? node.currentTime : 0))
            .catch(() => 0)
        )
        .toBeGreaterThan(0.05);
      await ui(row, 'settings.voice.history-copy').click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(CORRECTED_TRANSCRIPT);
      await ui(row, 'settings.voice.history-retry').click();
      await expect.poll(() => provider.uploads.length).toBe(2);
      await expect.poll(() => provider.corrections.length).toBe(2);
      await expect(ui(row, 'settings.voice.history-retry')).toBeEnabled();
      const retried = (await readVoiceEntries(page))[0]!;
      expect(retried).toMatchObject({
        entryId: first.entryId,
        incarnation: first.incarnation,
        sequence: first.sequence,
        createdAt: first.createdAt,
        transcript: CORRECTED_TRANSCRIPT,
      });
      expect(retried.revision).toBeGreaterThan(first.revision);
      await row.scrollIntoViewIfNeeded();
      await voiceScreenshot(page, info, 'private-history-ready');
      await page.reload();
      await expect(row).toContainText(CORRECTED_TRANSCRIPT);
      await ui(row, 'settings.voice.history-delete').click();
      await expect(ui(row, 'settings.voice.history-delete-cancel')).toBeFocused();
      await ui(row, 'settings.voice.history-delete-confirm').click();
      await expect(row).toHaveCount(0);
      await expect.poll(async () => (await readVoiceStorage(page)).privateAudio).toBe(0);
      expect(await readVoiceEntries(page)).toEqual([]);
      expect((await readVoiceStorage(page)).libraryCount).toBe(0);
      if (index === 0) {
        await page.setViewportSize({ width: 900, height: 640 });
        await openVoiceSettings(page, extensionId);
        const horizontal = page.locator('.sniptale-settings-viewport');
        await horizontal.evaluate((node) => {
          node.scrollLeft = 0;
        });
        await ui(page, 'settings.voice.transcription-model')
          .locator('.sniptale-ai-model-selector-trigger')
          .click();
        await expect(page.getByRole('button', { name: ASR_MODEL_NAME, exact: true })).toBeVisible();
        await expect(
          page.getByRole('button', { name: ASR_MODEL_NAME, exact: true })
        ).toBeInViewport({
          ratio: 1,
        });
        await voiceScreenshot(page, info, 'compact-model-menu');
        await page.keyboard.press('Escape');
        await proveCompactVoiceReachability(page, info);
      }
    });
  });
}

test('native ASR failure retains audio and retries without inserting a partial result', async ({}, info) => {
  await withVoiceBrowser(PRIMARY_BROWSER_VIEWPORTS[0].size, 'en', async ({ page, provider }) => {
    provider.respond('asr', 'error');
    await recordSettingsMicrophone(page);
    const field = page.getByRole('textbox', {
      name: translate('settings.voiceInput.textareaLabel', 'en'),
      exact: true,
    });
    await expect(ui(page, 'settings.voice.start')).toBeEnabled();
    await expect(field).toHaveValue('');
    await ui(page, 'settings.voice.history-refresh').click();
    const row = ui(page, 'settings.voice.history-row');
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-status', 'failed');
    const original = (await readVoiceEntries(page))[0]!;
    expect(original).toMatchObject({
      status: 'failed',
      rawTranscript: null,
      transcript: null,
      failureCode: 'provider-failed',
    });
    expect(await readVoiceStorage(page)).toMatchObject({ privateAudio: 1, libraryCount: 0 });
    await expect(ui(row, 'settings.voice.history-play')).toBeEnabled();
    await expect(ui(row, 'settings.voice.history-copy')).toBeDisabled();
    expect(provider.uploads).toHaveLength(1);
    expect(provider.corrections).toHaveLength(0);
    await row.scrollIntoViewIfNeeded();
    await voiceScreenshot(page, info, 'asr-failure-audio-recovery');
    provider.respond('asr');
    await ui(row, 'settings.voice.history-retry').click();
    await expect.poll(() => provider.uploads.length).toBe(2);
    await expect.poll(() => provider.corrections.length).toBe(1);
    await expect(row).toHaveAttribute('data-status', 'ready');
    await expect(row).toContainText(CORRECTED_TRANSCRIPT);
    const retried = (await readVoiceEntries(page))[0]!;
    expect(retried).toMatchObject({
      entryId: original.entryId,
      incarnation: original.incarnation,
      audioDigest: original.audioDigest,
      sequence: original.sequence,
      createdAt: original.createdAt,
      failureCode: null,
    });
    expect(retried.revision).toBeGreaterThan(original.revision);
    await expect(field).toHaveValue('');
    expect(await readVoiceStorage(page)).toMatchObject({ privateAudio: 1, libraryCount: 0 });
  });
});

test('native correction failure preserves raw text and original audio for explicit retry', async ({}, info) => {
  await withVoiceBrowser(PRIMARY_BROWSER_VIEWPORTS[0].size, 'en', async ({ page, provider }) => {
    provider.respond('correction', 'error');
    await recordSettingsMicrophone(page);
    const field = page.getByRole('textbox', {
      name: translate('settings.voiceInput.textareaLabel', 'en'),
      exact: true,
    });
    await expect(field).toHaveValue(RAW_TRANSCRIPT);
    await ui(page, 'settings.voice.history-refresh').click();
    const row = ui(page, 'settings.voice.history-row');
    await expect(row).toContainText(RAW_TRANSCRIPT);
    const original = (await readVoiceEntries(page))[0]!;
    expect(original).toMatchObject({
      status: 'ready',
      correctionStatus: 'failed',
      rawTranscript: RAW_TRANSCRIPT,
      transcript: RAW_TRANSCRIPT,
    });
    expect(await readVoiceStorage(page)).toMatchObject({ privateAudio: 1, libraryCount: 0 });
    expect(provider.uploads).toHaveLength(1);
    expect(provider.corrections).toHaveLength(1);
    await row.scrollIntoViewIfNeeded();
    await voiceScreenshot(page, info, 'correction-failure-raw-recovery');
    provider.respond('correction');
    await ui(row, 'settings.voice.history-retry').click();
    await expect.poll(() => provider.corrections.length).toBe(2);
    await expect(row).toContainText(CORRECTED_TRANSCRIPT);
    expect((await readVoiceEntries(page))[0]).toMatchObject({
      entryId: original.entryId,
      audioDigest: original.audioDigest,
      correctionStatus: 'applied',
    });
    expect(provider.uploads).toHaveLength(2);
    expect((await readVoiceStorage(page)).privateAudio).toBe(1);
  });
});

test('native scenario global model and Cancel prevent late insertion', async ({}, info) => {
  await withVoiceBrowser(
    PRIMARY_BROWSER_VIEWPORTS[1].size,
    'en',
    async ({ page, extensionId, provider }) => {
      const { field, microphone } = await openNativeVoiceScenario(page, extensionId);
      await field.fill('');
      provider.hold('asr');
      await microphone.click();
      await expect(microphone).toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(800);
      await microphone.click();
      await expect.poll(() => provider.uploads.length).toBe(1);
      await expect(field).toHaveValue('');
      provider.respond('asr');
      await expect(field).toHaveValue(CORRECTED_TRANSCRIPT);
      expect(provider.corrections).toHaveLength(1);
      await voiceScreenshot(page, info, 'scenario-global-model-final');
      provider.hold('asr');
      await field.fill('Keep my text');
      await microphone.click();
      await expect(microphone).toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(800);
      await microphone.click();
      await expect.poll(() => provider.uploads.length).toBe(2);
      await expect(microphone).toHaveAttribute(
        'aria-label',
        translate('settings.voiceInput.cancel', 'en')
      );
      await microphone.click();
      await field.fill('User edited while processing');
      provider.respond('asr');
      await expect.poll(async () => (await readVoiceEntries(page))[0]?.status).toBe('cancelled');
      await expect(microphone).toHaveAttribute(
        'aria-label',
        translate('scenario.editor.guideVoiceStart', 'en')
      );
      await expect(field).toHaveValue('User edited while processing');
      expect(provider.corrections).toHaveLength(1);
      expect((await readVoiceStorage(page)).libraryCount).toBe(0);
      await voiceScreenshot(page, info, 'scenario-cancel-keeps-manual-text');
    }
  );
});
