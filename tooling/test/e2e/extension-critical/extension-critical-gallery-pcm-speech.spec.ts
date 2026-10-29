import { expect, test, type Page, type Locator } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AIScenarioSelection } from '../../../../apps/extension/src/contracts/settings/ai-catalog';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { persistedReviewContent, speechModelResponse } from '../support/voiceover-speech-fixture';

const catalog = {
  ...speechModelResponse,
  scenarioSelection: null,
  modelSelection: {
    ...speechModelResponse.modelSelection!,
    providers: speechModelResponse.modelSelection!.providers.map((provider) => ({
      ...provider,
      incarnation: provider.id,
    })),
    models: speechModelResponse.modelSelection!.models.map((model) =>
      model.operation === 'speech'
        ? {
            ...model,
            audio: { speech: { voiceId: 'fixture', responseFormat: 'pcm' as const, speed: 1 } },
          }
        : model
    ),
  },
};

async function activate(button: Locator) {
  await button.scrollIntoViewIfNeeded();
  await button.press('Enter');
}

async function setup(
  page: Page,
  origin: string,
  locale: 'ru' | 'en',
  width: number,
  height: number
) {
  await page.setViewportSize({ width, height });
  await applyHarnessBootstrap(page, {
    preserveMediaLibrary: true,
    storage: {
      'sniptale-locale-preference': locale,
      'sniptale-theme-preference': locale === 'ru' ? 'light' : 'dark',
    },
    runtimeResponses: { AI_SETTINGS_QUERY: catalog, AI_SETTINGS_MUTATION: { success: true } },
  });
  await page.goto(
    `${origin}${GALLERY_HARNESS_PATH}?pcmSpeechFixture=1&theme=${locale === 'ru' ? 'light' : 'dark'}`
  );
  await page.locator('[data-ui="gallery.page.root"]').waitFor();
  await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
  await page.reload();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const open = async () => {
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
  };
  await open();
  const dialog = page.locator('dialog');
  const button = (key: Parameters<typeof translate>[0]) =>
    dialog.getByRole('button', { name: label(key), exact: true });
  await expect(button('gallery.videoReview.advancedEditing')).toBeVisible();
  await activate(button('gallery.videoReview.advancedEditing'));
  await activate(button('gallery.videoReview.textTrackOpen'));
  const document = dialog.locator('[data-ui="gallery.videoReview.textDocument"]');
  await activate(
    document.getByRole('button', {
      name: label('gallery.videoReview.textFragmentAdd'),
      exact: true,
    })
  );
  await document
    .getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
    .fill('PCM first');
  await expect
    .poll(async () => (await persistedReviewContent(page))?.text?.fragments[0]?.text)
    .toBe('PCM first');
  await activate(
    document.getByRole('button', { name: label('gallery.videoReview.textViewCards'), exact: true })
  );
  return { label, dialog, button, document };
}

async function inspectAcceptedWav(page: Page, reference: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const row: unknown = await new Promise((resolve, reject) => {
      const request = db
        .transaction('project_assets', 'readonly')
        .objectStore('project_assets')
        .get(id.slice('project-asset:'.length));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (
      !row ||
      typeof row !== 'object' ||
      !('assetId' in row) ||
      typeof row.assetId !== 'string' ||
      !('mimeType' in row) ||
      typeof row.mimeType !== 'string'
    )
      throw new Error('Missing accepted asset');
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('sniptale-assets');
    const file = await (
      await (await root.getDirectoryHandle('objects')).getFileHandle(row.assetId)
    ).getFile();
    const bytes = await file.arrayBuffer();
    const header = new DataView(bytes);
    const context = new AudioContext({ sampleRate: 24_000 });
    try {
      const decoded = await context.decodeAudioData(bytes.slice(0));
      return {
        mimeType: row.mimeType,
        size: bytes.byteLength,
        rate: header.getUint32(24, true),
        channels: header.getUint16(22, true),
        duration: decoded.duration,
        frames: decoded.length,
        dataBytes: header.getUint32(40, true),
      };
    } finally {
      await context.close();
    }
  }, reference);
}

for (const variant of [
  { locale: 'ru' as const, width: 1280, height: 560 },
  { locale: 'en' as const, width: 1920, height: 900 },
]) {
  test(`remembers authored Gallery voice choice without project changes ${variant.width}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    try {
      const { label, dialog, document } = await setup(
        page,
        host.origin,
        variant.locale,
        variant.width,
        variant.height
      );
      await page.evaluate((response) => {
        const primary = response.modelSelection.models.find(
          (model) => model.operation === 'speech'
        )!;
        const second = {
          ...primary,
          id: '00000000-0000-4000-8000-000000000120',
          displayName: 'Alternate speech',
          modelCode: 'alternate-tts',
        };
        response.modelSelection.models.push(second);
        let remembered: AIScenarioSelection | null = null;
        window.__sniptaleHarness?.setRuntimeResponse('AI_SETTINGS_QUERY', () => ({
          ...response,
          scenarioSelection: remembered,
        }));
        window.__sniptaleHarness?.setRuntimeResponse('AI_SETTINGS_MUTATION', (message: unknown) => {
          if (!message || typeof message !== 'object') return { success: false };
          const choice: unknown = Reflect.get(message, 'selection');
          if (
            !choice ||
            typeof choice !== 'object' ||
            Reflect.get(choice, 'scenario') !== 'gallery-speech'
          )
            return { success: false };
          const model = response.modelSelection.models.find(
            (entry) => entry.id === Reflect.get(choice, 'modelId')
          );
          const provider = response.modelSelection.providers.find(
            (entry) => entry.id === model?.providerId
          );
          if (!model || !provider) return { success: false };
          remembered = {
            modelId: model.id,
            modelCode: model.modelCode,
            providerId: provider.id,
            providerIncarnation: provider.incarnation,
            displayName: model.displayName,
            source: 'explicit',
            selectedAt: Date.now(),
          };
          return { success: true };
        });
      }, catalog);
      const before = await persistedReviewContent(page);
      const open = () =>
        activate(
          document.getByRole('button', {
            name: label('gallery.videoReview.speechGenerate'),
            exact: true,
          })
        );
      await open();
      const voice = dialog.locator('[data-ui="gallery.videoReview.textVoice"]');
      const selector = voice.locator('.sniptale-ai-model-selector-trigger');
      await activate(selector);
      const menu = voice.locator('.sniptale-dropdown-menu');
      await menu.getByRole('textbox').fill('Alternate');
      const choice = menu.getByRole('button', { name: 'Alternate speech', exact: true });
      await choice.focus();
      await choice.press('Enter');
      await expect(selector).toContainText('Alternate speech');
      expect(await persistedReviewContent(page)).toEqual(before);
      await page.screenshot({
        path: info.outputPath('gallery-remembered-choice.png'),
        fullPage: false,
      });
      await activate(
        voice.getByRole('button', { name: label('gallery.videoReview.textVoiceBack'), exact: true })
      );
      await open();
      await expect(selector).toContainText('Alternate speech');
      expect(await persistedReviewContent(page)).toEqual(before);
      if (variant.width === 1280) {
        await page.setViewportSize({ width: 1100, height: 560 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        ).toBe(true);
        const workspaceScroll = dialog.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
        await workspaceScroll.evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        await expect(selector).toBeInViewport();
        await activate(selector);
        await expect(menu.getByRole('textbox')).toBeVisible();
        await menu.getByRole('textbox').press('Escape');
        await page.screenshot({
          path: info.outputPath('gallery-narrow-choice.png'),
          fullPage: false,
        });
      }
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });

  test(`PCM native request, preview, Apply, Undo/Redo, reopen and export ${variant.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    const host = await startHostServer();
    try {
      const { label, dialog, button, document } = await setup(
        page,
        host.origin,
        variant.locale,
        variant.width,
        variant.height
      );
      await activate(
        document.getByRole('button', {
          name: label('gallery.videoReview.speechGenerate'),
          exact: true,
        })
      );
      const voice = dialog.locator('[data-ui="gallery.videoReview.textVoice"]');
      const formats = voice.getByRole('group', {
        name: label('gallery.videoReview.speechFormat'),
        exact: true,
      });
      const format = formats.getByRole('button', {
        name: label('settings.aiProviders.modelAudioPcm'),
        exact: true,
      });
      await expect(format).toHaveAttribute('aria-pressed', 'true');
      await activate(format);
      await expect(format).toBeFocused();
      const generate = voice.getByRole('button', {
        name: label('gallery.videoReview.speechGenerate'),
        exact: true,
      });
      await activate(generate);
      await activate(
        voice.getByRole('button', {
          name: label('gallery.videoReview.speechConsentContinue'),
          exact: true,
        })
      );
      const audio = voice.locator('audio');
      await expect(audio).toHaveCount(1);
      await expect.poll(() => audio.evaluate((element) => element.duration)).toBe(0.75);
      await audio.evaluate(async (element) => {
        await element.play();
      });
      await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(0);
      await audio.evaluate((element) => element.pause());
      await page.screenshot({ path: info.outputPath('pcm-native-preview.png'), fullPage: false });
      await activate(formats.getByRole('button', { name: 'WAV', exact: true }));
      await expect(audio).toHaveCount(0);
      await activate(format);
      await activate(generate);
      await expect(audio).toHaveCount(1);
      const apply = voice.getByRole('button', {
        name: label('gallery.videoReview.speechApply'),
        exact: true,
      });
      await apply.scrollIntoViewIfNeeded();
      await expect(apply).toBeInViewport();
      await page.screenshot({ path: info.outputPath('pcm-apply-footer.png'), fullPage: false });
      await apply.press('Enter');
      await expect
        .poll(async () => (await persistedReviewContent(page))?.audio.voiceover.length)
        .toBe(1);
      const clip = (await persistedReviewContent(page))!.audio.voiceover[0]!;
      expect(clip.textSnapshot?.profile?.responseFormat).toBe('pcm');
      expect(await inspectAcceptedWav(page, clip.assetId)).toEqual({
        mimeType: 'audio/wav',
        size: 36_044,
        rate: 24_000,
        channels: 1,
        duration: 0.75,
        frames: 18_000,
        dataBytes: 36_000,
      });
      await activate(button('gallery.videoReview.undo'));
      await expect
        .poll(async () => (await persistedReviewContent(page))?.audio.voiceover.length)
        .toBe(0);
      await activate(button('gallery.videoReview.redo'));
      await expect
        .poll(async () => (await persistedReviewContent(page))?.audio.voiceover.length)
        .toBe(1);
      await page.reload();
      await expect(dialog).toBeVisible();
      expect((await persistedReviewContent(page))!.audio.voiceover[0]).toEqual(clip);
      expect(await inspectAcceptedWav(page, clip.assetId)).toMatchObject({
        duration: 0.75,
        mimeType: 'audio/wav',
      });
      await activate(
        button('gallery.videoReview.exportSection').and(
          dialog.locator('[data-ui="gallery.videoReview.openExport"]')
        )
      );
      await activate(button('videoEditor.exportDialog.formatLabel'));
      await page.getByRole('option', { name: 'WebM', exact: true }).press('Enter');
      const downloading = page.waitForEvent('download');
      await activate(button('gallery.videoReview.downloadVideo'));
      const download = await downloading;
      const path = info.outputPath('pcm-accepted-export.webm');
      await download.saveAs(path);
      expect(await download.failure()).toBeNull();
      const { stdout } = await promisify(execFile)(
        '/usr/bin/ffmpeg',
        [
          '-v',
          'error',
          '-ss',
          String(clip.timelineStart + 0.1),
          '-i',
          path,
          '-t',
          '1.25',
          '-map',
          '0:a:0',
          '-ac',
          '1',
          '-ar',
          '24000',
          '-f',
          'f32le',
          'pipe:1',
        ],
        { encoding: 'buffer', maxBuffer: 1024 * 1024 }
      );
      const samples = new DataView(stdout.buffer, stdout.byteOffset, stdout.byteLength);
      const count = stdout.byteLength / 4;
      expect(count).toBeGreaterThanOrEqual(30_000);
      const tone = (start: number) => {
        let sine = 0,
          cosine = 0;
        for (let index = 0; index < 12_000; index++) {
          const value = samples.getFloat32((start + index) * 4, true);
          const phase = (2 * Math.PI * 220 * index) / 24_000;
          sine += value * Math.sin(phase);
          cosine += value * Math.cos(phase);
        }
        return (2 * Math.hypot(sine, cosine)) / 12_000;
      };
      // The synthesized 220 Hz PCM must survive native WAV decode and the real export mix.
      expect(tone(0)).toBeGreaterThan(0.02);
      expect(tone(18_000)).toBeLessThan(0.005);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });

  test(`PCM native failure, cancellation and batch Apply ${variant.width}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    try {
      const { label, dialog, document } = await setup(
        page,
        host.origin,
        variant.locale,
        variant.width,
        variant.height
      );
      await activate(
        document.getByRole('button', {
          name: label('gallery.videoReview.textFragmentAdd'),
          exact: true,
        })
      );
      await document
        .getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
        .fill('PCM second');
      await expect
        .poll(async () => (await persistedReviewContent(page))?.text?.fragments[1]?.text)
        .toBe('PCM second');
      await activate(
        document.getByRole('button', {
          name: label('gallery.videoReview.speechBatch'),
          exact: true,
        })
      );
      await activate(
        document.getByRole('button', {
          name: label('gallery.videoReview.textFragmentSelectFound'),
          exact: true,
        })
      );
      await activate(
        document.getByRole('button', {
          name: label('gallery.videoReview.speechGenerateSelected'),
          exact: true,
        })
      );
      const voice = dialog.locator('[data-ui="gallery.videoReview.textVoice"]');
      const generate = voice.getByRole('button', {
        name: label('gallery.videoReview.speechGenerateSelected'),
        exact: true,
      });
      await page.evaluate(() => {
        Reflect.get(window, 'pcmSpeechFixture').mode = 'invalid';
      });
      await activate(generate);
      await activate(
        voice.getByRole('button', {
          name: label('gallery.videoReview.speechConsentContinue'),
          exact: true,
        })
      );
      await expect(voice.getByRole('alert')).toBeVisible();
      await voice.getByRole('alert').scrollIntoViewIfNeeded();
      await expect(voice.getByRole('alert')).toBeInViewport();
      expect((await persistedReviewContent(page))!.audio.voiceover).toHaveLength(0);
      await page.screenshot({ path: info.outputPath('pcm-invalid-response.png'), fullPage: false });
      await page.evaluate(() => {
        Reflect.get(window, 'pcmSpeechFixture').mode = 'hold';
      });
      await activate(generate);
      const cancel = voice.getByRole('button', {
        name: label('common.actions.cancel'),
        exact: true,
      });
      await expect(cancel).toBeEnabled();
      await cancel.scrollIntoViewIfNeeded();
      await expect(cancel).toBeInViewport();
      await page.screenshot({ path: info.outputPath('pcm-pending-cancel.png'), fullPage: false });
      await activate(cancel);
      await expect(generate).toBeEnabled();
      expect((await persistedReviewContent(page))!.audio.voiceover).toHaveLength(0);
      await page.evaluate(() => {
        Reflect.get(window, 'pcmSpeechFixture').mode = 'success';
      });
      await activate(generate);
      await expect(voice.locator('audio')).toHaveCount(2);
      await activate(
        voice.getByRole('button', {
          name: label('gallery.videoReview.speechApplySelected'),
          exact: true,
        })
      );
      await expect
        .poll(async () => (await persistedReviewContent(page))?.audio.voiceover.length)
        .toBe(2);
      for (const clip of (await persistedReviewContent(page))!.audio.voiceover) {
        expect(clip.textSnapshot?.profile?.responseFormat).toBe('pcm');
        expect(await inspectAcceptedWav(page, clip.assetId)).toMatchObject({
          mimeType: 'audio/wav',
          duration: 0.75,
        });
      }
      const requests: unknown = await page.evaluate(
        () => Reflect.get(window, 'pcmSpeechFixture').requests
      );
      expect(requests).toEqual(
        expect.arrayContaining([
          { format: 'pcm', text: 'PCM first' },
          { format: 'pcm', text: 'PCM second' },
        ])
      );
      await page.screenshot({ path: info.outputPath('pcm-batch-applied.png'), fullPage: false });
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
