import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import {
  checkInspectorPaintedFont,
  checkInspectorParameterRows,
} from '../support/inspector-utilities';
import { readNativeVideoProject } from '../support/native-video-project';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  createVideoProjectFromRecording,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createAudioClipFromAsset } from '../../../../apps/extension/src/features/video/project/factories/clip';
import { splitProjectClipsAtTime } from '../../../../apps/extension/src/video-editor/project/state/clip-timeline/split';
import { anchorReviewVoiceoverAtSource } from '../../../../apps/extension/src/features/video/review/voiceover-edits';
import { buildReviewTimeMap } from '../../../../apps/extension/src/features/video/review/timeline';
import { isExportReadyVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
  getRuntimeMessagesByType,
  VideoMessageType,
} from '../extension-critical.helpers';

async function latestExportRms(page: Page, offset = 0) {
  const messages = await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_COMPLETED);
  const exportId = messages.at(-1)?.exportId;
  if (typeof exportId !== 'string') throw new Error('Missing completed export');
  return page.evaluate(
    async ({ exportId, offset }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const entry: unknown = await new Promise((resolve, reject) => {
        const request = db
          .transaction('project_exports', 'readonly')
          .objectStore('project_exports')
          .get(exportId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('assetId' in entry) ||
        typeof entry.assetId !== 'string'
      )
        throw new Error('Missing export bytes');
      const objects = await (
        await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
      ).getDirectoryHandle('objects');
      const file = await (await objects.getFileHandle(entry.assetId)).getFile();
      const context = new AudioContext();
      try {
        const pcm = await context.decodeAudioData(await file.arrayBuffer());
        const channel = pcm.getChannelData(0);
        return [0.1, 0.6, 1.1, 1.6].map((time) => {
          const start = Math.round((time + offset) * pcm.sampleRate);
          const end = Math.round((time + offset + 0.15) * pcm.sampleRate);
          let squares = 0;
          for (let index = start; index < end; index++) squares += channel[index]! ** 2;
          return Math.sqrt(squares / (end - start));
        });
      } finally {
        await context.close();
      }
    },
    { exportId, offset }
  );
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const format = index === 0 ? 'WEBM' : 'MP4';
  test(`whole source voice audio survives split and range export ${viewport.name} ${format}`, async ({
    page,
  }, info) => {
    test.setTimeout(240000);
    await page.setViewportSize({ ...viewport.size });
    const host = await startHostServer();
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      let project = createVideoProjectFromRecording({
        recordingId: 'beta-v1-recording',
        filename: 'Source voice.webm',
        width: 640,
        height: 360,
        duration: 12,
        mimeType: 'video/webm',
        size: bytes.length,
        hasAudio: true,
      });
      const video = project.clips.find((clip) => clip.type === 'VIDEO');
      if (!video || video.type !== 'VIDEO') throw new Error('Missing source video');
      for (const clip of project.clips)
        if (clip.type === 'VIDEO' || clip.type === 'AUDIO') {
          clip.duration = clip.sourceDuration = 3;
          clip.muted = true;
        }
      const originalAudio = project.clips.find((clip) => clip.type === 'AUDIO');
      if (!originalAudio || originalAudio.type !== 'AUDIO')
        throw new Error('Missing original audio');
      originalAudio.muted = false;
      const source = project.assets.find((asset) => asset.id === video.assetId)!;
      const material = createVideoProjectAsset(
        'Voice',
        'AUDIO',
        { ...source.source },
        { ...source.metadata }
      );
      const track = createVideoProjectTrack('Voice', 2, 'AUDIO');
      project.assets.push(material);
      project.tracks.push(track);
      const reference = buildReviewTimeMap(12, []);
      project.version = 31;
      project.duration = 3;
      project.sourceVoiceoverDocuments = [
        {
          id: 'accepted-source-voice',
          enabled: true,
          trackId: track.id,
          binding: {
            kind: 'source',
            assetId: video.assetId,
            sourceInstanceId: video.sourceInstanceId ?? video.id,
          },
          originalAudioSourceInstanceId: originalAudio.sourceInstanceId ?? originalAudio.id,
          originalAudioMuteVolume: 0.25,
          reference,
          take: anchorReviewVoiceoverAtSource(
            {
              id: 'whole-take',
              assetId: material.id,
              timelineStart: 0,
              sourceOffset: 0.37,
              duration: 4.5,
              tempo: 1.5,
              volume: 0.8,
              muted: false,
              fadeIn: 0.3,
              fadeOut: 0.6,
              transcript: { version: 1, phrases: [], replacements: [] },
              textSnapshot: {
                kind: 'microphone',
                textId: 'retained-script',
                revision: 0,
                timingRevision: 0,
                text: 'Accepted voice script',
                start: 0,
                end: 3,
                timeDomain: 'source',
              },
            },
            reference
          ),
        },
      ];
      project = splitProjectClipsAtTime(project, video.id, 1.5);
      expect(project.clips.filter((clip) => clip.type === 'VIDEO')).toHaveLength(2);
      expect(isExportReadyVideoProject(project)).toBe(true);
      const baseline = structuredClone(project);
      baseline.sourceVoiceoverDocuments = [];
      const audio = createAudioClipFromAsset(track.id, material);
      Object.assign(audio, {
        duration: 3,
        sourceStart: 0.37,
        sourceDuration: 4.5,
        playbackRate: 1.5,
        audioGainStart: 0.8,
        audioGainEnd: 0.8,
        volumeEnvelopeStart: 0.8,
        volumeEnvelopeEnd: 0.8,
        originalAudioMute: {
          volume: 0.25,
          targets: [
            {
              assetId: originalAudio.assetId,
              sourceInstanceId: originalAudio.sourceInstanceId ?? originalAudio.id,
            },
          ],
        },
        fadeInMs: 200,
        fadeOutMs: 400,
      });
      baseline.clips.push(audio);
      expect(isExportReadyVideoProject(baseline)).toBe(true);
      await applyHarnessBootstrap(page, { preserveMediaLibrary: true, videoProjects: [project] });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 640,
        height: 360,
        duration: 12,
      });
      await page.addInitScript(() => {
        localStorage.setItem('sniptale-locale-preference', 'en');
        const Base = window.AudioContext;
        const starts: {
          frames: number;
          rate: number;
          offset: number;
          duration: number;
          rms: number;
          stopped: boolean;
        }[] = [];
        class ObservedVoiceAudio extends Base {
          createBufferSource() {
            const node = super.createBufferSource();
            const start = node.start.bind(node),
              stop = node.stop.bind(node);
            let observation: (typeof starts)[number] | undefined;
            node.start = (when = 0, offset = 0, duration?: number) => {
              if (node.buffer) {
                const samples = node.buffer.getChannelData(0);
                const from = Math.round(offset * node.buffer.sampleRate);
                const to = Math.min(
                  samples.length,
                  from + Math.round(node.buffer.sampleRate * 0.1)
                );
                let sum = 0;
                for (let index = from; index < to; index++) sum += samples[index]! ** 2;
                observation = {
                  frames: node.buffer.length,
                  rate: node.playbackRate.value,
                  offset,
                  duration: duration ?? node.buffer.duration,
                  rms: Math.sqrt(sum / Math.max(1, to - from)),
                  stopped: false,
                };
                starts.push(observation);
              }
              if (duration === undefined) start(when, offset);
              else start(when, offset, duration);
            };
            node.stop = (when?: number) => {
              if (observation) observation.stopped = true;
              stop(when);
            };
            return node;
          }
        }
        window.AudioContext = ObservedVoiceAudio;
        Reflect.set(window, 'sourceVoiceAudioStarts', starts);
      });
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}`);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const accepted = await readNativeVideoProject(page);
      if (!accepted) throw new Error('Missing accepted project');
      await page.evaluate(() => sessionStorage.setItem('source-voice-project-seeded', 'true'));
      await page.addInitScript(() => {
        if (!sessionStorage.getItem('source-voice-project-seeded')) return;
        const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
        if (typeof bootstrap === 'object' && bootstrap !== null)
          Reflect.deleteProperty(bootstrap, 'videoProjects');
      });

      const canonicalClips = hydrateVideoProject(accepted).clips;
      expect(accepted?.sourceVoiceoverDocuments).toEqual(project.sourceVoiceoverDocuments);
      const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
      const voiceViews = page.locator('[data-source-voiceover-document="accepted-source-voice"]');
      await expect(voiceViews).toHaveCount(2);
      const counter = page.locator('[data-playback-counter]');
      const beforeViewClick = await counter.textContent();
      await voiceViews.first().click();
      await voiceViews.last().click();
      await expect
        .poll(async () =>
          voiceViews.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-pressed')))
        )
        .toEqual(['true', 'true']);
      expect(await counter.textContent()).toBe(beforeViewClick);
      await voiceViews.first().focus();
      await voiceViews.first().press('Enter');
      expect((await readNativeVideoProject(page))?.clips).toEqual(accepted?.clips);
      const sourceRow = page.locator(`[data-material-id="${source.id}"]`);

      await page
        .getByRole('button', { name: label('videoEditor.timeline.seekToEnd'), exact: true })
        .click();
      const canvasScroll = page.locator('[data-ui="video-editor.timeline.canvas-scroll"]');
      await canvasScroll.evaluate((node) => {
        node.scrollTop = 0;
      });
      await sourceRow.locator('[data-ui="video-editor.materials.show-use"] button').click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.audioVoiceover'), exact: true })
        .click();
      const inspector = page.locator('[data-ui="video-editor.inspector.source-voiceover"]');
      await expect(inspector).toBeVisible();
      await expect(counter).toContainText('0:01.500');
      const shownView = voiceViews.last();
      await expect
        .poll(async () => {
          const rect = await shownView.boundingBox();
          const viewport = await canvasScroll.boundingBox();
          return (
            !!rect &&
            !!viewport &&
            rect.y >= viewport.y - 1 &&
            rect.y + rect.height <= viewport.y + viewport.height + 1
          );
        })
        .toBe(true);
      await canvasScroll.evaluate((node) => {
        node.scrollTop = 0;
      });
      await sourceRow.locator('[data-ui="video-editor.materials.show-use"] button').click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.audioVoiceover'), exact: true })
        .click();
      await expect
        .poll(async () => {
          const rect = await shownView.boundingBox();
          const viewport = await canvasScroll.boundingBox();
          return (
            !!rect &&
            !!viewport &&
            rect.y >= viewport.y - 1 &&
            rect.y + rect.height <= viewport.y + viewport.height + 1
          );
        })
        .toBe(true);
      const fitVoice = page.locator('[data-ui="video-editor.timeline.toolbar.fit-selection"]');
      await expect(fitVoice).toBeEnabled();
      await fitVoice.click();
      await expect
        .poll(async () => {
          const viewport = await canvasScroll.boundingBox();
          const first = await voiceViews.first().boundingBox();
          const last = await voiceViews.last().boundingBox();
          return (
            !!viewport &&
            !!first &&
            !!last &&
            first.x >= viewport.x - 1 &&
            last.x + last.width <= viewport.x + viewport.width + 1
          );
        })
        .toBe(true);
      expect((await readNativeVideoProject(page))?.sourceVoiceoverDocuments).toEqual(
        accepted.sourceVoiceoverDocuments
      );
      expect((await readNativeVideoProject(page))?.clips).toEqual(accepted.clips);
      await page.screenshot({
        path: info.outputPath('source-voice-navigation.png'),
        fullPage: false,
      });
      await page.locator('[data-ui="video-editor.timeline.toolbar.fit-project"]').click();
      await page
        .getByRole('button', { name: label('videoEditor.timeline.seekToStart'), exact: true })
        .click();

      const take = async () =>
        (await readNativeVideoProject(page))?.sourceVoiceoverDocuments?.[0]?.take;
      await inspector
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupTiming'),
          exact: true,
        })
        .click();
      const originalTake = await take();
      const position = inspector.getByRole('textbox', {
        name: label('videoEditor.app.sourcePosition'),
        exact: true,
      });
      await position.fill('0.25');
      await position.press('Tab');
      await expect.poll(async () => (await take())?.timelineStart).toBe(0.25);
      expect((await take())?.sourceOffset).toBe(originalTake?.sourceOffset);
      expect((await take())?.duration).toBe(originalTake?.duration);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(take).toEqual(originalTake);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect.poll(async () => (await take())?.timelineStart).toBe(0.25);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(take).toEqual(originalTake);
      const fileStart = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.rangeStart'),
        exact: true,
      });
      const fileEnd = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.rangeEnd'),
        exact: true,
      });
      await fileStart.fill('0.67');
      await fileStart.press('Tab');
      await expect.poll(async () => (await take())?.sourceOffset).toBe(0.67);
      expect((await take())?.duration).toBeCloseTo(4.2, 7);
      expect((await take())?.timelineStart).toBeCloseTo(0.2, 7);
      expect((await take())?.tempo).toBe(1.5);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(take).toEqual(originalTake);
      await fileEnd.fill('4.57');
      await fileEnd.press('Tab');
      await expect.poll(async () => (await take())?.duration).toBeCloseTo(4.2, 7);
      await checkInspectorParameterRows(inspector);
      await checkInspectorPaintedFont(page, position, 'voice-source-position');
      await page.screenshot({
        path: info.outputPath('source-voice-timing-inspector.png'),
        fullPage: false,
      });
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(take).toEqual(originalTake);
      await position.fill('1');
      await position.press('Escape');
      await position.press('Tab');
      expect(await take()).toEqual(originalTake);
      expect((await readNativeVideoProject(page))?.clips).toEqual(canonicalClips);
      await inspector
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAudio'),
          exact: true,
        })
        .click();
      const level = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.audioClipVolume'),
        exact: true,
      });
      await level.fill('65');
      await level.press('Tab');
      await expect.poll(async () => (await take())?.volume).toBe(0.65);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(async () => (await take())?.volume).toBe(0.8);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect.poll(async () => (await take())?.volume).toBe(0.65);
      await level.fill('23');
      await level.press('Escape');
      await level.press('Tab');
      expect((await take())?.volume).toBe(0.65);
      const tempo = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.voiceoverTempo'),
        exact: true,
      });
      await tempo.fill('2');
      await tempo.press('Tab');
      await expect.poll(async () => (await take())?.tempo).toBe(2);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(async () => (await take())?.tempo).toBe(1.5);
      await page.screenshot({
        path: info.outputPath('source-voice-audio-inspector.png'),
        fullPage: false,
      });
      const animation = inspector.locator('nav').getByRole('button', {
        name: label('videoEditor.sidebar.inspectorGroupAnimation'),
        exact: true,
      });
      await animation.click();
      const fade = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.audioFadeIn'),
        exact: true,
      });
      await fade.fill('0.5');
      await fade.press('Tab');
      await expect.poll(async () => (await take())?.fadeIn).toBe(0.5);
      await page.screenshot({
        path: info.outputPath('source-voice-fade-inspector.png'),
        fullPage: false,
      });
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(async () => (await take())?.fadeIn).toBe(0.3);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(async () => (await take())?.volume).toBe(0.8);
      const rail = inspector.locator('nav');
      await expect(rail).toBeVisible();
      await rail
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAudio'),
          exact: true,
        })
        .click();
      await expect(level).toBeVisible();
      const railBefore = await rail.boundingBox();
      await level.scrollIntoViewIfNeeded();
      const railAfter = await rail.boundingBox();
      expect(railAfter?.x).toBe(railBefore?.x);
      expect(railAfter?.y).toBe(railBefore?.y);
      await checkInspectorPaintedFont(page, level, 'voice-level');
      await checkInspectorParameterRows(inspector);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false
      );
      await rail
        .getByRole('button', { name: label('gallery.videoReview.audioOriginal'), exact: true })
        .click();
      const originalLevel = inspector.getByRole('textbox', {
        name: label('videoEditor.sidebar.originalAudioLevel'),
        exact: true,
      });
      await originalLevel.fill('50');
      await originalLevel.press('Tab');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.sourceVoiceoverDocuments?.[0]
              ?.originalAudioMuteVolume
        )
        .toBe(0.5);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.sourceVoiceoverDocuments?.[0]
              ?.originalAudioMuteVolume
        )
        .toBe(0.25);
      await rail
        .getByRole('button', { name: label('gallery.videoReview.actionActions'), exact: true })
        .click();
      await page.screenshot({
        path: info.outputPath('source-voice-actions-inspector.png'),
        fullPage: false,
      });
      await inspector
        .getByRole('button', { name: label('videoEditor.timeline.duplicate'), exact: true })
        .click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sourceVoiceoverDocuments?.length)
        .toBe(2);
      await inspector
        .getByRole('button', { name: label('videoEditor.timeline.delete'), exact: true })
        .click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sourceVoiceoverDocuments?.length)
        .toBe(1);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sourceVoiceoverDocuments?.length)
        .toBe(2);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sourceVoiceoverDocuments?.length)
        .toBe(1);
      await rail
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAudio'),
          exact: true,
        })
        .click();
      const timeline = page.locator('[data-ui="video-editor.timeline.surface"]');
      const duplicate = timeline.getByRole('button', {
        name: label('videoEditor.timeline.duplicate'),
        exact: true,
      });
      const remove = timeline.getByRole('button', {
        name: label('videoEditor.timeline.delete'),
        exact: true,
      });
      const split = timeline.getByRole('button', {
        name: label('videoEditor.timeline.split'),
        exact: true,
      });
      const documentCount = async () =>
        (await readNativeVideoProject(page))?.sourceVoiceoverDocuments?.length;
      await expect(duplicate).toBeEnabled();
      await expect(remove).toBeEnabled();
      await expect(split).toBeDisabled();
      await voiceViews.last().focus();
      await voiceViews.last().press('s');
      expect((await readNativeVideoProject(page))?.clips).toEqual(canonicalClips);
      await voiceViews.last().press('Control+d');
      await expect.poll(documentCount).toBe(2);
      await remove.click();
      await expect.poll(documentCount).toBe(1);
      expect((await readNativeVideoProject(page))?.sourceVoiceoverDocuments?.[0]?.id).toBe(
        'accepted-source-voice'
      );
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(documentCount).toBe(2);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(documentCount).toBe(1);
      await expect(voiceViews.first()).toHaveAttribute('aria-pressed', 'true');
      await duplicate.click();
      await expect.poll(documentCount).toBe(2);
      await page.keyboard.press('Delete');
      await expect.poll(documentCount).toBe(1);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(documentCount).toBe(2);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(documentCount).toBe(1);
      await rail
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAudio'),
          exact: true,
        })
        .click();
      await level.focus();
      await level.press('Delete');
      await expect.poll(documentCount).toBe(1);
      await level.press('Escape');
      await level.press('Tab');
      expect((await take())?.volume).toBe(0.8);
      const enabled = inspector.getByRole('switch', {
        name: label('gallery.videoReview.audioVoiceover'),
        exact: true,
      });
      await enabled.click();
      await expect(voiceViews).toHaveCount(2);
      await expect(voiceViews.first()).toHaveAttribute('data-source-voiceover-inactive', 'true');
      await enabled.click();
      await expect(voiceViews.first()).not.toHaveAttribute(
        'data-source-voiceover-inactive',
        'true'
      );
      const ownHeader = page
        .locator('[data-ui="video-editor.timeline.track-select"]')
        .filter({ hasText: track.name })
        .locator('..');
      const sourceTrack = project.tracks.find((track) => track.id === video.trackId)!;
      const sourceHeader = page
        .locator('[data-ui="video-editor.timeline.track-select"]')
        .filter({ hasText: sourceTrack.name })
        .locator('..');
      const originalTrack = project.tracks.find((track) => track.id === originalAudio.trackId)!;
      const originalHeader = page
        .locator('[data-ui="video-editor.timeline.track-select"]')
        .filter({ hasText: originalTrack.name })
        .locator('..');
      for (const header of [ownHeader, sourceHeader, originalHeader]) {
        await header
          .getByRole('button', { name: label('videoEditor.timeline.trackEditable'), exact: true })
          .click();
        await expect(level).toBeDisabled();
        await expect(duplicate).toBeDisabled();
        await expect(remove).toBeDisabled();
        await voiceViews.first().focus();
        await voiceViews.first().press('Control+d');
        await voiceViews.first().press('Delete');
        expect(await documentCount()).toBe(1);
        await header
          .getByRole('button', { name: label('videoEditor.timeline.trackLocked'), exact: true })
          .click();
        await expect(level).toBeEnabled();
      }
      await voiceViews.first().click();
      await checkInspectorPaintedFont(
        page,
        voiceViews.first().locator('span.truncate'),
        'voice-view'
      );
      await page.screenshot({
        path: info.outputPath('source-voice-timeline.png'),
        fullPage: false,
      });
      if (index === 0) {
        const measured = await timeline.evaluate((node) => ({
          content: node.clientWidth,
          outer: innerWidth,
        }));
        const gutter = measured.outer - measured.content;
        const observations = [];
        for (const width of [1399, 1400, 1401, 1599, 1600, 1601]) {
          await page.setViewportSize({ width: width + gutter, height: 560 });
          const observation = await timeline.evaluate((node) => ({
            width: node.clientWidth,
            horizontal: document.documentElement.scrollWidth > innerWidth,
          }));
          expect(observation.width).toBe(width);
          expect(observation.horizontal).toBe(false);
          await expect(duplicate).toBeEnabled();
          await expect(remove).toBeEnabled();
          await expect(split).toBeDisabled();
          observations.push(observation);
        }
        await page.setViewportSize({ width: 1100, height: 560 });
        await voiceViews.first().scrollIntoViewIfNeeded();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
          false
        );
        await page.screenshot({
          path: info.outputPath('source-voice-timeline-narrow.png'),
          fullPage: false,
        });
        const workspace = page.locator('[data-ui="video-editor.workspace.root"]');
        expect(await workspace.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        await workspace.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        expect(await workspace.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
        const visibleField = await level.boundingBox();
        expect(visibleField).not.toBeNull();
        expect(visibleField!.x).toBeGreaterThanOrEqual(0);
        expect(visibleField!.x + visibleField!.width).toBeLessThanOrEqual(1101);
        await level.focus();
        await level.press('Escape');
        await page.screenshot({
          path: info.outputPath('source-voice-inspector-narrow.png'),
          fullPage: false,
        });
        await workspace.evaluate((node) => {
          node.scrollLeft = 0;
        });
        await writeFile(
          info.outputPath('source-voice-breakpoints.json'),
          JSON.stringify(observations, null, 2)
        );
        await page.setViewportSize({ ...viewport.size });
      }
      expect((await readNativeVideoProject(page))?.clips).toEqual(canonicalClips);
      expect((await readNativeVideoProject(page))?.assets).toEqual(accepted?.assets);
      const play = page.getByRole('button', {
        name: translate('videoEditor.timeline.play', 'en'),
        exact: true,
      });
      const pause = page.getByRole('button', {
        name: translate('videoEditor.timeline.pause', 'en'),
        exact: true,
      });
      const observations = () =>
        page.evaluate(() => {
          const raw: unknown = Reflect.get(window, 'sourceVoiceAudioStarts');
          if (!Array.isArray(raw)) throw new Error('Missing voice observations');
          return raw.flatMap((item: unknown) => {
            if (
              !item ||
              typeof item !== 'object' ||
              !('frames' in item) ||
              typeof item.frames !== 'number' ||
              !('rate' in item) ||
              typeof item.rate !== 'number' ||
              !('offset' in item) ||
              typeof item.offset !== 'number' ||
              !('duration' in item) ||
              typeof item.duration !== 'number' ||
              !('rms' in item) ||
              typeof item.rms !== 'number' ||
              !('stopped' in item) ||
              typeof item.stopped !== 'boolean'
            )
              throw new Error('Invalid voice observation');
            return [
              {
                frames: item.frames,
                rate: item.rate,
                offset: item.offset,
                duration: item.duration,
                rms: item.rms,
                stopped: item.stopped,
              },
            ];
          });
        });
      await play.click();
      await expect
        .poll(async () => (await observations()).filter((item) => item.rms > 0.001).length)
        .toBeGreaterThan(0);
      await pause.click();
      await expect
        .poll(async () => (await observations()).every((item) => item.stopped))
        .toBe(true);
      const beforeSeek = (await observations()).length;
      const ruler = page.locator('[data-ui="video-editor.timeline.ruler"]');
      const ticks = await ruler.locator(':scope > div > span').evaluateAll((labels) =>
        labels.map((label) => {
          const match = /^(\d+):(\d+\.\d+|\d+)$/.exec(label.textContent?.trim() ?? '');
          if (!match || !label.parentElement) throw new Error('Missing ruler tick');
          return {
            x: label.parentElement.getBoundingClientRect().x,
            time: Number(match[1]) * 60 + Number(match[2]),
          };
        })
      );
      const first = ticks[0]!,
        second = ticks[1]!,
        box = (await ruler.boundingBox())!;
      await ruler.click({
        position: {
          x:
            first.x -
            box.x +
            ((1 - first.time) * (second.x - first.x)) / (second.time - first.time),
          y: 8,
        },
      });
      await play.click();
      await expect.poll(async () => (await observations()).length).toBeGreaterThan(beforeSeek);
      await pause.click();
      const preview = await observations();
      expect(preview.every((item) => item.rate === 1 && item.rms > 0.001)).toBe(true);
      expect(preview[0]!.offset).toBeLessThanOrEqual(0.15);
      expect(preview.at(-1)!.offset).toBeGreaterThanOrEqual(0.9);
      expect(preview.at(-1)!.offset).toBeLessThan(1.5);
      await writeFile(
        info.outputPath('source-voice-preview.json'),
        JSON.stringify(preview, null, 2)
      );
      await page.screenshot({ path: info.outputPath('source-voice-preview.png'), fullPage: false });
      const beforeReopen = await readNativeVideoProject(page);
      if (!beforeReopen) throw new Error('Missing saved voice project');
      const output = await encodedNativeVideoSamples(page, host.origin, project, format, []);
      const actual = await latestExportRms(page);
      const fullWindow = await latestExportRms(page, 0.5);
      const control = await encodedNativeVideoSamples(page, host.origin, baseline, format, []);
      const expected = await latestExportRms(page);
      const range = await encodedNativeVideoSamples(page, host.origin, project, format, [], {
        start: 0.5,
        end: 2.5,
      });
      const selected = await latestExportRms(page);
      expect(Math.abs(output.duration - 3)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(range.duration - 2)).toBeLessThanOrEqual(0.05);
      for (let window = 0; window < actual.length; window++) {
        expect(expected[window]).toBeGreaterThan(0.001);
        expect(Math.abs(actual[window]! / expected[window]! - 1)).toBeLessThanOrEqual(0.05);
        expect(Math.abs(selected[window]! / fullWindow[window]! - 1)).toBeLessThanOrEqual(0.05);
      }
      await writeFile(
        info.outputPath('source-voice-export.json'),
        JSON.stringify({ output, control, range, actual, expected, fullWindow, selected }, null, 2)
      );
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}`);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sourceVoiceoverDocuments)
        .toEqual(beforeReopen.sourceVoiceoverDocuments);
      await expect(voiceViews).toHaveCount(2);
      const reopened = await readNativeVideoProject(page);
      expect(reopened?.assets).toEqual(beforeReopen.assets);
      expect(reopened?.sourceVoiceoverDocuments?.[0]?.take.transcript).toEqual(
        project.sourceVoiceoverDocuments?.[0]?.take.transcript
      );
      expect(reopened?.sourceVoiceoverDocuments?.[0]?.take.textSnapshot).toEqual(
        project.sourceVoiceoverDocuments?.[0]?.take.textSnapshot
      );
      const sourceClips = beforeReopen.clips.filter(
        (clip) => clip.type === 'VIDEO' || clip.type === 'AUDIO'
      );
      expect(sourceClips.length).toBeGreaterThan(0);
      for (const clip of sourceClips) {
        const item = page.locator(`[data-project-timeline-clip="${clip.id}"]`);
        if (!(await item.count())) continue;
        await item.scrollIntoViewIfNeeded();
        await item.click();
        await item.press('Delete');
        await expect
          .poll(async () =>
            (await readNativeVideoProject(page))?.clips.some((item) => item.id === clip.id)
          )
          .toBe(false);
      }
      await expect(voiceViews).toHaveCount(0);
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.filter(
              (clip) => clip.type === 'VIDEO' || clip.type === 'AUDIO'
            ).length
        )
        .toBe(0);
      const withoutSources = await readNativeVideoProject(page);
      expect(withoutSources?.sourceVoiceoverDocuments).toEqual(
        beforeReopen.sourceVoiceoverDocuments
      );
      expect(withoutSources?.assets).toEqual(beforeReopen.assets);
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect(voiceViews).toHaveCount(0);
      const beforeDormantUse = await counter.textContent();
      await sourceRow.locator('[data-ui="video-editor.materials.show-use"] button').click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.audioVoiceover'), exact: true })
        .click();
      await expect(inspector).toBeVisible();
      await expect(
        page.locator('[data-ui="video-editor.timeline.toolbar.fit-selection"]')
      ).toBeDisabled();
      expect(await counter.textContent()).toBe(beforeDormantUse);
      await inspector
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAudio'),
          exact: true,
        })
        .click();
      await level.fill('55');
      await level.press('Tab');
      await expect.poll(async () => (await take())?.volume).toBe(0.55);
      const savedWithoutSources = await readNativeVideoProject(page);
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await sourceRow.locator('[data-ui="video-editor.materials.show-use"] button').click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.audioVoiceover'), exact: true })
        .click();
      await expect(inspector).toBeVisible();
      await expect(voiceViews).toHaveCount(0);
      const finalProject = await readNativeVideoProject(page);
      expect(finalProject?.sourceVoiceoverDocuments).toEqual(
        savedWithoutSources?.sourceVoiceoverDocuments
      );
      expect(finalProject?.assets).toEqual(beforeReopen.assets);
      expect(finalProject?.sourceVoiceoverDocuments?.[0]?.take.volume).toBe(0.55);
      expect(isExportReadyVideoProject(finalProject)).toBe(true);
      await page.screenshot({
        path: info.outputPath('source-voice-without-sources-reopened.png'),
        fullPage: false,
      });
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
