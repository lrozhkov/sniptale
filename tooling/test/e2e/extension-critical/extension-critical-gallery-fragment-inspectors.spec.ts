import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { addReviewFocus, seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import {
  installSpeechPortFixture,
  persistedReviewContent,
  speechModelResponse,
  syntheticSpeechWav,
} from '../support/voiceover-speech-fixture';

const label = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [
    { width: 1280, height: 560 },
    { width: 1920, height: 900 },
  ]) {
    test(`fragment inspector composition ${theme} ${viewport.width}`, async ({ page }, info) => {
      const host = await startHostServer();
      try {
        await page.setViewportSize(viewport);
        await applyHarnessBootstrap(page, {
          preserveMediaLibrary: true,
          storage: { 'sniptale-locale-preference': 'ru', 'sniptale-theme-preference': theme },
          runtimeResponses: { AI_SETTINGS_QUERY: speechModelResponse },
        });
        await page.goto(host.origin + GALLERY_HARNESS_PATH + '?theme=' + theme);
        await page.locator('[data-ui="gallery.page.root"]').waitFor();
        await seedReviewVideo(page, 'review-vp8-opus.webm', {
          width: 160,
          height: 90,
          duration: 12,
        });
        await page.reload();
        await installSpeechPortFixture(page);
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
        const dialog = page.locator('dialog');
        await dialog
          .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
          .click();
        for (const mode of ['cutMode', 'speedMode'] as const) {
          await dialog
            .getByRole('button', { name: label(`gallery.videoReview.${mode}`), exact: true })
            .click();
          const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
          const source = (await plane
            .locator('[data-ui="gallery.videoReview.sourceLane"]')
            .boundingBox())!;
          const duration = Number(await plane.getAttribute('aria-valuemax'));
          await page.mouse.move(source.x + (source.width * 2) / duration, source.y + 12);
          await page.mouse.down();
          await page.mouse.move(source.x + (source.width * 4) / duration, source.y + 12, {
            steps: 8,
          });
          await page.mouse.up();
          const fields = dialog.locator('[data-ui="gallery.videoReview.editRangeFields"]');
          await expect(fields).toBeVisible();
          await fields.scrollIntoViewIfNeeded();
          const pitch = await fields
            .locator('.sniptale-parameter-row')
            .evaluateAll(
              (nodes) => nodes[1]!.getBoundingClientRect().y - nodes[0]!.getBoundingClientRect().y
            );
          expect.soft(Math.abs(pitch - 44)).toBeLessThanOrEqual(1);
          await page.screenshot({ path: info.outputPath(mode + '.png'), fullPage: false });
          await dialog
            .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
            .click();
          await expect(fields).toHaveCount(0);
        }
        await dialog
          .locator('[data-review-header-track="annotationEffects"] [data-review-track-select]')
          .click();
        await dialog
          .getByRole('button', {
            name: label('gallery.videoReview.annotationEffectsAdd'),
            exact: true,
          })
          .click();
        await dialog
          .getByRole('button', {
            name: label('gallery.videoReview.annotationEffectsChoose'),
            exact: true,
          })
          .click();
        await page.getByRole('option', { name: 'Главная мысль', exact: true }).click();
        const annotationLane = dialog.locator(
          '[data-ui="gallery.videoReview.annotationEffectsLane"]'
        );
        const annotationBox = (await annotationLane.boundingBox())!;
        const timelineDuration = Number(
          await dialog
            .locator('[data-ui="gallery.videoReview.timePlane"]')
            .getAttribute('aria-valuemax')
        );
        await page.mouse.move(
          annotationBox.x + annotationBox.width / timelineDuration,
          annotationBox.y + 12
        );
        await page.mouse.down();
        await page.mouse.move(
          annotationBox.x + (annotationBox.width * 5) / timelineDuration,
          annotationBox.y + 12,
          { steps: 8 }
        );
        await page.mouse.up();
        const annotation = dialog.locator('[data-ui="gallery.videoReview.annotationInspector"]');
        await expect(annotation).toBeVisible();
        await expect(annotation.locator('.sniptale-parameter-row').first()).toHaveText(
          label('gallery.videoReview.annotationName') + 'Главная мысль'
        );
        await page.screenshot({ path: info.outputPath('annotation.png'), fullPage: false });
        await expect(
          annotation.locator('.sniptale-parameter-value > span[title]').first()
        ).toHaveCSS('text-align', 'right', { timeout: 500 });
        await dialog
          .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
          .click();
        await expect(annotation).toHaveCount(0);
        for (const lane of ['voiceover', 'music'] as const) {
          const header = dialog.locator('[data-ui="gallery.videoReview.trackHeader"]').filter({
            hasText: label(
              lane === 'voiceover'
                ? 'gallery.videoReview.audioVoiceover'
                : 'gallery.videoReview.audioMusic'
            ),
          });
          await header
            .getByRole('button', {
              name: label(
                lane === 'voiceover'
                  ? 'gallery.videoReview.audioImport'
                  : 'gallery.videoReview.musicLibrary'
              ),
              exact: true,
            })
            .click();
          const drawer = page.locator('[data-ui="music.library.drawer"]');
          await drawer.locator('input[type="file"]').setInputFiles({
            name: 'Длинное пользовательское название звуковой дорожки для проверки границ.wav',
            mimeType: 'audio/wav',
            buffer: syntheticSpeechWav(lane === 'voiceover' ? 3 : 6),
          });
          await expect(drawer).toHaveCount(0);
          await dialog.locator(`[data-audio-lane="${lane}"] [data-audio-id]`).last().click();
          const inspector = dialog.locator('[data-ui="gallery.videoReview.audioInspector"]');
          await expect(inspector).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: info.outputPath(`${lane}.png`), fullPage: false });
          const summary = inspector.locator('[data-ui="gallery.videoReview.interval"]');
          await expect(summary).toHaveCount(1);
          expect
            .soft(await summary.locator('xpath=ancestor::section[@data-section]').count())
            .toBe(0);
          expect
            .soft(
              await inspector
                .locator('[aria-label="' + label('gallery.videoReview.audioClipMute') + '"]')
                .count()
            )
            .toBe(0);
          expect
            .soft(
              await inspector
                .locator('section[data-section]')
                .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-section')))
            )
            .toEqual(
              lane === 'voiceover'
                ? ['audio', 'animation', 'recognition', 'actions']
                : ['audio', 'animation', 'actions']
            );
        }
        const musicInspector = dialog.locator('[data-ui="gallery.videoReview.audioInspector"]');
        const level = musicInspector.getByRole('textbox', {
          name: label('gallery.videoReview.audioClipVolume'),
          exact: true,
        });
        await level.fill('75');
        await level.press('Enter');
        await expect
          .poll(async () => (await persistedReviewContent(page))?.audio.music[0]?.volume)
          .toBe(0.75);
        await level.fill('150');
        await level.press('Escape');
        await expect(level).toHaveValue('75');
        const miniMute = page
          .locator('[data-review-header-track="music"]')
          .getByRole('button', { name: label('gallery.videoReview.audioEnabled'), exact: true });
        await miniMute.click();
        await expect(miniMute).toHaveAttribute('aria-pressed', 'false');
        await expect
          .poll(async () => (await persistedReviewContent(page))?.audio.music[0]?.muted)
          .toBe(true);
        await miniMute.press('Enter');
        await expect(miniMute).toHaveAttribute('aria-pressed', 'true');
        await expect(miniMute).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await dialog.locator('[data-audio-lane="voiceover"] [data-audio-id]').last().click();
        const speech = dialog.locator('[data-ui="gallery.videoReview.speechPanel"]');
        await speech
          .getByRole('button', { name: label('gallery.videoReview.recognitionStart'), exact: true })
          .click();
        await speech
          .getByRole('button', {
            name: label('gallery.videoReview.speechConsentContinue'),
            exact: true,
          })
          .click();
        await expect(speech.locator('[data-ui="gallery.videoReview.textPhrase"]')).toHaveCount(3);
        const deletion = speech.getByRole('button', {
          name: label('gallery.videoReview.audioClipDelete'),
          exact: true,
        });
        await deletion.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath('recognition-actions.png'),
          fullPage: false,
        });
        await deletion.hover();
        await expect(deletion).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        if (viewport.width === 1280 && theme === 'light') {
          const presentation = dialog.locator(
            '[data-ui="gallery.videoReview.inspectorPresentation"]'
          );
          await presentation.click();
          const categories = speech.locator('[data-ui="gallery.videoReview.inspectorCategories"]');
          const rail = categories.locator('nav');
          await expect(rail.getByRole('button')).toHaveCount(4);
          await rail
            .getByRole('button', {
              name: label('gallery.videoReview.recognitionTitle'),
              exact: true,
            })
            .click();
          await expect(
            speech.locator('[data-ui="gallery.videoReview.recognitionResult"]')
          ).toBeVisible();
          await rail.getByRole('button').last().click();
          await expect(deletion).toBeInViewport();
          await page.screenshot({ path: info.outputPath('audio-categories.png'), fullPage: false });
          await presentation.click();
          await expect(speech.locator('section[data-section]').last()).toHaveAttribute(
            'data-section',
            'actions'
          );
        }
        await addReviewFocus(page);
        const focusType = dialog.locator('[data-ui="gallery.videoReview.focusType"]');
        await expect(focusType).toBeVisible();
        await page.screenshot({ path: info.outputPath('focus.png'), fullPage: false });
        const priorNavigation = await persistedReviewContent(page);
        await dialog
          .getByRole('button', { name: label('gallery.videoReview.spatialToolTilt'), exact: true })
          .click();
        const spatial = dialog.locator('[data-ui="gallery.videoReview.spatialTools"]');
        const context = spatial.locator('.review-spatial-context');
        const reset = spatial.locator('.review-spatial-reset');
        expect
          .soft((await reset.boundingBox())!.y)
          .toBeGreaterThanOrEqual(
            (await context.boundingBox())!.y + (await context.boundingBox())!.height
          );
        await context.getByRole('button', { name: 'X', exact: true }).click();
        expect(await persistedReviewContent(page)).toEqual(priorNavigation);
        await dialog
          .getByRole('button', {
            name: label('gallery.videoReview.spatialToolPosition'),
            exact: true,
          })
          .click();
        const heights = await focusType
          .getByRole('button')
          .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
        for (const height of heights) expect.soft(height).toBe(32);
        for (const key of [
          'gallery.videoReview.focusSpotlight',
          'gallery.videoReview.focusBorder',
          'gallery.videoReview.zoomRegionLabel',
        ] as const) {
          await focusType.getByRole('button', { name: label(key), exact: true }).click();
          if (key !== 'gallery.videoReview.zoomRegionLabel')
            await expect(
              dialog.locator('[data-ui="gallery.videoReview.zoomPreview"] h5').first()
            ).toHaveCSS('padding-left', '8px', { timeout: 500 });
          await page.screenshot({
            path: info.outputPath(key.split('.').at(-1)! + '.png'),
            fullPage: false,
          });
        }
        if (viewport.width === 1920 && theme === 'light') {
          const inspector = dialog.locator('[data-ui="gallery.videoReview.inspector"]');
          const scroll = inspector.locator('.review-inspector-scroll');
          const resize = dialog.locator('[data-ui="gallery.videoReview.resizeInspector"]');
          const contentWidth = () =>
            scroll.evaluate((node) => {
              const style = getComputedStyle(node);
              return (
                node.clientWidth -
                Number.parseFloat(style.paddingLeft) -
                Number.parseFloat(style.paddingRight)
              );
            });
          for (const width of [523, 524, 525]) {
            const current = await contentWidth();
            const handle = (await resize.boundingBox())!;
            await page.mouse.move(handle.x + handle.width / 2, handle.y + 12);
            await page.mouse.down();
            await page.mouse.move(handle.x + handle.width / 2 - (width - current), handle.y + 12);
            await page.mouse.up();
            await expect.poll(contentWidth).toBe(width);
            await expect(
              inspector.locator('[data-ui="gallery.videoReview.inspectorSections"]').first()
            ).toHaveCSS('display', width < 524 ? 'block' : 'grid');
            expect(
              await scroll.evaluate((node) => node.scrollWidth - node.clientWidth)
            ).toBeLessThanOrEqual(1);
            await page.screenshot({
              path: info.outputPath('inspector-' + width + '.png'),
              fullPage: false,
            });
          }
        }
        await dialog.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
        await page.screenshot({ path: info.outputPath('preview.png'), fullPage: false });
        const raster = dialog.locator(
          '[aria-label="' + label('gallery.videoReview.previewActualRaster') + '"]'
        );
        expect
          .soft(
            await raster
              .locator('xpath=ancestor::*[contains(@class,"sniptale-parameter-value")]')
              .count()
          )
          .toBe(1);
      } finally {
        host.server.closeAllConnections();
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}
