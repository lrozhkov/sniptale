import { expect, test } from '@playwright/test';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createReviewCaptionSettings } from '../../../../apps/extension/src/features/video/review/text-document';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, VIDEO_EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`montage renders authored captions ${viewport.name}`, async ({ page }, info) => {
    const host = await startHostServer();
    const project = createEmptyVideoProject('Caption preview', 1280, 720);
    project.version = 5;
    project.duration = 8;
    project.textDocuments = ['First caption / Первый', 'Second caption / Второй'].map(
      (text, index) => ({
        id: `document-${index}`,
        binding: { kind: 'project' },
        captions: { ...createReviewCaptionSettings(), enabled: true },
        document: {
          version: 1,
          fragments: [
            {
              id: 'same',
              text,
              originalText: '',
              start: 0,
              end: 8,
              timeDomain: 'result',
              alignment: 'manual',
              revision: 0,
              timingRevision: 0,
              showInVideo: true,
            },
          ],
        },
      })
    );
    await page.setViewportSize(viewport.size);
    try {
      await applyHarnessBootstrap(page, {
        videoProjects: [project],
        apiBehavior: { runtimeFallback: 'typed-success' },
      });
      await page.addInitScript(() => {
        const original = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
          if (text.includes('caption /')) {
            this.canvas.dataset.captionDraws = JSON.stringify(
              [
                ...JSON.parse(this.canvas.dataset.captionDraws ?? '[]'),
                { text, x, y, font: this.font },
              ].slice(-20)
            );
          }
          if (maxWidth === undefined) original.call(this, text, x, y);
          else original.call(this, text, x, y, maxWidth);
        };
      });
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}`);
      const canvas = page
        .locator('[data-ui="video.preview.stage.root"] canvas[data-caption-draws]')
        .first();
      await expect(canvas).toBeVisible();
      const draws = await canvas.evaluate((element) =>
        JSON.parse(element.getAttribute('data-caption-draws') ?? '[]')
      );
      expect(draws).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: 'First caption / Первый',
            font: expect.stringContaining('Sniptale Text'),
          }),
          expect.objectContaining({ text: 'Second caption / Второй' }),
        ])
      );
      const positions = await canvas.evaluate((element) => {
        const draws: { text: string; y: number }[] = JSON.parse(
          element.getAttribute('data-caption-draws') ?? '[]'
        );
        return [
          draws.find((entry) => entry.text.startsWith('First'))!.y,
          draws.find((entry) => entry.text.startsWith('Second'))!.y,
        ];
      });
      expect(positions[0]).not.toBe(positions[1]);
      await expect(page.locator('[data-ui="video.preview.effect-runtime-error"]')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('project-captions.png'), fullPage: false });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
