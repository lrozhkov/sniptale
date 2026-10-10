import { expect, test, type Locator, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import {
  installSpeechPortFixture,
  persistedReviewContent,
  speechModelResponse,
} from '../support/voiceover-speech-fixture';

async function resizeRecognitionInspector(page: Page, dialog: Locator, target: number) {
  const scroll = dialog.locator('.review-inspector-scroll');
  const width = () =>
    scroll.evaluate((node) => {
      const style = getComputedStyle(node);
      return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    });
  const handle = dialog.locator('[data-ui="gallery.videoReview.resizeInspector"]');
  for (let attempt = 0; attempt < 3 && Math.abs((await width()) - target) > 0.5; attempt++) {
    const current = await width();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + current - target, box.y + 20, { steps: 4 });
    await page.mouse.up();
  }
  await expect.poll(width).toBe(target);
}
for (const variant of [
  { width: 1280, height: 560, locale: 'en', theme: 'light', basic: true },
  { width: 1920, height: 900, locale: 'ru', theme: 'dark', basic: true },
  { width: 1024, height: 560, locale: 'en', theme: 'light', basic: false },
] as const) {
  test('source recognition proposes canonical text ' + variant.width, async ({ page }, info) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await page.setViewportSize({ width: variant.width, height: variant.height });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
        runtimeResponses: { AI_SETTINGS_QUERY: speechModelResponse },
      });
      await page.goto(host.origin + GALLERY_HARNESS_PATH + '?theme=' + variant.theme);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      const open = async () => {
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      };
      await open();
      const dialog = page.locator('dialog');
      if (!variant.basic)
        await dialog
          .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
          .click();
      const header = dialog
        .locator('[data-ui="gallery.videoReview.trackHeader"]')
        .filter({ hasText: label('gallery.videoReview.audioOriginal') });
      const openSpeech = () =>
        header
          .getByRole('button', { name: label('gallery.videoReview.speechTitle'), exact: true })
          .click();
      await openSpeech();
      const panel = dialog.locator('[data-ui="gallery.videoReview.speechPanel"]');
      const volume = panel.getByRole('textbox', {
        name: label('gallery.videoReview.volume'),
        exact: true,
      });
      await volume.fill('45');
      await volume.press('Tab');
      await expect
        .poll(async () => (await persistedReviewContent(page))?.audio.original.volume)
        .toBe(0.45);
      const result = panel.locator('[data-ui="gallery.videoReview.recognitionResult"]');
      const phrases = result.locator('[data-ui="gallery.videoReview.textPhrase"]');
      const capture = (name: string) =>
        page.screenshot({ path: info.outputPath(name), fullPage: false });
      const originalAudio = (await persistedReviewContent(page))?.audio;
      if (variant.width === 1280) {
        await installSpeechPortFixture(page, 0);
        const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
        await ruler.scrollIntoViewIfNeeded();
        const rect = (await ruler.boundingBox())!;
        const duration = Number(await ruler.getAttribute('aria-valuemax'));
        await page.mouse.move(rect.x + rect.width / duration, rect.y + 15);
        await page.mouse.down();
        await page.mouse.move(rect.x + (rect.width * 4) / duration, rect.y + 15, { steps: 6 });
        await page.mouse.up();
        const selectedOnly = panel.getByRole('switch', {
          name: label('gallery.videoReview.recognitionSelection'),
          exact: true,
        });
        await selectedOnly.click();
        await panel
          .getByRole('button', {
            name: label('gallery.videoReview.recognitionStart'),
            exact: true,
          })
          .click();
        const consent = panel.getByRole('button', {
          name: label('gallery.videoReview.speechConsentContinue'),
          exact: true,
        });
        await expect(consent).toBeEnabled();
        await dialog
          .getByRole('button', {
            name: label('gallery.videoReview.clearPlaybackRange'),
            exact: true,
          })
          .click();
        await expect(selectedOnly).toBeChecked();
        await expect(consent).toBeDisabled();
        await expect(
          panel.getByText(label('gallery.videoReview.recognitionSelectionMissing'), {
            exact: true,
          })
        ).toBeVisible();
        await expect(result).toHaveCount(0);
        expect(await page.evaluate(() => Reflect.get(window, 'speechFixtureRequests'))).toEqual([]);
        await capture('recognition-selection-cleared-consent.png');
        await panel
          .getByRole('button', { name: label('common.actions.cancel'), exact: true })
          .click();
        await selectedOnly.click();
      }
      if (variant.width < 1280) {
        await expect
          .poll(() =>
            dialog
              .locator('[data-ui="gallery.videoReview.workspaceScroll"]')
              .evaluate((node) => node.scrollWidth - node.clientWidth)
          )
          .toBeGreaterThan(0);
      }
      let accepted = 0;
      for (const count of variant.width === 1024 ? [3] : [0, 1, 12, 100]) {
        await installSpeechPortFixture(page, count);
        await panel
          .getByRole('button', { name: label('gallery.videoReview.recognitionStart'), exact: true })
          .click();
        const consent = panel.getByRole('button', {
          name: label('gallery.videoReview.speechConsentContinue'),
          exact: true,
        });
        if (await consent.isVisible()) await consent.click();
        await expect(result).toBeVisible();
        await expect(phrases).toHaveCount(Math.min(count, 50));
        await expect
          .poll(async () => (await persistedReviewContent(page))?.text?.fragments.length ?? 0)
          .toBe(accepted);
        expect((await persistedReviewContent(page))?.audio).toEqual(originalAudio);
        if (!count) {
          await expect(
            result.getByText(label('gallery.videoReview.recognitionEmpty'), { exact: true })
          ).toBeVisible();
          await expect(
            result.getByRole('button', {
              name: label('gallery.videoReview.recognitionApply'),
              exact: true,
            })
          ).toBeDisabled();
          continue;
        }
        if (count > 50) {
          await result
            .getByRole('button', {
              name: label('gallery.videoReview.textFragmentMore'),
              exact: true,
            })
            .click();
          await expect(phrases).toHaveCount(count);
        }
        await phrases.first().locator('button[aria-expanded]').click();
        await expect(
          result.getByRole('textbox', {
            name: label('gallery.videoReview.speechText'),
            exact: true,
          })
        ).toHaveCount(1);
        if (count > 1) {
          await phrases.last().locator('button[aria-expanded]').click();
          await expect(
            result.getByRole('textbox', {
              name: label('gallery.videoReview.speechText'),
              exact: true,
            })
          ).toHaveCount(1);
        }
        const last = phrases.last();
        await last
          .getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
          .fill('Reviewed final phrase.');
        await last
          .getByRole('textbox', { name: label('gallery.videoReview.speechText'), exact: true })
          .press('Tab');
        await dialog.locator('.review-inspector-scroll').evaluate((node) => {
          node.scrollTop = 0;
        });
        await capture('recognition-list-' + count + '.png');
        if (accepted) {
          await result
            .getByRole('button', {
              name: label('gallery.videoReview.recognitionMode'),
              exact: true,
            })
            .click();
          await page
            .getByRole('option', {
              name: label('gallery.videoReview.recognitionReplace'),
              exact: true,
            })
            .click();
        }
        const apply = result.getByRole('button', {
          name: label('gallery.videoReview.recognitionApply'),
          exact: true,
        });
        await apply.scrollIntoViewIfNeeded();
        await expect(apply).toBeInViewport();
        await capture('recognition-list-' + count + '-footer.png');
        await apply.click();
        accepted = count;
        await expect
          .poll(async () => (await persistedReviewContent(page))?.text?.fragments.length)
          .toBe(count);
        expect((await persistedReviewContent(page))?.text?.fragments.at(-1)).toMatchObject({
          text: 'Reviewed final phrase.',
          timeDomain: 'source',
        });
        expect((await persistedReviewContent(page))?.audio).toEqual(originalAudio);
        await expect(dialog.locator('[data-ui="gallery.videoReview.textDocument"]')).toHaveCount(0);
      }
      if (variant.basic) {
        await expect(dialog.locator('[data-ui="gallery.videoReview.textTrack"]')).toHaveCount(0);
        const advanced = result.getByRole('button', {
          name: label('gallery.videoReview.advancedEditing'),
          exact: true,
        });
        await advanced.scrollIntoViewIfNeeded();
        await expect(advanced).toBeInViewport();
        await capture('recognition-basic-accepted.png');
        await advanced.click();
        await expect(dialog.locator('[data-ui="gallery.videoReview.textTrack"]')).toBeVisible();
        await openSpeech();
      }
      await expect(dialog.locator('[data-ui="gallery.videoReview.revoiceTrack"]')).toHaveCount(0);
      if (variant.width !== 1024)
        for (const width of [523, 524, 525]) {
          await resizeRecognitionInspector(page, dialog, width);
          await dialog.locator('.review-inspector-scroll').evaluate((node) => {
            node.scrollTop = 0;
          });
          await capture('recognition-columns-' + width + '.png');
        }
      await page.reload();
      await open();
      await openSpeech();
      expect((await persistedReviewContent(page))?.text?.fragments).toHaveLength(accepted);
      expect((await persistedReviewContent(page))?.audio).toEqual(originalAudio);
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.textTrackOpen'), exact: true })
        .click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.textDocument"]')).toBeVisible();
      await expect(dialog.locator('[data-ui="gallery.videoReview.speechPanel"]')).toHaveCount(0);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
  { width: 1024, height: 560 },
]) {
  test(
    'multimodal recognition keeps instructions and consent inside the inspector ' + viewport.width,
    async ({ page }, info) => {
      const host = await startHostServer();
      const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
      try {
        await page.setViewportSize(viewport);
        const selection = speechModelResponse.modelSelection;
        const model = selection?.models.find((entry) => entry.operation === 'transcription');
        if (!selection || !model) throw new Error('Missing recognition catalog fixture');
        await applyHarnessBootstrap(page, {
          preserveMediaLibrary: true,
          storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'dark' },
          runtimeResponses: {
            AI_SETTINGS_QUERY: {
              ...speechModelResponse,
              modelSelection: {
                ...selection,
                models: [
                  {
                    ...model,
                    audio: {
                      transcription: {
                        transport: 'audio-chat',
                        chatProtocol: 'bothub',
                        structuredOutput: 'json_schema',
                        responseFormat: 'json',
                        timestampGranularity: 'none',
                      },
                    },
                  },
                ],
              },
            },
          },
        });
        await page.goto(host.origin + GALLERY_HARNESS_PATH + '?theme=dark');
        await page.locator('[data-ui="gallery.page.root"]').waitFor();
        await seedReviewVideo(page, 'review-vp8-opus.webm', {
          width: 160,
          height: 90,
          duration: 12,
        });
        await page.reload();
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
        const dialog = page.locator('dialog');
        await dialog
          .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
          .click();
        const header = dialog
          .locator('[data-ui="gallery.videoReview.trackHeader"]')
          .filter({ hasText: label('gallery.videoReview.audioOriginal') });
        await header
          .getByRole('button', { name: label('gallery.videoReview.speechTitle'), exact: true })
          .click();
        const panel = dialog.locator('[data-ui="gallery.videoReview.speechPanel"]');
        await expect(
          panel.getByLabel(label('gallery.videoReview.recognitionInstructions'), { exact: true })
        ).toHaveCount(0);
        await panel
          .getByLabel(label('gallery.videoReview.recognitionProcessingMode'), { exact: true })
          .click();
        await page
          .getByRole('option', {
            name: label('gallery.videoReview.recognitionRewrite'),
            exact: true,
          })
          .click();
        const prompt = panel.getByLabel(label('gallery.videoReview.recognitionInstructions'), {
          exact: true,
        });
        await prompt.fill('Keep the original meaning; make the wording concise.');
        await expect(prompt).toBeVisible();
        await expect(panel.locator('fieldset p')).toHaveCount(0);
        await page.screenshot({
          path: info.outputPath('multimodal-instructions.png'),
          fullPage: false,
        });
        if (viewport.width === 1920)
          for (const width of [523, 524, 525]) {
            await resizeRecognitionInspector(page, dialog, width);
            await prompt.scrollIntoViewIfNeeded();
            await expect(prompt).toBeVisible();
            await page.screenshot({
              path: info.outputPath('multimodal-inspector-' + width + '.png'),
              fullPage: false,
            });
          }
        if (viewport.width < 1280)
          await expect
            .poll(() =>
              dialog
                .locator('[data-ui="gallery.videoReview.workspaceScroll"]')
                .evaluate((node) => node.scrollWidth - node.clientWidth)
            )
            .toBeGreaterThan(0);
        await installSpeechPortFixture(page, 1);
        await panel
          .getByRole('button', { name: label('gallery.videoReview.recognitionStart'), exact: true })
          .click();
        const consent = panel.getByRole('button', {
          name: label('gallery.videoReview.speechConsentContinue'),
          exact: true,
        });
        await consent.scrollIntoViewIfNeeded();
        await expect(consent).toBeInViewport();
        await page.screenshot({ path: info.outputPath('multimodal-consent.png'), fullPage: false });
        await consent.click();
        await expect(
          panel.locator('[data-ui="gallery.videoReview.recognitionResult"]')
        ).toBeVisible();
        await expect
          .poll(async () => (await persistedReviewContent(page))?.text?.fragments.length ?? 0)
          .toBe(0);
        const apply = panel.getByRole('button', {
          name: label('gallery.videoReview.recognitionApply'),
          exact: true,
        });
        await apply.scrollIntoViewIfNeeded();
        await expect(apply).toBeInViewport();
        await page.screenshot({
          path: info.outputPath('multimodal-proposal-footer.png'),
          fullPage: false,
        });
        expect(await page.evaluate(() => Reflect.get(window, 'speechFixtureRequests'))).toEqual(
          expect.arrayContaining([expect.objectContaining({ operation: 'input', wav: true })])
        );
      } finally {
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    }
  );
}
