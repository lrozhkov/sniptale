import { build } from 'esbuild';
import { encodeRecordingKeyboardRhythm } from '../../../../apps/extension/src/features/video/project/keyboard-rhythm';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoProjectTrack } from '../../../../apps/extension/src/features/video/project/factories/creation';
import {
  VideoTrackKind,
  type VideoProjectExportSettings,
} from '../../../../apps/extension/src/features/video/project/types';
import { assertExportReadyVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { parseHydratableVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import {
  chooseInspectorValue,
  checkInspectorPaintedFont,
  checkInspectorParameterRows,
} from '../support/inspector-utilities';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  OFFSCREEN_HARNESS_PATH,
  emitTrustedOffscreenHarnessRuntimeMessage,
  getRuntimeMessagesByType,
  VideoMessageType,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  const theme = index === 0 ? 'dark' : 'light';
  test(`Native action sounds retain scoped authoring and audition ${viewport.size.width} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const project = createVideoProjectFromRecording({
        recordingId: 'beta-v1-recording',
        filename: 'beta-v1.webm',
        width: 160,
        height: 90,
        duration: 12,
        mimeType: 'video/webm',
        size: bytes.length,
        hasAudio: false,
        sourceNormalizedActionEvents: [
          {
            id: 'paired',
            kind: 'CLICK',
            time: 1,
            duration: 0.3,
            point: { x: 0.2, y: 0.3 },
            label: 'Action sound proof',
            preset: 'NONE',
            data: {
              gestureId: 'paired',
              gestureType: 'hold',
              downTime: 1,
              upTime: 1.3,
              button: 0,
              completion: 'released',
              downX: 32,
              downY: 27,
              upX: 32,
              upY: 27,
              maxExcursionCssPx: 0,
              pressDuration: 0.3,
            },
          },
        ],
      });
      expect(parseHydratableVideoProject(project)).not.toBeNull();
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript((language) => {
        localStorage.setItem('sniptale-locale-preference', language);
        if (sessionStorage.getItem('action-sound-seeded')) {
          const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
          if (typeof bootstrap === 'object' && bootstrap !== null)
            Reflect.deleteProperty(bootstrap, 'videoProjects');
        }
        const Base = window.AudioContext;
        const starts: {
          frames: number;
          rate: number;
          when: number;
          duration: number;
          offset: number;
          peak: number;
        }[] = [];
        let closed = 0;
        const contextCalls: string[] = [],
          closeCalls: string[] = [];
        class ObservedAudio extends Base {
          constructor(options?: AudioContextOptions) {
            super(options);
            contextCalls.push(new Error('Native audio context creation').stack ?? '');
          }
          createBufferSource() {
            const node = super.createBufferSource();
            const original = node.start.bind(node);
            node.start = (when = 0, offset = 0, duration?: number) => {
              const buffer = node.buffer;
              if (buffer) {
                let peak = 0;
                for (const value of buffer.getChannelData(0))
                  peak = Math.max(peak, Math.abs(value));
                starts.push({
                  frames: buffer.length,
                  rate: node.playbackRate.value,
                  when,
                  duration: duration ?? buffer.duration,
                  offset,
                  peak,
                });
              }
              if (duration === undefined) original(when, offset);
              else original(when, offset, duration);
            };
            return node;
          }
          async close() {
            closed++;
            closeCalls.push(new Error('Native audio context closure').stack ?? '');
            await super.close();
          }
        }
        window.AudioContext = ObservedAudio;
        Reflect.set(window, 'nativeActionSoundProbe', (reset = false) => {
          if (reset) {
            starts.length = 0;
            closed = 0;
            contextCalls.length = 0;
            closeCalls.length = 0;
          }
          return {
            starts: [...starts],
            closed,
            contextCalls: [...contextCalls],
            closeCalls: [...closeCalls],
          };
        });
      }, locale);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.evaluate(() => sessionStorage.setItem('action-sound-seeded', 'true'));
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const select = async () => {
        await page.locator('[data-ui="video-editor.timeline.history-event"]').first().click();
        await page
          .locator('nav')
          .getByRole('button', { name: label('gallery.videoReview.actionAudio'), exact: true })
          .click();
      };
      await select();
      const owner = page.locator('[data-ui="video-editor.action-audio-fields"]');
      const row = owner.locator('[data-family="mouse"]');
      const choose = (key: Parameters<typeof translate>[0]) =>
        chooseInspectorValue(
          page,
          row,
          `${label('gallery.videoReview.actionAudioMouse')} · 1`,
          label(key)
        );
      const setting = async () =>
        (await readNativeVideoProject(page))?.actionFeedback?.[0]?.settings[0];
      const initial = (await readNativeVideoProject(page))!;
      await choose('gallery.videoReview.actionAudioMouseAlternate');
      await expect.poll(async () => (await setting())?.presetId).toBe('mouse-alternate-v1');
      await expect(
        owner.getByRole('switch', {
          name: label('gallery.videoReview.actionAudioDown'),
          exact: true,
        })
      ).toHaveCount(0);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(
          async () => (await readNativeVideoProject(page))?.actionFeedback?.[0]?.settings.length
        )
        .toBe(0);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect.poll(async () => (await setting())?.presetId).toBe('mouse-alternate-v1');
      await choose('gallery.videoReview.actionAudioMousePaired');
      await expect.poll(async () => (await setting())?.presetId).toBe('mouse-classic-paired-v2');
      await expect(
        owner.getByRole('switch', {
          name: label('gallery.videoReview.actionAudioDown'),
          exact: true,
        })
      ).toBeChecked();
      const volume = owner.getByRole('textbox', {
        name: label('gallery.videoReview.actionAudioVolume'),
        exact: true,
      });
      await volume.fill('30');
      await volume.press('Enter');
      await expect.poll(async () => (await setting())?.volume).toBe(0.3);
      const offset = owner.getByRole('textbox', {
        name: label('gallery.videoReview.actionAudioOffset'),
        exact: true,
      });
      await offset.fill('0.1');
      await offset.press('Enter');
      await expect.poll(async () => (await setting())?.offset).toBe(0.1);
      await checkInspectorPaintedFont(page, volume, 'numeric');
      const listen = owner.getByRole('button', {
        name: label('gallery.videoReview.actionAudioListen'),
        exact: true,
      });
      const reset = owner.getByRole('button', {
        name: label('gallery.videoReview.actionAudioReset'),
        exact: true,
      });
      await expect(listen.locator('svg')).toHaveCount(1);
      await expect(reset.locator('svg')).toHaveCount(1);
      const probe = (reset = false) =>
        page.evaluate((reset) => {
          const read = Reflect.get(window, 'nativeActionSoundProbe');
          if (typeof read !== 'function') throw new Error('Missing Native audio probe');
          return read(reset) as {
            starts: {
              frames: number;
              rate: number;
              when: number;
              duration: number;
              offset: number;
              peak: number;
            }[];
            closed: number;
          };
        }, reset);
      const accepted = (await readNativeVideoProject(page))!;
      expect(accepted.clips).toMatchObject(initial.clips);
      const time = await page.locator('[data-playback-counter="true"]').textContent();
      await probe(true);
      await listen.scrollIntoViewIfNeeded();
      await listen.click();
      await expect
        .poll(async () => (await probe()).starts.length)
        .toBe(2)
        .catch(async (error: unknown) => {
          await writeFile(
            info.outputPath('native-audition-failure.json'),
            JSON.stringify(await probe(), null, 2)
          );
          throw error;
        });
      const played = (await probe()).starts;
      await writeFile(
        info.outputPath('native-audition-schedule.json'),
        JSON.stringify(played, null, 2)
      );
      expect(played.map((item) => item.frames)).toEqual([7995, 7995]);
      expect(played.every((item) => item.offset <= 1 / 44100)).toBe(true);
      expect(played.every((item) => item.rate === 1 && item.peak > 0 && item.duration > 0)).toBe(
        true
      );
      expect(played[1]!.when - played[0]!.when).toBeCloseTo(0.3, 2);
      await expect.poll(async () => (await probe()).closed).toBeGreaterThan(0);
      expect(await readNativeVideoProject(page)).toEqual(accepted);
      expect(await page.locator('[data-playback-counter="true"]').textContent()).toBe(time);
      await page.route('**/action-sounds/v1/mouse-click.wav', (route) =>
        route.fulfill({ status: 503, body: '' })
      );
      await listen.click();
      await expect(page.getByRole('alert')).toHaveText(
        label('gallery.videoReview.actionAudioResource')
      );
      expect(await readNativeVideoProject(page)).toEqual(accepted);
      await page.unroute('**/action-sounds/v1/mouse-click.wav');
      await probe(true);
      await listen.click();
      await expect.poll(async () => (await probe()).starts.length).toBe(2);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      await expect.poll(async () => (await probe()).closed).toBeGreaterThan(0);
      await select();
      await reset.scrollIntoViewIfNeeded();
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      const rail = inspector.locator('[data-ui="video-editor.inspector.categories"] > nav');
      const railBefore = await rail.boundingBox();
      await reset.scrollIntoViewIfNeeded();
      expect((await rail.boundingBox())?.y).toBe(railBefore?.y);
      await checkInspectorParameterRows(owner);
      await page.screenshot({
        path: info.outputPath('action-audio-controls.png'),
        fullPage: false,
      });
      const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
      if (index === 0) await page.locator('[data-ui="video-editor.materials.close"]').click();
      for (const width of [359, 360, 361]) {
        const current = (await inspector.boundingBox())!.width;
        const bounds = (await handle.boundingBox())!;
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 12);
        await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width / 2 + current - width, bounds.y + 12);
        await page.mouse.up();
        await expect
          .poll(async () => Math.round((await inspector.boundingBox())!.width))
          .toBe(width);
        const railBounds = await rail.boundingBox();
        await reset.scrollIntoViewIfNeeded();
        expect((await rail.boundingBox())?.y).toBe(railBounds?.y);
        expect(
          await owner.evaluate((node) => {
            const body = node.closest('[data-ui="video-editor.inspector.categories"] > div');
            return body instanceof HTMLElement && body.scrollWidth <= body.clientWidth + 1;
          })
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`action-inspector-${width}.png`),
          fullPage: false,
        });
      }

      await reset.click();
      await expect
        .poll(
          async () => (await readNativeVideoProject(page))?.actionFeedback?.[0]?.settings.length
        )
        .toBe(0);
      const after = (await readNativeVideoProject(page))!;
      expect(after.actionEvents).toEqual(initial.actionEvents);
      expect(after.clips).toEqual(accepted.clips);
      expect(after.assets).toEqual(initial.assets);
      expect(after.actionFeedback?.[0]?.signals).toEqual(initial.actionFeedback?.[0]?.signals);
      await page.reload();
      await select();
      await expect(listen).toBeDisabled();
      if (index === 0) {
        await page.setViewportSize({ width: 1200, height: 560 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
        ).toBe(true);
      }
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const format of ['WEBM', 'MP4'] as const) {
  test(`Native encoded action sounds preserve overlapping source instances, cut and speed ${format}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1280, height: 560 });
    const host = await startHostServer();
    try {
      const bundle = await build({
        entryPoints: ['tooling/test/e2e/support/action-audio-native-probe.ts'],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        loader: { '.woff2': 'dataurl' },
        define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
      });
      await applyHarnessBootstrap(page, { preserveMediaLibrary: true });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      const source = await page.evaluate(
        async ({ text, encoded }) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
          try {
            return await (await import(url)).silentSource(encoded, 'webm');
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        {
          text: bundle.outputFiles[0]!.text,
          encoded: (
            await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url))
          ).toString('base64'),
        }
      );
      expect(source.index.audioCodec).toBeNull();
      const bytes = Buffer.from(source.encoded, 'base64');
      await seedReviewVideo(
        page,
        'silent.webm',
        { width: 160, height: 90, duration: 12 },
        false,
        false,
        { bytes, mimeType: 'video/webm' }
      );
      const project = createVideoProjectFromRecording({
        recordingId: 'beta-v1-recording',
        filename: 'silent.webm',
        width: 160,
        height: 90,
        duration: 12,
        mimeType: 'video/webm',
        size: bytes.length,
        hasAudio: false,
        sourceNormalizedActionEvents: [
          {
            id: 'paired',
            kind: 'CLICK',
            time: 1,
            duration: 0.4,
            point: { x: 0.2, y: 0.3 },
            label: '',
            preset: 'NONE',
            data: {
              gestureId: 'paired',
              gestureType: 'hold',
              downTime: 1,
              upTime: 1.4,
              button: 0,
              completion: 'released',
              downX: 32,
              downY: 27,
              upX: 32,
              upY: 27,
              maxExcursionCssPx: 0,
              pressDuration: 0.4,
            },
          },
          {
            id: 'key',
            kind: 'KEY',
            time: 3,
            duration: 0,
            point: null,
            label: '',
            preset: 'NONE',
            data: { combo: 'A', keyboardAttackId: 'key-press', keyboardOnsetTime: 3 },
            keyboardRepeats: [encodeRecordingKeyboardRhythm('repeat', [3.2])],
          },
        ],
        recordingSignals: [
          {
            id: 'typing',
            kind: 'typing',
            startTime: 4,
            endTime: 5,
            point: null,
            data: { activity: 'keyboard', captureSegment: 0 },
          },
        ],
      });
      const base = project.clips.find((clip) => clip.type === 'VIDEO')!;
      const track = createVideoProjectTrack('Repeated source', -1, VideoTrackKind.PRIMARY);
      project.tracks.push(track);
      project.duration = 4;
      project.clips = [
        { ...base, sourceStart: 0.5, sourceDuration: 6, duration: 3, playbackRate: 2 },
        {
          ...base,
          id: 'copy',
          sourceInstanceId: 'copy',
          trackId: track.id,
          timelineLaneId: track.logicalLanes[0]!.id,
          startTime: 1,
          sourceStart: 0.5,
          sourceDuration: 3,
          duration: 3,
          playbackRate: 1,
        },
      ];
      const group = project.actionFeedback![0]!;
      group.settings = [
        {
          ref: { kind: 'action', id: 'paired' },
          enabled: true,
          presetId: 'mouse-classic-paired-v2',
          volume: 0.4,
          offset: 0.05,
          downGain: 1,
          upGain: 0.5,
        },
        {
          ref: { kind: 'action', id: 'key' },
          enabled: true,
          presetId: 'keyboard-recorded-v2',
          includeRepeats: true,
          volume: 0.5,
          offset: 0,
        },
        {
          ref: { kind: 'signal', id: 'typing' },
          enabled: true,
          presetId: 'typing-natural-v1',
          volume: 0.3,
          offset: 0,
        },
      ];
      const copy = structuredClone(group);
      copy.sourceInstanceId = 'copy';
      copy.settings[0]!.volume = 0.8;
      copy.settings[1]!.includeRepeats = false;
      project.actionFeedback!.push(copy);
      project.actionEvents.push(
        ...project.actionEvents.flatMap((event) =>
          event.anchor.kind === 'recording-source'
            ? [
                {
                  ...event,
                  id: `${event.id}-copy`,
                  anchor: { ...event.anchor, sourceInstanceId: 'copy' },
                },
              ]
            : []
        )
      );
      assertExportReadyVideoProject(project);
      const snapshot = structuredClone(project);
      if (format === 'WEBM') {
        await applyHarnessBootstrap(page, {
          preserveMediaLibrary: true,
          videoProjects: [project],
          storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'dark' },
        });
        await page.addInitScript(() => {
          localStorage.setItem('sniptale-locale-preference', 'en');
          const Base = window.AudioContext;
          const starts: {
            frames: number;
            rate: number;
            when: number;
            offset: number;
            duration: number;
          }[] = [];
          class ObservedMontageAudio extends Base {
            createBufferSource() {
              const node = super.createBufferSource();
              const start = node.start.bind(node);
              node.start = (when = 0, offset = 0, duration?: number) => {
                if (node.buffer)
                  starts.push({
                    frames: node.buffer.length,
                    rate: node.playbackRate.value,
                    when,
                    offset,
                    duration: duration ?? node.buffer.duration,
                  });
                if (duration === undefined) start(when, offset);
                else start(when, offset, duration);
              };
              return node;
            }
          }
          window.AudioContext = ObservedMontageAudio;
          Reflect.set(window, 'nativeMontageAudioStarts', starts);
        });
        await page.goto(
          `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=dark`
        );
        await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
        const accepted = (await readNativeVideoProject(page))!;
        expect(accepted.clips).toMatchObject(project.clips);
        expect(accepted.actionFeedback).toEqual(project.actionFeedback);
        await page
          .getByRole('button', { name: translate('videoEditor.timeline.play', 'en'), exact: true })
          .click();
        await expect(page.locator('[data-playback-counter="true"]')).toContainText('0:04.000', {
          timeout: 30000,
        });
        await expect(
          page.getByRole('button', {
            name: translate('videoEditor.timeline.play', 'en'),
            exact: true,
          })
        ).toBeVisible();
        const starts = await page.evaluate(() => {
          const raw: unknown = Reflect.get(window, 'nativeMontageAudioStarts');
          if (!Array.isArray(raw)) throw new Error('Missing montage audio observation.');
          return raw.flatMap((item: unknown) => {
            if (
              typeof item !== 'object' ||
              item === null ||
              !('frames' in item) ||
              typeof item.frames !== 'number' ||
              !('rate' in item) ||
              typeof item.rate !== 'number' ||
              !('when' in item) ||
              typeof item.when !== 'number' ||
              !('offset' in item) ||
              typeof item.offset !== 'number' ||
              !('duration' in item) ||
              typeof item.duration !== 'number'
            )
              throw new Error('Invalid montage audio observation.');
            return [
              {
                frames: item.frames,
                rate: item.rate,
                when: item.when,
                offset: item.offset,
                duration: item.duration,
              },
            ];
          });
        });
        await writeFile(
          info.outputPath('native-montage-audio.json'),
          JSON.stringify(starts, null, 2)
        );
        const mouse = starts
          .filter((item) => item.frames === 7995)
          .sort((a, b) => a.when - a.offset - b.when + b.offset);
        expect(mouse).toHaveLength(4);
        const origin = mouse[0]!.when - mouse[0]!.offset - 0.3;
        // The live preview clock can drift by a few display frames during rendering.
        const at = (item: (typeof starts)[number]) => item.when - item.offset - origin;
        [0.3, 0.5, 1.55, 1.95].forEach((time, index) =>
          expect(Math.abs(at(mouse[index]!) - time)).toBeLessThan(0.08)
        );
        expect(starts.every((item) => item.rate === 1 && item.duration > 0)).toBe(true);
        const keyboard = starts.filter((item) => item.frames < 6000);
        for (const time of [1.25, 1.35, 3.5])
          expect(keyboard.some((item) => Math.abs(at(item) - time) < 0.06)).toBe(true);
        expect(keyboard.some((item) => at(item) >= 1.75 && at(item) < 2.25)).toBe(true);
        expect(keyboard.some((item) => Math.abs(at(item) - 3.7) < 0.06)).toBe(false);
        const after = (await readNativeVideoProject(page))!;
        expect(after.clips).toEqual(accepted.clips);
        expect(after.actionFeedback).toEqual(accepted.actionFeedback);
        expect(after.actionEvents).toEqual(accepted.actionEvents);
        expect(after.assets).toEqual(accepted.assets);
      }
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const jobId = `native-action-audio-${format.toLowerCase()}`;
      const input = await page.evaluate(
        async ({ jobId, project }) => {
          if (!window.__sniptaleOffscreenHarness) throw new Error('Missing export bridge.');
          return window.__sniptaleOffscreenHarness.stageProjectExportInput(jobId, project);
        },
        { jobId, project }
      );
      const settings: VideoProjectExportSettings = {
        format,
        fps: 5,
        width: 160,
        height: 90,
        quality: 'MEDIUM',
        resolution: 'SOURCE',
        scope: 'project',
        burnInSubtitles: false,
        subtitleSidecarFormats: [],
        downloadAfterExport: false,
        ...(format === 'MP4' ? { mp4VideoCodec: 'VP9' } : { webmVideoCodec: 'VP9' }),
      };
      await emitTrustedOffscreenHarnessRuntimeMessage(page, {
        type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
        jobId,
        input,
        settings,
      });
      await expect
        .poll(
          async () => {
            const failures = await getRuntimeMessagesByType(
              page,
              VideoMessageType.PROJECT_EXPORT_FAILED
            );
            if (failures.some((message) => message.jobId === jobId))
              throw new Error(JSON.stringify(failures));
            return (
              await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_COMPLETED)
            ).some((message) => message.jobId === jobId);
          },
          { timeout: 90000 }
        )
        .toBe(true);
      const completed = (
        await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_COMPLETED)
      ).find((message) => message.jobId === jobId)!;
      if (typeof completed.exportId !== 'string') throw new Error('Missing export identity.');
      const proof = await page.evaluate(async (exportId) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sniptale-db');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        const entry: unknown = await new Promise((resolve, reject) => {
          const request = db
            .transaction('project_exports')
            .objectStore('project_exports')
            .get(exportId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        db.close();
        if (
          typeof entry !== 'object' ||
          entry === null ||
          !('assetId' in entry) ||
          typeof entry.assetId !== 'string'
        )
          throw new Error('Missing export asset.');
        const objects = await (
          await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
        ).getDirectoryHandle('objects');
        const file = await (await objects.getFileHandle(entry.assetId)).getFile();
        const context = new AudioContext({ sampleRate: 48000 });
        try {
          const pcm = await context.decodeAudioData(await file.arrayBuffer());
          const data = pcm.getChannelData(0);
          const energy = (start: number, end: number) => {
            let value = 0;
            for (
              let i = Math.round(start * pcm.sampleRate);
              i < Math.min(data.length, Math.round(end * pcm.sampleRate));
              i++
            )
              value += data[i]! ** 2;
            return value;
          };
          let correlation = 0;
          // Lossy codecs can shift packet boundaries by up to 20ms.
          for (let lag = -960; lag <= 960; lag++) {
            let dot = 0,
              left = 0,
              right = 0;
            for (let i = 240; i < 6720; i++) {
              const a = data[Math.round(0.3 * pcm.sampleRate) + i]!;
              const b = data[Math.round(1.55 * pcm.sampleRate) + i + lag]!;
              dot += a * b;
              left += a * a;
              right += b * b;
            }
            if (left && right) correlation = Math.max(correlation, dot / Math.sqrt(left * right));
          }
          return {
            correlation,
            size: file.size,
            duration: pcm.duration,
            silence: energy(0.05, 0.25) + energy(0.7, 1.15) + energy(3.8, 3.95),
            down: energy(0.3, 0.45),
            up: energy(0.5, 0.64),
            duplicate: energy(1.55, 1.7),
            key: energy(1.25, 1.39),
            duplicateKey: energy(3.5, 3.64),
            typing: energy(2.1, 2.24),
            recordedRepeat: energy(1.36, 1.4),
            disabledRepeat: energy(3.72, 3.79),
            windows: Array.from({ length: 400 }, (_, index) =>
              energy(index / 100, (index + 1) / 100)
            ),
          };
        } finally {
          await context.close();
        }
      }, completed.exportId);
      await writeFile(
        info.outputPath(`native-action-audio-${format.toLowerCase()}.json`),
        JSON.stringify(proof, null, 2)
      );
      expect(proof.size).toBeGreaterThan(1000);
      expect(proof.duration).toBeGreaterThanOrEqual(3.99);
      expect(proof.duration).toBeLessThan(4.15);
      for (const energy of [
        proof.down,
        proof.up,
        proof.duplicate,
        proof.key,
        proof.duplicateKey,
        proof.typing,
      ])
        expect(energy).toBeGreaterThan(0.001);
      expect(proof.silence).toBeLessThan(0.0001);
      expect(proof.recordedRepeat).toBeGreaterThan(0.001);
      expect(proof.disabledRepeat).toBeLessThan(0.0001);
      // The independent windows allow codec pre-echo within one 10ms analysis window.
      const firstAttack = proof.windows.findIndex((energy) => energy > 0.001) / 100;
      expect(firstAttack).toBeGreaterThanOrEqual(0.28);
      expect(firstAttack).toBeLessThanOrEqual(0.31);
      expect(proof.correlation).toBeGreaterThan(0.85);
      expect(proof.duplicate / proof.down).toBeGreaterThan(3.2);
      expect(proof.duplicate / proof.down).toBeLessThan(4.8);
      expect(project).toEqual(snapshot);
      await page.route('**/action-sounds/v1/*.wav', (route) =>
        route.fulfill({ status: 503, body: '' })
      );
      for (const retry of [false, true]) {
        if (retry) await page.unroute('**/action-sounds/v1/*.wav');
        const attempt = `${jobId}-${retry ? 'retry' : 'unavailable'}`;
        const staged = await page.evaluate(
          async ({ jobId, project }) => {
            if (!window.__sniptaleOffscreenHarness) throw new Error('Missing export bridge.');
            return window.__sniptaleOffscreenHarness.stageProjectExportInput(jobId, project);
          },
          { jobId: attempt, project }
        );
        await emitTrustedOffscreenHarnessRuntimeMessage(page, {
          type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
          jobId: attempt,
          input: staged,
          settings,
        });
        const expected = retry
          ? VideoMessageType.PROJECT_EXPORT_COMPLETED
          : VideoMessageType.PROJECT_EXPORT_FAILED;
        await expect
          .poll(
            async () =>
              (await getRuntimeMessagesByType(page, expected)).some(
                (message) => message.jobId === attempt
              ),
            { timeout: 90000 }
          )
          .toBe(true);
        const opposite = retry
          ? VideoMessageType.PROJECT_EXPORT_FAILED
          : VideoMessageType.PROJECT_EXPORT_COMPLETED;
        expect(
          (await getRuntimeMessagesByType(page, opposite)).some(
            (message) => message.jobId === attempt
          )
        ).toBe(false);
      }
      const retained = await page.evaluate(async () => {
        const objects = await (
          await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
        ).getDirectoryHandle('objects');
        const file = await (await objects.getFileHandle('beta-v1-recording-asset')).getFile();
        return btoa(
          Array.from(new Uint8Array(await file.arrayBuffer()), (byte) =>
            String.fromCharCode(byte)
          ).join('')
        );
      });
      expect(retained).toBe(source.encoded);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
