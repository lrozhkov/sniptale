import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { openRealPopup, sendRuntimeMessage } from '../support/recording-action';
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
  test(`voice settings follow the selected recognition backend ${viewport.name} ${locale}`, async ({}, info) => {
    await withVoiceBrowser(viewport.size, locale, async ({ page, extensionId, provider }) => {
      const backend = ui(page, 'settings.voice.backend');
      const choose = (
        key:
          | 'settings.voiceInput.backendOff'
          | 'settings.voiceInput.backendBrowser'
          | 'settings.voiceInput.backendModel'
      ) => backend.getByRole('button', { name: translate(key, locale), exact: true });
      const draft = `${CORRECTION_PROMPT} Draft kept across recognition changes.`;
      await ui(page, 'settings.voice.correction-prompt').fill(draft);
      await expect(
        page.getByLabel(translate('settings.voiceInput.modeLabel', locale), { exact: true })
      ).toHaveCount(0);
      await backend.scrollIntoViewIfNeeded();
      await choose('settings.voiceInput.backendBrowser').click();
      await expect(choose('settings.voiceInput.backendBrowser')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      for (const field of [
        'transcription-model',
        'correction',
        'correction-model',
        'correction-prompt',
      ])
        await expect(ui(page, `settings.voice.${field}`)).toHaveCount(0);
      await expect(
        page.getByLabel(translate('settings.voiceInput.modeLabel', locale), { exact: true })
      ).toBeVisible();
      await expect(
        page.getByLabel(translate('settings.voiceInput.microphoneLabel', locale), { exact: true })
      ).toBeVisible();
      await page
        .getByText(translate('settings.voiceInput.diagnosticsTitle', locale), { exact: true })
        .click();
      await expect(
        page.getByText(translate('settings.voiceInput.apiStatus', locale), { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText(translate('settings.voiceInput.packageStatus', locale), { exact: true })
      ).toBeVisible();
      await backend.scrollIntoViewIfNeeded();
      await voiceScreenshot(page, info, 'chrome-recognition-settings');
      await expect(ui(page, 'settings.voice.history-refresh')).toHaveCount(0);
      await expect(
        page.getByLabel(translate('settings.voiceInput.languageLabel', locale), { exact: true })
      ).toBeVisible();
      await choose('settings.voiceInput.backendOff').click();
      await expect(choose('settings.voiceInput.backendOff')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect(ui(page, 'settings.voice.start')).toHaveCount(0);
      await expect(page.locator('textarea')).toHaveCount(0);
      await expect(page.getByRole('meter')).toHaveCount(0);
      await expect(page.locator('svg.lucide-mic')).toHaveCount(0);
      await expect(ui(page, 'settings.voice.history-refresh')).toHaveCount(0);
      await voiceScreenshot(page, info, 'disabled-recognition-settings');
      const scenario = await page.context().newPage();
      await scenario.goto(page.url());
      const { field, microphone } = await openNativeVoiceScenario(scenario, extensionId);
      await expect(field).toHaveValue('Original title');
      await expect(microphone).toHaveCount(0);
      await choose('settings.voiceInput.backendBrowser').click();
      await scenario.bringToFront();
      await field.focus();
      await expect(microphone).toBeVisible();
      await choose('settings.voiceInput.backendOff').click();
      await expect(microphone).toHaveCount(0);
      await scenario.close();
      await choose('settings.voiceInput.backendModel').click();
      await expect(ui(page, 'settings.voice.transcription-model')).toContainText(ASR_MODEL_NAME);
      await expect(ui(page, 'settings.voice.correction')).toHaveAttribute('aria-checked', 'true');
      await expect(ui(page, 'settings.voice.correction-prompt')).toHaveValue(draft);
      await expect(
        page.getByLabel(translate('settings.voiceInput.modeLabel', locale), { exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByText(translate('settings.voiceInput.apiStatus', locale), { exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByText(translate('settings.voiceInput.packageStatus', locale), { exact: true })
      ).toHaveCount(0);
      await backend.scrollIntoViewIfNeeded();
      await voiceScreenshot(page, info, 'audio-model-recognition-settings');
      await expect(
        page.getByLabel(translate('settings.voiceInput.languageLabel', locale), { exact: true })
      ).toHaveCount(0);
      await expect(page.locator('a[href="?section=access-data&view=permissions"]')).toHaveCount(0);
      const grid = ui(page, 'settings.voice.test-grid');
      const columns = await grid.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length
      );
      expect(columns).toBe(2);
      expect(provider.uploads).toHaveLength(0);
      expect(provider.corrections).toHaveLength(0);
    });
  });

  test(`voice model catalogs keep disabled approvals unresolved ${viewport.name} ${locale}`, async ({}, info) => {
    await withVoiceBrowser(viewport.size, locale, async ({ page, extensionId, provider }) => {
      const before = await page.evaluate(() => chrome.storage.sync.get('sniptale_settings'));
      await page.goto(
        `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=ai-connections`
      );
      const toggle = page
        .getByRole('region', {
          name: translate('settings.aiProviders.providersTitle', locale),
          exact: true,
        })
        .getByRole('switch');
      await toggle.click();
      await expect(toggle).not.toBeChecked();
      await openVoiceSettings(page, extensionId);
      for (const [kind, code] of [
        ['transcription', 'synthetic-asr'],
        ['correction', 'synthetic-text'],
      ]) {
        const field = ui(page, `settings.voice.${kind}-model`);
        await expect(field.getByRole('alert')).toContainText(
          translate('aiModal.modelSelectionUnavailable', locale)
        );
        await expect(field.getByRole('alert')).toContainText(code);
      }
      await expect(ui(page, 'settings.voice.correction-prompt')).toHaveValue(CORRECTION_PROMPT);
      const refresh = page.getByRole('button', {
        name: translate('settings.voiceInput.reloadModels', locale),
        exact: true,
      });
      await refresh.scrollIntoViewIfNeeded();
      await refresh.click();
      await expect(refresh).toBeEnabled();
      await expect(ui(page, 'settings.voice.transcription-model').getByRole('alert')).toContainText(
        'synthetic-asr'
      );
      await ui(page, 'settings.voice.correction-model').scrollIntoViewIfNeeded();
      await voiceScreenshot(page, info, 'unavailable-voice-models');
      expect(await page.evaluate(() => chrome.storage.sync.get('sniptale_settings'))).toEqual(
        before
      );
      expect(provider.uploads).toHaveLength(0);
      expect(provider.corrections).toHaveLength(0);
    });
  });

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
      await expect(ui(page, 'settings.voice.history-refresh')).toHaveCount(0);
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
    await expect(ui(page, 'settings.voice.history-refresh')).toHaveCount(0);
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
    await expect(ui(page, 'settings.voice.history-refresh')).toHaveCount(0);
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

test('global Off reaches another Settings window during capture and model processing', async ({}, info) => {
  await withVoiceBrowser(
    PRIMARY_BROWSER_VIEWPORTS[1].size,
    'en',
    async ({ page, extensionId, provider }) => {
      const field = page.getByRole('textbox', {
        name: translate('settings.voiceInput.textareaLabel', 'en'),
        exact: true,
      });
      provider.hold('asr');
      await recordSettingsMicrophone(page);
      await expect.poll(() => provider.uploads.length).toBe(1);
      const other = await page.context().newPage();
      await openVoiceSettings(other, extensionId);
      const choose = (mode: 'backendOff' | 'backendModel') =>
        ui(other, 'settings.voice.backend').getByRole('button', {
          name: translate(`settings.voiceInput.${mode}`, 'en'),
          exact: true,
        });
      await choose('backendOff').click();
      await expect(
        ui(page, 'settings.voice.backend').getByRole('button', {
          name: translate('settings.voiceInput.backendOff', 'en'),
          exact: true,
        })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(field).toHaveCount(0);
      await expect(ui(page, 'settings.voice.history-refresh')).toHaveCount(0);
      await expect(page.locator('svg.lucide-mic')).toHaveCount(0);
      await expect.poll(async () => (await readVoiceEntries(page))[0]?.status).toBe('cancelled');
      provider.respond('asr');
      await choose('backendModel').click();
      await expect(field).toHaveValue('');
      expect(provider.corrections).toHaveLength(0);
      await page.bringToFront();
      await ui(page, 'settings.voice.start').click();
      await expect(ui(page, 'settings.voice.stop')).toBeVisible();
      await other.bringToFront();
      await choose('backendOff').click();
      await expect(ui(page, 'settings.voice.stop')).toHaveCount(0);
      await expect(field).toHaveCount(0);
      await expect.poll(async () => (await readVoiceEntries(page))[0]?.status).toBe('cancelled');
      expect(provider.uploads).toHaveLength(1);
      await voiceScreenshot(page, info, 'settings-global-off-revokes-other-window');
      await other.close();
    }
  );
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
      provider.hold('asr');
      await microphone.click();
      await expect(microphone).toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(800);
      await microphone.click();
      await expect.poll(() => provider.uploads.length).toBe(3);
      const settings = await page.context().newPage();
      await openVoiceSettings(settings, extensionId);
      await ui(settings, 'settings.voice.backend')
        .getByRole('button', {
          name: translate('settings.voiceInput.backendOff', 'en'),
          exact: true,
        })
        .click();
      await expect(microphone).toHaveCount(0);
      await field.fill('Edited after global voice input was disabled');
      provider.respond('asr');
      await expect.poll(async () => (await readVoiceEntries(page))[0]?.status).toBe('cancelled');
      await expect(field).toHaveValue('Edited after global voice input was disabled');
      expect(provider.corrections).toHaveLength(1);
      await voiceScreenshot(page, info, 'scenario-global-off-prevents-late-insertion');
      await settings.close();
    }
  );
});

test('native content field keeps click recording and applies the saved correction prompt', async ({}, info) => {
  const host = await startHostServer();
  try {
    await withVoiceBrowser(
      PRIMARY_BROWSER_VIEWPORTS[0].size,
      'en',
      async ({ page: settings, extensionId, provider, context }) => {
        const page = await context.newPage();
        await page.goto(host.origin);
        const popup = await openRealPopup(context, extensionId);
        await popup.evaluate((origin) => {
          const grant = document.createElement('button');
          grant.textContent = 'Grant voice test site';
          grant.onclick = async () => {
            grant.dataset['granted'] = String(
              await chrome.permissions.request({ origins: [`${origin}/*`] })
            );
          };
          document.body.append(grant);
        }, host.origin);
        const grant = popup.getByRole('button', { name: 'Grant voice test site', exact: true });
        await grant.click();
        await expect(grant).toHaveAttribute('data-granted', 'true');
        const tabId = await popup.evaluate(async (url) => {
          const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
          if (tab?.id === undefined) throw new Error('Voice source tab missing');
          return tab.id;
        }, page.url());
        await page.reload();
        expect(
          await sendRuntimeMessage(popup, {
            type: 'PAGE_ACCESS',
            operation: 'register-granted-site',
            tabId,
          })
        ).toMatchObject({ success: true });
        await popup.evaluate(
          (id) =>
            chrome.tabs.sendMessage(id, {
              type: 'ENABLE_SCREENSHOT_MODE',
              workingMode: 'highlighter',
            }),
          tabId
        );
        await page.bringToFront();
        await ui(page, 'content.toolbar.mode-selector-button').click();
        await ui(page, 'content.toolbar.mode-option.quick-edit').click();
        await ui(page, 'content.toolbar.page-editing-mode.ai').click();
        await expect(page.locator('.sniptale-ai-modal-root')).toBeVisible();
        const field = page.locator('#ai-prompt');
        const microphone = ui(page, 'content.ai-modal.prompt-voice-input');
        await expect(field).toBeVisible();
        await field.fill('');
        await microphone.click();
        await expect(microphone).toHaveAttribute('aria-pressed', 'true');
        await page.waitForTimeout(800);
        await expect(microphone).toHaveAttribute('aria-pressed', 'true');
        await microphone.click();
        await expect(field).toHaveValue(CORRECTED_TRANSCRIPT);
        expect(provider.corrections).toEqual([
          {
            model: 'synthetic-text',
            messages: [
              { role: 'system', content: CORRECTION_PROMPT },
              { role: 'user', content: RAW_TRANSCRIPT },
            ],
          },
        ]);
        await voiceScreenshot(page, info, 'content-click-corrected');
        await settings.bringToFront();
        const prompt = ui(settings, 'settings.voice.correction-prompt');
        await prompt.fill('Return only the dictated sentence in uppercase.');
        await ui(settings, 'settings.voice.prompt-save').click();
        await expect(ui(settings, 'settings.voice.prompt-save')).toBeDisabled();
        await page.bringToFront();
        await field.fill('');
        await microphone.hover();
        await page.mouse.down();
        await page.waitForTimeout(800);
        await page.mouse.up();
        await expect(field).toHaveValue(CORRECTED_TRANSCRIPT);
        expect(provider.corrections).toHaveLength(2);
        expect(provider.corrections[1]).toMatchObject({
          messages: [
            { role: 'system', content: 'Return only the dictated sentence in uppercase.' },
            { role: 'user', content: RAW_TRANSCRIPT },
          ],
        });
        await settings.bringToFront();
        await ui(settings, 'settings.voice.correction').click();
        await expect(ui(settings, 'settings.voice.correction')).toHaveAttribute(
          'aria-checked',
          'false'
        );
        await page.bringToFront();
        await field.fill('');
        await microphone.click();
        await page.waitForTimeout(800);
        await microphone.click();
        await expect(field).toHaveValue(RAW_TRANSCRIPT);
        expect(provider.corrections).toHaveLength(2);
        expect(provider.uploads).toHaveLength(3);
        await popup.close();
      }
    );
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  test(`voice history supports native selection, expansion and audio download ${viewport.name}`, async ({}, info) => {
    await withVoiceBrowser(viewport.size, locale, async ({ page, provider }) => {
      await ui(page, 'settings.voice.correction').click();
      const text = 'A complete dictated sentence with a selectable transcript. '.repeat(35).trim();
      provider.setTranscript(text);
      await recordSettingsMicrophone(page);
      const row = ui(page, 'settings.voice.history-row').first();
      const paragraph = row.locator('p').filter({ hasText: text });
      await expect(paragraph).toHaveText(text);
      await expect(paragraph).toHaveCSS('user-select', 'text');
      const expand = ui(row, 'settings.voice.history-expand');
      await expect(expand).toBeVisible();
      const previewBounds = (await paragraph.boundingBox())!;
      const expandBounds = (await expand.boundingBox())!;
      expect(expandBounds.y + expandBounds.height).toBeLessThanOrEqual(
        previewBounds.y + previewBounds.height + 1
      );
      await expect(ui(page, 'settings.voice.history-refresh')).toHaveCount(0);
      await expect(
        page.getByRole('button', {
          name: translate('settings.voiceInput.refresh', locale),
          exact: true,
        })
      ).toHaveCount(0);
      const field = page.getByRole('textbox', {
        name: translate('settings.voiceInput.textareaLabel', locale),
        exact: true,
      });
      const microphone = ui(page, 'settings.voice.microphone-test');
      await field.scrollIntoViewIfNeeded();
      const left = (await microphone.boundingBox())!;
      const right = (await field.boundingBox())!;
      expect(left.x + left.width).toBeLessThanOrEqual(right.x);
      const meter = (await page.getByRole('meter').boundingBox())!;
      expect(Math.abs(meter.y - right.y)).toBeLessThanOrEqual(2);
      await expect(
        page.getByText(translate('settings.voiceInput.textareaLabel', locale), { exact: true })
      ).toHaveCount(0);
      const actions = ui(row, 'settings.voice.history-actions').locator('button');
      await expect(actions).toHaveCount(5);
      for (const action of await actions.all()) {
        await expect(action).toHaveAccessibleName(/.+/);
        expect(await action.innerText()).toBe('');
        const box = (await action.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(24);
        expect(box.width).toBeLessThanOrEqual(36);
      }
      const contentScroll = ui(page, 'settings.page.content-scroll');
      const historyList = ui(page, 'settings.voice.history').getByRole('list');
      const historyHeading = ui(page, 'settings.voice.history').getByRole('heading');
      await contentScroll.evaluate((node) => {
        node.scrollTop = 0;
      });
      const initialHeight = await contentScroll.evaluate((node) => node.scrollHeight);
      const initialHeading = (await historyHeading.boundingBox())!;
      await voiceScreenshot(page, info, `history-compact-${viewport.name}`);
      await expand.click();
      expect(await contentScroll.evaluate((node) => node.scrollHeight)).toBeLessThanOrEqual(
        initialHeight + 1
      );
      expect(
        Math.abs((await historyHeading.boundingBox())!.y - initialHeading.y)
      ).toBeLessThanOrEqual(1);
      expect(
        await historyList.evaluate((node) => node.scrollHeight - node.clientHeight)
      ).toBeGreaterThan(0);
      await expect(historyList).toHaveCSS('overflow-y', 'auto');
      await expect(paragraph).toBeFocused();
      await paragraph.click({ clickCount: 3 });
      await expect.poll(() => page.evaluate(() => getSelection()?.toString().trim())).toBe(text);
      await page.keyboard.press('Control+c');
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(text);
      const downloadEvent = page.waitForEvent('download');
      await ui(row, 'settings.voice.history-download').click();
      const download = await downloadEvent;
      expect(download.suggestedFilename()).toMatch(/^dictation-\d+\.wav$/u);
      const path = await download.path();
      if (!path) throw new Error('Downloaded audio path missing');
      const audio = await readFile(path);
      expect(audio.toString('ascii', 0, 4)).toBe('RIFF');
      const entry = (await readVoiceEntries(page))[0]!;
      expect(audio.length).toBe(entry.byteLength);
      await expect(ui(row, 'settings.voice.history-text')).toHaveText(text);
      await voiceScreenshot(page, info, `history-expanded-${viewport.name}`);
      await page.setViewportSize({ width: 1100, height: 560 });
      const outer = page.locator('.sniptale-settings-viewport');
      expect(await outer.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeGreaterThan(
        0
      );
      await ui(row, 'settings.voice.history-copy').scrollIntoViewIfNeeded();
      await ui(row, 'settings.voice.history-copy').click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(text);
      await page.setViewportSize(viewport.size);
      for (let index = 0; index < 5; index += 1) {
        await recordSettingsMicrophone(page);
        await expect(ui(page, 'settings.voice.history-row')).toHaveCount(index + 2);
      }
      await contentScroll.evaluate((node) => {
        node.scrollTop = 0;
      });
      await historyList.evaluate((node) => {
        node.scrollTop = 0;
      });
      await expect(ui(page, 'settings.voice.history').locator('dl')).toHaveCount(0);
      expect(await historyList.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(
        true
      );
      const headerBefore = (await historyHeading.boundingBox())!;
      const outerBefore = await contentScroll.evaluate((node) => ({
        top: node.scrollTop,
        height: node.scrollHeight,
      }));
      await historyList.hover();
      await page.mouse.wheel(0, 10000);
      await expect.poll(() => historyList.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      expect(
        await contentScroll.evaluate((node) => ({ top: node.scrollTop, height: node.scrollHeight }))
      ).toEqual(outerBefore);
      expect(
        Math.abs((await historyHeading.boundingBox())!.y - headerBefore.y)
      ).toBeLessThanOrEqual(1);
      const lastRow = ui(page, 'settings.voice.history-row').last();
      await ui(lastRow, 'settings.voice.history-play').click();
      await expect(ui(lastRow, 'settings.voice.history-audio')).toBeVisible();
      await ui(lastRow, 'settings.voice.history-play').click();
      await ui(lastRow, 'settings.voice.history-delete').click();
      await expect(ui(lastRow, 'settings.voice.history-delete-cancel')).toBeFocused();
      await ui(lastRow, 'settings.voice.history-delete-cancel').click();
      await voiceScreenshot(page, info, `history-list-scroll-${viewport.name}`);
    });
  });
}
