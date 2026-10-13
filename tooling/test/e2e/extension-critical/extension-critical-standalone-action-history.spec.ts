import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoProjectCursorTrack } from '../../../../apps/extension/src/features/video/project/defaults';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, VIDEO_EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

for (const [width, height, locale, theme] of [
  [1280, 560, 'ru', 'dark'],
  [1920, 900, 'en', 'light'],
  [1200, 560, 'en', 'dark'],
] as const) {
  for (const empty of [false, true])
    test(`standalone semantic history ${width}, empty=${empty}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      const server = await startHostServer();
      const project = createEmptyVideoProject('Semantic history proof');
      project.duration = 10;
      if (!empty) {
        project.actionEvents = [
          {
            id: 'command',
            kind: 'KEY',
            anchor: { kind: 'project', time: 1 },
            label: 'Ctrl+K',
            point: null,
            data: {},
          },
          {
            id: 'click',
            kind: 'CLICK',
            anchor: { kind: 'project', time: 1 },
            label: 'Click',
            point: { x: 0.4, y: 0.5 },
            data: {},
            presentation: { enabled: false },
          },
          {
            id: 'hold',
            kind: 'CLICK',
            anchor: { kind: 'project', time: 4 },
            label: 'Hold',
            point: { x: 0.5, y: 0.5 },
            data: { gestureType: 'hold', downTime: 4, upTime: 6 },
            presentation: { duration: 0.2 },
          },
        ];
        project.cursorTrack = createVideoProjectCursorTrack('embedded-fallback');
        project.cursorTrack.samples = [
          { id: 'move', time: 0, x: 0, y: 0, visible: true, captureSegment: 0 },
          { id: 'dwell', time: 1, x: 100, y: 100, visible: true, captureSegment: 0 },
          { id: 'dwell-end', time: 2, x: 100, y: 100, visible: true, captureSegment: 0 },
          { id: 'gap', time: 3, x: 100, y: 100, visible: false, captureSegment: 0 },
          { id: 'return', time: 4, x: 150, y: 150, visible: true, captureSegment: 1 },
          { id: 'end', time: 5, x: 200, y: 200, visible: true, captureSegment: 1 },
        ];
      }
      try {
        await page.emulateMedia({ colorScheme: theme });
        await applyHarnessBootstrap(page, {
          apiBehavior: { runtimeFallback: 'typed-success' },
          videoProjects: [project],
          storage: {
            'sniptale-locale-preference': locale,
            'sniptale-theme-preference': theme,
            [`sniptale_video_editor_track_panel_prefs:${project.id}`]: {
              collapsedCursorLaneVisible: true,
              collapsedTelemetryLaneVisible: true,
              compactRows: false,
            },
          },
        });
        await page.addInitScript(
          (value) => localStorage.setItem('sniptale-locale-preference', value),
          locale
        );
        await page.goto(
          `${server.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`,
          { waitUntil: 'domcontentloaded' }
        );
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const row = page.locator('[data-ui="video-editor.timeline.history-row"]');
        await expect(row).toBeVisible();
        expect((await row.boundingBox())!.height).toBe(80);
        for (const frame of await row.locator(':scope > [data-history-family]').all())
          await expect(frame).toHaveCSS('border-bottom-width', '0px');
        expect(
          await row
            .locator('[data-history-family=keyboard]')
            .evaluate(
              (node) =>
                document.getElementById(node.getAttribute('aria-describedby') ?? '')?.textContent
            )
        ).toBe(translate('videoEditor.timeline.historyKeyboardCoverage', locale));
        if (!empty) {
          const key = row.locator('[data-action-id="command"]');
          const click = row.locator('[data-action-id="click"]');
          await expect(key).toBeVisible();
          await expect(click).toBeVisible();
          await expect(row.locator('[data-action-id=hold]')).toHaveAttribute(
            'title',
            new RegExp(translate('videoEditor.timeline.historyHold', locale))
          );
          expect((await click.boundingBox())!.y - (await key.boundingBox())!.y).toBe(28);
          await key.focus();
          await key.press('Enter');
          await expect(key).toHaveAttribute('aria-pressed', 'true');
          await expect(
            row.locator('[data-ui="video-editor.timeline.history-cursor-row"]')
          ).toBeVisible();
        }
        await page.screenshot({ path: info.outputPath('standalone-history.png'), fullPage: false });
        if (width < 1280) {
          const workspace = page.locator('[data-ui="video-editor.workspace.root"]');
          expect(await workspace.evaluate((node) => node.scrollWidth)).toBeGreaterThan(
            await workspace.evaluate((node) => node.clientWidth)
          );
          await workspace.evaluate((node) => {
            node.scrollLeft = node.scrollWidth - node.clientWidth;
          });
          await expect.poll(() => workspace.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
          await page.screenshot({
            path: info.outputPath('standalone-history-horizontal-scroll.png'),
            fullPage: false,
          });
        }
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
}
