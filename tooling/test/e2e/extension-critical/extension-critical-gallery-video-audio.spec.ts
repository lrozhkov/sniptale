import { expect, test, type Page } from '@playwright/test';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import { buildReviewTimeMap } from '../../../../apps/extension/src/features/video/review/timeline';
import { projectReviewVoiceover } from '../../../../apps/extension/src/features/video/review/voiceover-edits';
import { resolve } from 'node:path';
import { startHostServer } from '../support/host-server';
import { clickReviewExport, seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`quick editor master volume and mute stay synchronized at HD (${variant.locale}/${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: translate(key, variant.locale), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      const original = dialog.locator('[data-original-audio-lane]');
      const video = dialog.locator('video').first();
      const volume = dialog
        .locator('[data-ui="gallery.videoReview.sceneAudio"]')
        .getByRole('textbox', {
          name: translate('gallery.videoReview.audioOriginal', variant.locale),
          exact: true,
        });
      const change = async (value: string) => {
        await volume.fill(value);
        await volume.press('Enter');
      };
      const sound = async (muted: boolean, gain: number) => {
        await expect
          .poll(() =>
            video.evaluate((node: HTMLVideoElement) => ({ muted: node.muted, volume: node.volume }))
          )
          .toEqual({ muted, volume: gain });
        await expect(original).toHaveAttribute('data-audio-muted', String(muted));
        await expect(
          button(
            muted ? 'gallery.videoReview.restoreSourceAudio' : 'gallery.videoReview.muteSourceAudio'
          )
        ).toHaveAttribute('aria-pressed', String(!muted));
      };
      const originalRow = original.locator('xpath=ancestor::*[@data-review-track-muted][1]');
      await button('gallery.videoReview.zoomAdd').first().click();
      const focusLane = dialog.locator('[data-ui="gallery.videoReview.zoomLane"]');
      const focusRow = focusLane.locator('xpath=ancestor::*[@data-review-track-muted][1]');
      await button('gallery.videoReview.zoomEnabled').click();
      await expect(focusRow).toHaveAttribute('data-review-track-muted', 'true');
      await expect(focusLane).toHaveCSS(
        'background-color',
        await focusRow
          .locator('[data-ui="gallery.videoReview.trackHeader"]')
          .evaluate((node) => getComputedStyle(node).backgroundColor)
      );
      await expect(button('gallery.videoReview.zoomEnabled')).toBeEnabled();
      await focusLane.getByRole('button').first().click();
      await button('gallery.videoReview.zoomEnabled').click();
      await expect(focusRow).toHaveAttribute('data-review-track-muted', 'false');
      await button('gallery.videoReview.scene').click();
      await change('0');
      await expect(originalRow).toHaveAttribute('data-review-track-muted', 'true');
      await expect(original).toHaveCSS(
        'background-color',
        await originalRow
          .locator('[data-ui="gallery.videoReview.trackHeader"]')
          .evaluate((node) => getComputedStyle(node).backgroundColor)
      );
      expect(
        await originalRow
          .locator('[data-review-track-content]')
          .evaluate((node) => getComputedStyle(node, '::after').backgroundImage)
      ).toContain('repeating-linear-gradient');
      await expect(originalRow.locator('[data-ui="gallery.videoReview.trackHeader"]')).toHaveCSS(
        'opacity',
        '1'
      );
      await sound(true, 0);
      await expect(original).toHaveCSS('border-bottom-style', 'dashed');
      await page.screenshot({ path: testInfo.outputPath('master-muted.png') });
      await button('gallery.videoReview.restoreSourceAudio').click();
      await sound(false, 1);
      await expect(originalRow).toHaveAttribute('data-review-track-muted', 'false');
      await expect(volume).toHaveValue('100');
      await change('40');
      await sound(false, 0.4);
      await button('gallery.videoReview.muteSourceAudio').click();
      await sound(true, 0);
      await expect(volume).toHaveValue('40');
      await button('gallery.videoReview.restoreSourceAudio').click();
      await sound(false, 0.4);
      await button('gallery.videoReview.muteSourceAudio').click();
      await expect
        .poll(() => persistedSourceAudio(page))
        .toMatchObject({ muted: true, volume: 0.4 });
      await change('70');
      await sound(false, 0.7);
      await expect
        .poll(() => persistedSourceAudio(page))
        .toMatchObject({ muted: false, volume: 0.7 });
      await button('gallery.videoReview.undo').click();
      await sound(true, 0);
      await button('gallery.videoReview.redo').click();
      await sound(false, 0.7);
      await change('0');
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(button('gallery.videoReview.advancedEditing')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await sound(true, 0);
      await button('gallery.videoReview.restoreSourceAudio').click();
      await sound(false, 1);
      await page.screenshot({ path: testInfo.outputPath('master-restored.png') });
      await button('gallery.videoReview.back').click();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

async function persistedWorkspace(page: Page) {
  const raw = await page.evaluate(
    async ({ databaseName, aggregateId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<unknown>((resolve, reject) => {
          const request = db
            .transaction('video_workspaces')
            .objectStore('video_workspaces')
            .get(aggregateId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    {
      databaseName: betaV1Fixture.databaseName,
      aggregateId: `recording:${betaV1Fixture.records.recordings[0].id}`,
    }
  );
  return parseVideoWorkspace(raw);
}

async function persistedSourceAudio(page: Page) {
  const workspace = await persistedWorkspace(page);
  const latest = workspace?.history
    .slice(0, workspace.cursor)
    .findLast((operation) => operation.target === 'advancedContent');
  return latest?.target === 'advancedContent' ? latest.after.audio.original : undefined;
}

async function voiceTiming(page: Page) {
  const workspace = await persistedWorkspace(page);
  if (!workspace) return null;
  const document = replayReviewHistory(
    workspace.history,
    workspace.cursor,
    workspace.source,
    reviewAdvancedContentBaseline(workspace.advanced)
  );
  const map = buildReviewTimeMap(workspace.source.duration, document.edits);
  const clip = document.advancedContent.audio.voiceover[0];
  if (!clip) return null;
  const slices = projectReviewVoiceover([clip], map);
  return {
    rawDuration: clip.duration,
    duration: slices.reduce((total, slice) => total + slice.duration, 0),
    rates: slices.map((slice) => slice.playbackRate ?? 1),
  };
}

async function voiceTimelineGesture(page: Page, start: number, end?: number) {
  const plane = page.locator('[data-ui="gallery.videoReview.timePlane"]');
  const box = (await plane.locator('[data-ui="gallery.videoReview.ruler"]').boundingBox())!;
  const duration = Number(await plane.getAttribute('aria-valuemax'));
  const x = (time: number) => box.x + (box.width * time) / duration;
  await page.mouse.move(x(start), box.y + 12);
  if (end === undefined) await page.mouse.click(x(start), box.y + 12);
  else {
    await page.mouse.down();
    await page.mouse.move(x(end), box.y + 12, { steps: 8 });
    await page.mouse.up();
  }
}

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`voice tempo survives Speed removal, history, reopen and export at HD (${variant.locale})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.addInitScript(() => {
        const probe: Array<{ kind: string; rate: number; buffer: AudioBuffer }> = [];
        Object.assign(window, { voiceTempoProbe: probe });
        const create = BaseAudioContext.prototype.createBufferSource;
        BaseAudioContext.prototype.createBufferSource = function () {
          const node = create.call(this);
          const start = node.start.bind(node);
          const kind = this instanceof OfflineAudioContext ? 'export' : 'preview';
          node.start = (...args) => {
            if (node.buffer)
              probe.push({ kind, rate: node.playbackRate.value, buffer: node.buffer });
            start(...args);
          };
          return node;
        };
      });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', {
          name: translate(key, variant.locale),
          exact: true,
        });
      await button('gallery.videoReview.advancedEditing').click();
      const addSpeed = async (rate: number) => {
        if ((await button('gallery.videoReview.speedMode').getAttribute('aria-pressed')) !== 'true')
          await button('gallery.videoReview.speedMode').click();
        await button('gallery.videoReview.speedRate').click();
        await page.getByRole('option', { name: `${rate}×`, exact: true }).click();
        await voiceTimelineGesture(page, 0, 8);
      };
      await addSpeed(2);
      await voiceTimelineGesture(page, 0);
      const header = dialog.locator('[data-ui="gallery.videoReview.trackHeader"]').filter({
        hasText: translate('gallery.videoReview.audioVoiceover', variant.locale),
      });
      const chooser = page.waitForEvent('filechooser');
      await header
        .getByRole('button', {
          name: translate('gallery.videoReview.audioImport', variant.locale),
          exact: true,
        })
        .click();
      await (await chooser).setFiles(resolve('tooling/test/e2e/fixtures/review-voice-speech.wav'));
      const voice = dialog.getByRole('button', {
        name: `${translate('gallery.videoReview.audioVoiceover', variant.locale)} · review-voice-speech.wav`,
        exact: true,
      });
      await expect(voice).toBeVisible();
      await expect.poll(() => voiceTiming(page)).toMatchObject({ rates: [1] });
      const initial = (await voiceTiming(page))!;
      await dialog
        .getByRole('button', {
          name: `${translate('gallery.videoReview.speedMode', variant.locale)} 2× · 0.0 – 8.0`,
          exact: true,
        })
        .click();
      await page.keyboard.press('Delete');
      await expect
        .poll(() => voiceTiming(page))
        .toMatchObject({ duration: initial.rawDuration, rates: [1] });
      await button('gallery.videoReview.undo').click();
      await expect.poll(() => voiceTiming(page)).toMatchObject({ rates: [1] });
      await button('gallery.videoReview.redo').click();
      await addSpeed(4);
      await expect.poll(() => voiceTiming(page)).toMatchObject({ rates: [4] });
      expect((await voiceTiming(page))!.duration).toBeCloseTo(initial.rawDuration / 4, 5);
      await button('gallery.videoReview.scene').click();
      const original = dialog
        .locator('[data-ui="gallery.videoReview.sceneAudio"]')
        .getByRole('textbox', {
          name: translate('gallery.videoReview.audioOriginal', variant.locale),
          exact: true,
        });
      await original.fill('0');
      await original.press('Enter');
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(voice).toBeVisible();
      await expect.poll(() => voiceTiming(page)).toMatchObject({ rates: [4] });
      await voiceTimelineGesture(page, 0);
      await button('gallery.videoReview.play').click();
      await expect
        .poll(() =>
          page.evaluate((duration) => {
            const probe = (
              window as unknown as {
                voiceTempoProbe: Array<{ kind: string; rate: number; buffer: AudioBuffer }>;
              }
            ).voiceTempoProbe;
            return probe.some(
              (entry) =>
                entry.kind === 'preview' &&
                entry.rate === 1 &&
                entry.buffer.length === Math.round(duration * entry.buffer.sampleRate)
            );
          }, initial.rawDuration / 4)
        )
        .toBe(true);
      if (await button('gallery.videoReview.pause').isVisible())
        await button('gallery.videoReview.pause').click();
      await page.screenshot({ path: testInfo.outputPath('voice-speed.png') });
      const download = page.waitForEvent('download');
      await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
      await (await download).saveAs(testInfo.outputPath('voice-speed.webm'));
      const pcm = await page.evaluate(() => {
        const probe = (
          window as unknown as {
            voiceTempoProbe: Array<{ kind: string; rate: number; buffer: AudioBuffer }>;
          }
        ).voiceTempoProbe;
        const preview = probe.findLast((entry) => entry.kind === 'preview')!;
        const exported = probe.find((entry) => entry.kind === 'export')!;
        if (!preview || !exported) return null;
        const a = preview.buffer.getChannelData(0),
          b = exported.buffer.getChannelData(0);
        const pad = Math.round(exported.buffer.sampleRate * 0.02);
        let difference = 0,
          previewEnergy = 0,
          exportEnergy = 0;
        const sameSampleRate = preview.buffer.sampleRate === exported.buffer.sampleRate;
        for (const sample of a) previewEnergy += sample * sample;
        for (const sample of b) exportEnergy += sample * sample;
        if (sameSampleRate)
          for (let i = 0; i < Math.min(a.length, b.length - 2 * pad); i++)
            difference = Math.max(difference, Math.abs(a[i]! - b[i + pad]!));
        return {
          rate: exported.rate,
          sameSampleRate,
          difference,
          previewEnergy,
          exportEnergy,
          exportedDuration: exported.buffer.duration,
        };
      });
      expect(pcm).toMatchObject({ rate: 1 });
      expect(pcm!.previewEnergy).toBeGreaterThan(0);
      expect(pcm!.exportEnergy).toBeGreaterThan(0);
      // Preview follows the device clock; export decodes at its fixed 48kHz contract.
      // Exact same-rate DSP agreement is also covered at both rates by the unit proof.
      if (pcm!.sameSampleRate) expect(pcm!.difference).toBeLessThan(1e-6);
      expect(pcm!.exportedDuration).toBeCloseTo(Math.min(1, initial.rawDuration / 4) + 0.04, 4);
      await button('gallery.videoReview.back').click();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
