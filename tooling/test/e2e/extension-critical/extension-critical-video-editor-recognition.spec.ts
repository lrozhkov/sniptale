import { expect, test, type Page } from '@playwright/test';
import { parseHydratableVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { aiSettingsQueryResponseSchema } from '../../../../apps/extension/src/contracts/messaging/contracts/ai-settings-schemas';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { installSpeechPortFixture, speechModelResponse } from '../support/voiceover-speech-fixture';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

async function savedProject(page: Page) {
  const projects = await page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const rows = db.transaction('video_projects').objectStore('video_projects').getAll();
          rows.onerror = () => {
            db.close();
            reject(rows.error);
          };
          rows.onsuccess = () => {
            const values: unknown = rows.result;
            db.close();
            resolve(
              Array.isArray(values)
                ? values.flatMap((value: unknown) =>
                    typeof value === 'object' && value !== null && 'project' in value
                      ? [value.project]
                      : []
                  )
                : []
            );
          };
        };
      })
  );
  return projects.map(parseHydratableVideoProject).find((project) => project !== null);
}

async function speechInputCount(page: Page) {
  return page.evaluate(() => {
    const value: unknown = Reflect.get(window, 'speechFixtureRequests');
    return Array.isArray(value)
      ? value.filter(
          (entry: unknown) =>
            typeof entry === 'object' &&
            entry !== null &&
            'operation' in entry &&
            entry.operation === 'input'
        ).length
      : 0;
  });
}

/** Delays only the remote response; real extraction and staged-input cleanup still run. */
async function holdRecognitionResponse(page: Page) {
  await page.evaluate(() => {
    const connect = chrome.runtime.connect.bind(chrome.runtime);
    const held: Array<() => void> = [];
    let holding = true;
    Object.assign(window, {
      releaseMontageRecognition: () => {
        holding = false;
        held.splice(0).forEach((release) => release());
      },
    });
    Object.assign(chrome.runtime, {
      connect: (options: chrome.runtime.ConnectInfo = {}) => {
        const port = connect(options);
        const add = port.onMessage.addListener.bind(port.onMessage);
        port.onMessage.addListener = (listener: (message: unknown) => void) =>
          add((message: unknown) => {
            if (
              typeof message === 'object' &&
              message !== null &&
              'type' in message &&
              message.type === 'transcript' &&
              holding
            )
              held.push(() => listener(message));
            else listener(message);
          });
        return port;
      },
    });
  });
}

/** Controlled owner write refusal proves proposal recovery without a timing-based quota race. */
async function refuseProjectSave(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let refused = true;
    Object.assign(window, {
      allowMontageRecognitionSave: () => {
        refused = false;
      },
    });
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (refused && this.name === 'video_projects')
        throw new DOMException('Local fixture write refusal', 'QuotaExceededError');
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });
}

const recognitionModels = aiSettingsQueryResponseSchema.parse({
  ...speechModelResponse,
  modelSelection: {
    ...speechModelResponse.modelSelection,
    models: [
      ...(speechModelResponse.modelSelection?.models ?? []),
      {
        id: '00000000-0000-4000-8000-000000000104',
        providerId: '00000000-0000-4000-8000-000000000101',
        modelCode: 'fixture-audio-chat',
        displayName: 'Fixture audio chat',
        operation: 'transcription',
        audio: {
          transcription: {
            transport: 'audio-chat',
            chatProtocol: 'openai',
            structuredOutput: 'json_schema',
            responseFormat: 'json',
            timestampGranularity: 'none',
          },
        },
      },
    ],
  },
});

const variants = [
  { size: PRIMARY_BROWSER_VIEWPORTS[0].size, locale: 'en', theme: 'dark' },
  { size: PRIMARY_BROWSER_VIEWPORTS[1].size, locale: 'ru', theme: 'light' },
  { size: { width: 1200, height: 560 }, locale: 'en', theme: 'light' },
  { size: PRIMARY_BROWSER_VIEWPORTS[0].size, locale: 'ru', theme: 'dark' },
] as const;

for (const variant of variants) {
  test(`Montage recognition proposal and saved scene text ${variant.size.width} ${variant.locale}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const errors: string[] = [];
    const recovery = variant.size.width === 1280 && variant.locale === 'ru';
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ ...variant.size });
    await page.emulateMedia({ colorScheme: variant.theme });
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
        runtimeResponses: { AI_SETTINGS_QUERY: recognitionModels },
      });
      await page.addInitScript(
        (locale) => localStorage.setItem('sniptale-locale-preference', locale),
        variant.locale
      );
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?id=beta-v1-recording&theme=${variant.theme}`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await installSpeechPortFixture(page);
      if (recovery) await holdRecognitionResponse(page);
      await expect
        .poll(async () => (await savedProject(page))?.clips.length ?? 0)
        .toBeGreaterThan(0);
      const before = await savedProject(page);
      if (!before) throw new Error('Recording project was not saved');
      const expectedClips = before.clips.map((clip) => ({
        ...clip,
        timelineLaneId: clip.timelineLaneId ?? null,
      }));
      const clip = before.clips.find(
        (entry) =>
          (entry.type === 'VIDEO' || entry.type === 'AUDIO') &&
          before.assets.find((asset) => asset.id === entry.assetId)?.metadata.hasAudio
      );
      if (!clip || (clip.type !== 'VIDEO' && clip.type !== 'AUDIO'))
        throw new Error('Audible recording clip unavailable');
      await page.locator(`[data-project-timeline-clip="${clip.id}"]`).click();
      await page
        .getByRole('button', { name: label('gallery.videoReview.recognitionTitle'), exact: true })
        .click();
      const panel = page.locator('[data-ui="video-editor.recognition.panel"]');
      await expect(panel).toBeVisible();
      await panel.locator('.sniptale-ai-model-selector-trigger').click();
      await page.getByRole('button', { name: 'Fixture recognition', exact: true }).click();
      const start = panel.getByRole('button', {
        name: label('gallery.videoReview.recognitionStart'),
        exact: true,
      });
      await start.scrollIntoViewIfNeeded();
      await expect(start).toBeInViewport();
      await start.click();
      const consent = panel.locator('[data-ui="video-editor.recognition.consent"]');
      await expect(consent).toContainText('Local speech fixture');
      await expect(consent).toContainText('Fixture recognition');
      await expect(consent).toContainText(clip.name);
      const proceed = consent.getByRole('button', {
        name: label('gallery.videoReview.speechConsentContinue'),
        exact: true,
      });
      await proceed.scrollIntoViewIfNeeded();
      await expect(proceed).toBeInViewport();
      await page.screenshot({ path: info.outputPath('recognition-consent.png'), fullPage: false });
      await proceed.click();
      const proposal = panel.locator('[data-ui="video-editor.recognition.proposal"]');
      if (recovery) {
        const cancel = panel.getByRole('button', {
          name: label('common.actions.cancel'),
          exact: true,
        });
        await cancel.scrollIntoViewIfNeeded();
        await expect(cancel).toBeInViewport();
        await expect(panel.getByRole('status')).toContainText('0 / 1');
        await expect.poll(() => speechInputCount(page)).toBe(1);
        await expect(panel.locator('fieldset')).toHaveAttribute('disabled', '');
        await expect(start).toBeDisabled();
        await page.screenshot({
          path: info.outputPath('recognition-running.png'),
          fullPage: false,
        });
        await cancel.click();
        await expect(panel.getByRole('status')).toHaveCount(0);
        expect((await savedProject(page))?.textDocuments ?? []).toEqual(before.textDocuments ?? []);
        await start.click();
        await proceed.click();
        await expect.poll(() => speechInputCount(page)).toBe(2);
        await page.evaluate(() => {
          if (
            'releaseMontageRecognition' in window &&
            typeof window.releaseMontageRecognition === 'function'
          )
            window.releaseMontageRecognition();
        });
      }
      await expect(proposal.getByRole('textbox')).toHaveCount(3);
      expect((await savedProject(page))?.textDocuments ?? []).toEqual(before.textDocuments ?? []);
      await proposal.getByRole('textbox').first().fill('Accepted recognition / Принятый текст');
      expect((await savedProject(page))?.textDocuments ?? []).toEqual(before.textDocuments ?? []);
      const apply = proposal.getByRole('button', {
        name: label('gallery.videoReview.recognitionApply'),
        exact: true,
      });
      await apply.scrollIntoViewIfNeeded();
      await expect(apply).toBeInViewport();
      await page.screenshot({ path: info.outputPath('recognition-proposal.png'), fullPage: false });
      if (recovery) await refuseProjectSave(page);
      await apply.click();
      if (recovery) {
        await expect(panel.getByRole('alert')).toBeVisible();
        await page.keyboard.press('Escape');
        await panel.getByRole('alert').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath('recognition-save-error.png'),
          fullPage: false,
        });
        expect((await savedProject(page))?.textDocuments ?? []).toEqual(before.textDocuments ?? []);
        await expect(proposal.getByRole('textbox').first()).toBeDisabled();
        const close = proposal.getByRole('button', {
          name: label('videoEditor.sidebar.recognitionClose'),
          exact: true,
        });
        await close.scrollIntoViewIfNeeded();
        await expect(close).toBeEnabled();
        await expect(apply).toBeEnabled();
        await page.screenshot({
          path: info.outputPath('recognition-save-retry.png'),
          fullPage: false,
        });
        await proposal
          .getByText(label('videoEditor.sidebar.recognitionSaveRetry'), { exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath('recognition-save-instructions.png'),
          fullPage: false,
        });
        await page.evaluate(() => {
          if (
            'allowMontageRecognitionSave' in window &&
            typeof window.allowMontageRecognitionSave === 'function'
          )
            window.allowMontageRecognitionSave();
        });
        await apply.click();
      }
      await expect
        .poll(
          async () => (await savedProject(page))?.textDocuments?.[0]?.document.fragments[0]?.text
        )
        .toBe('Accepted recognition / Принятый текст');
      const accepted = await savedProject(page);
      expect(accepted?.textDocuments?.[0]?.binding).toEqual({
        kind: 'source',
        assetId: clip.assetId,
        sourceInstanceId: clip.sourceInstanceId ?? clip.id,
      });
      expect(accepted?.clips).toEqual(expectedClips);
      expect(accepted?.assets).toEqual(before.assets);
      await expect(proposal.getByRole('textbox').first()).toBeDisabled();
      await page
        .locator('[data-ui="video-editor.timeline.surface"]')
        .click({ position: { x: 4, y: 4 } });
      await page.keyboard.press('Control+z');
      await expect
        .poll(async () => (await savedProject(page))?.textDocuments ?? [])
        .toEqual(before.textDocuments ?? []);
      expect((await savedProject(page))?.clips).toEqual(expectedClips);
      expect((await savedProject(page))?.assets).toEqual(before.assets);
      await page.keyboard.press('Control+Shift+z');
      await expect
        .poll(async () => (await savedProject(page))?.textDocuments)
        .toEqual(accepted?.textDocuments);
      expect((await savedProject(page))?.clips).toEqual(expectedClips);
      expect((await savedProject(page))?.assets).toEqual(before.assets);
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${before.id}&theme=${variant.theme}`
      );
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      await page
        .getByRole('button', { name: label('gallery.videoReview.textTrackDocument'), exact: true })
        .click();
      const textPanel = page.locator('[data-ui="video-editor.text.panel"]');
      await textPanel.locator('article > button').first().click();
      const field = textPanel
        .getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
        .first();
      await expect(field).toHaveValue('Accepted recognition / Принятый текст');
      await field.scrollIntoViewIfNeeded();
      await expect(field).toBeInViewport();
      await page.screenshot({
        path: info.outputPath('recognition-reopened-text.png'),
        fullPage: false,
      });
      if (variant.size.width === 1920) {
        await page.locator(`[data-project-timeline-clip="${clip.id}"]`).click();
        await page
          .getByRole('button', { name: label('gallery.videoReview.recognitionTitle'), exact: true })
          .click();
        const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
        const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
        for (const width of [359, 360, 361]) {
          const current = (await inspector.boundingBox())!.width;
          const box = (await handle.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + 12);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + current - width, box.y + 12);
          await page.mouse.up();
          await expect
            .poll(async () => Math.round((await inspector.boundingBox())!.width))
            .toBe(width);
          await panel
            .getByRole('button', {
              name: label('gallery.videoReview.recognitionStart'),
              exact: true,
            })
            .scrollIntoViewIfNeeded();
          expect(
            await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)
          ).toBe(true);
          await page.screenshot({
            path: info.outputPath(`recognition-inspector-${width}.png`),
            fullPage: false,
          });
        }
        await panel.locator('.sniptale-ai-model-selector-trigger').click();
        await page.getByRole('button', { name: 'Fixture audio chat', exact: true }).click();
        await panel
          .getByLabel(label('gallery.videoReview.recognitionProcessingMode'), { exact: true })
          .click();
        await page
          .getByRole('option', {
            name: label('gallery.videoReview.recognitionRewrite'),
            exact: true,
          })
          .click();
        await panel
          .getByRole('textbox', {
            name: label('gallery.videoReview.recognitionInstructions'),
            exact: true,
          })
          .fill('Сохранить смысл, убрать повторы.');
        await page.screenshot({
          path: info.outputPath('recognition-audio-chat-settings.png'),
          fullPage: false,
        });
        await panel
          .getByRole('button', { name: label('gallery.videoReview.recognitionStart'), exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath('recognition-audio-chat-command.png'),
          fullPage: false,
        });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
