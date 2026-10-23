import { expect, test } from '@playwright/test';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createTextClip } from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, VIDEO_EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'en' as const, theme: 'dark' as const, width: 1280, height: 560 },
  { locale: 'ru' as const, theme: 'light' as const, width: 1920, height: 900 },
  { locale: 'en' as const, theme: 'light' as const, width: 1200, height: 560 },
]) {
  test(`export inspector preserves montage interaction ${variant.locale} ${variant.width}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const project = createEmptyVideoProject('Export inspector');
    const clip = createTextClip(project.tracks[0]!.id, project.width, project.height, 0);
    project.clips.push(clip);
    project.duration = 12;
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await page.emulateMedia({ colorScheme: variant.theme });
    try {
      await applyHarnessBootstrap(page, {
        videoProjects: [project],
        apiBehavior: { runtimeFallback: 'typed-success' },
        runtimeResponses: {
          GET_PROJECT_EXPORT_CAPABILITIES: {
            success: true,
            capabilities: {
              formats: [
                { format: 'MP4', available: true },
                { format: 'WEBM', available: true },
              ],
              mp4Codecs: [{ codec: 'AVC', available: true }],
              defaultMp4VideoCodec: 'AVC',
            },
          },
        },
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.addInitScript(
        (locale) => localStorage.setItem('sniptale-locale-preference', locale),
        variant.locale
      );
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${variant.theme}`
      );
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      await page.locator('[data-ui="video-editor.inspector.close"]').click();
      await expect(inspector).toHaveCount(0);
      await page.locator('[data-ui="video-editor.timeline.toolbar.project-menu"]').click();
      await page
        .getByRole('button', { name: label('videoEditor.app.exportButton'), exact: true })
        .click();
      const panel = inspector.locator('[data-ui="video-editor.export.inspector"]');
      await expect(panel).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const timelineClip = page.locator(`[data-project-timeline-clip="${clip.id}"]`);
      await timelineClip.click();
      await page.keyboard.press('Delete');
      await expect(timelineClip).toHaveCount(0);
      await page.keyboard.press('Control+z');
      await expect(timelineClip).toHaveCount(1);
      await expect(panel).toBeVisible();
      const submit = panel.getByRole('button', {
        name: label('videoEditor.exportDialog.submit'),
        exact: true,
      });
      await expect(submit).toBeInViewport();
      await expect(submit).toBeEnabled();
      const fields = panel.locator(':scope > div').first();
      await fields.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(submit).toBeInViewport();
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
      );
      await page.screenshot({ path: info.outputPath('export-inspector.png'), fullPage: false });
      if (variant.width === 1920) {
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
          await expect(submit).toBeInViewport();
          expect(
            await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)
          ).toBe(true);
          await page.screenshot({
            path: info.outputPath(`export-inspector-${width}.png`),
            fullPage: false,
          });
        }
      }
      const expanded = await panel.evaluateHandle((element) => {
        const changes: Array<{ node: Node; original: string }> = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const original = node.nodeValue ?? '';
          const text = original.trim();
          if (!/[A-Za-zА-Яа-я]/u.test(text)) continue;
          changes.push({ node, original });
          node.nodeValue = `⟦${text}${text.length <= 12 ? text : text.slice(0, Math.ceil(text.length / 2))}⟧`;
        }
        return changes;
      });
      try {
        expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true
        );
        await page.screenshot({
          path: info.outputPath('export-inspector-label-stress.png'),
          fullPage: false,
        });
      } finally {
        await expanded.evaluate((changes) => {
          for (const { node, original } of changes) if (node.isConnected) node.nodeValue = original;
        });
        await expanded.dispose();
      }
      await panel.focus();
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(inspector.locator('[data-ui="video-editor.inspector.content"]')).toBeVisible();
      await page.locator('[data-ui="video-editor.viewer.scene"]').click();
      const selectionMenu = inspector.locator('[aria-haspopup="listbox"]').first();
      await selectionMenu.click();
      await expect(page.getByRole('listbox')).toBeVisible();
      await page.keyboard.press('Control+m');
      await expect(panel).toBeVisible();
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await inspector.locator('[data-ui="video-editor.inspector.close"]').click();
      await expect(inspector).toHaveCount(0);
      await page.locator('[data-ui="video-editor.viewer.open-inspector"]').click();
      await expect(panel).toHaveCount(0);
      await expect(inspector).toBeVisible();
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
