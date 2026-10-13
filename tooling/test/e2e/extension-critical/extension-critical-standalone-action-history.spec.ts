import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  createVideoProjectFromRecording,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { isValidVideoProject } from '../../../../apps/extension/src/features/video/project/validation';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoProjectCursorTrack } from '../../../../apps/extension/src/features/video/project/defaults';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  VIDEO_EDITOR_HARNESS_PATH,
  GALLERY_HARNESS_PATH,
} from '../extension-critical.helpers';

for (const [width, height, locale, theme] of [
  [1280, 560, 'ru', 'dark'],
  [1920, 900, 'en', 'light'],
  [1200, 560, 'en', 'dark'],
] as const) {
  for (const empty of [false, true])
    test(`standalone semantic history ${width}, empty=${empty}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      const server = await startHostServer();
      const project = empty
        ? createEmptyVideoProject('Semantic history proof')
        : createVideoProjectFromRecording({
            recordingId: betaV1Fixture.records.recordings[0]!.id,
            filename: 'beta-v1.webm',
            width: 160,
            height: 90,
            duration: 10,
            mimeType: 'video/webm',
            size: 15,
          });
      project.duration = 10;
      if (!empty) {
        project.actionEvents = [
          {
            id: 'command',
            kind: 'KEY',
            anchor: { kind: 'project', time: 1 },
            label: 'Ctrl+K',
            point: null,
            data: {
              keyboardOnsetTime: 1,
              downTime: 1,
              upTime: 1,
              keyboardAttackId: 'command:down',
            },
          },
          {
            id: 'modifiers',
            kind: 'KEY',
            anchor: { kind: 'project', time: 3 },
            label: 'Alt+Shift',
            point: null,
            data: {
              modifierOnly: true,
              keyboardOnsetTime: 3,
              downTime: 3,
              upTime: 4,
              keyboardAttackId: 'modifiers:down',
            },
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
        const sourceClip = project.clips.find((clip) => clip.type === 'VIDEO')!;
        const sourceTrack = project.tracks.find((track) => track.id === sourceClip.trackId)!;
        const secondTrack = createVideoProjectTrack(
          'Second screen',
          project.tracks.length,
          sourceTrack.kind
        );
        project.tracks.push(secondTrack);
        project.clips.push({
          ...sourceClip,
          id: 'typing-overlap-clip',
          trackId: secondTrack.id,
          sourceInstanceId: 'typing-overlap-source',
        });
        project.cursorTrack = createVideoProjectCursorTrack('embedded-fallback');
        project.cursorTrack.samples = [
          { id: 'move', time: 0, x: 0, y: 0, visible: true, captureSegment: 0 },
          { id: 'dwell', time: 1, x: 80, y: 50, visible: true, captureSegment: 0 },
          { id: 'dwell-end', time: 2, x: 80, y: 50, visible: true, captureSegment: 0 },
          { id: 'gap', time: 3, x: 80, y: 50, visible: false, captureSegment: 0 },
          { id: 'return', time: 4, x: 110, y: 65, visible: true, captureSegment: 1 },
          { id: 'end', time: 5, x: 120, y: 70, visible: true, captureSegment: 1 },
        ];
      }
      expect(isValidVideoProject(project)).toBe(true);
      try {
        await page.emulateMedia({ colorScheme: theme });
        await applyHarnessBootstrap(page, {
          apiBehavior: { runtimeFallback: 'typed-success' },
          preserveMediaLibrary: true,
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
        if (!empty) {
          await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
          await page.locator('[data-ui="gallery.page.root"]').waitFor();
          await seedReviewVideo(page, 'review-vp8-opus.webm', {
            width: 160,
            height: 90,
            duration: 10,
          });
          await page.evaluate(async (fixture) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const request = indexedDB.open(fixture.databaseName);
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            const tx = db.transaction('recording_telemetry', 'readwrite');
            const done = new Promise<void>((resolve, reject) => {
              tx.oncomplete = () => resolve();
              tx.onabort = () => reject(tx.error);
            });
            tx.objectStore('recording_telemetry').put({
              recordingId: fixture.records.recordings[0]!.id,
              createdAt: 1,
              updatedAt: 1,
              captureMode: 'TAB',
              viewport: null,
              cursorTrack: null,
              actionEvents: [],
              signals: [
                {
                  id: 'typing',
                  kind: 'typing',
                  startTime: 1,
                  endTime: 4,
                  point: null,
                  data: {},
                },
              ],
            });
            await done;
            db.close();
          }, betaV1Fixture);
        }
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
          await expect(key).toContainText('Ctrl+K');
          const typing = row.locator(
            '[data-ui="video-editor.timeline.history-span-cluster"] button'
          );
          await expect(typing).toBeVisible();
          expect((await key.boundingBox())!.y).toBe((await typing.boundingBox())!.y);
          const caption = row.locator('[data-action-id="modifiers"] > span').first();
          if (width === 1920) {
            await expect(caption).toBeVisible();
            expect(await caption.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(
              true
            );
          }
          const exposed = await typing.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            for (let x = 12; x < rect.width - 12; x += 4) {
              if (
                node.contains(document.elementFromPoint(rect.left + x, rect.top + rect.height / 2))
              )
                return { x, y: rect.height / 2 };
            }
            return null;
          });
          expect(exposed).not.toBeNull();
          await typing.click({ position: exposed!, timeout: 5000 });
          await expect(page.getByRole('option')).toHaveCount(2);
          await page.getByRole('option').first().click();
          await expect(typing).toHaveAttribute('aria-pressed', 'true');
          await expect(caption).toBeVisible();
          expect(await caption.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
          await expect(caption).toHaveText('Alt+Shift');
          await key.click();
          await expect(key).toHaveAttribute('aria-pressed', 'true');
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
