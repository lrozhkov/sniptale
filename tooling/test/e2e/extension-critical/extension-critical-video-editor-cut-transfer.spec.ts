import { inspectVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { resolveVideoProjectCompositionJoinPlans } from '../../../../apps/extension/src/features/video/project/scene/joins';
import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from 'mediabunny';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { checkInspectorPaintedFont, chooseInspectorValue } from '../support/inspector-utilities';
import { readNativeVideoProject } from '../support/native-video-project';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

async function readGalleryPixels(
  page: Page,
  bytes: string,
  times: number[],
  mimeType: 'video/webm' | 'video/mp4'
) {
  return page.evaluate(
    async ({ bytes, times, mimeType }) => {
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))], { type: mimeType })
      );
      const video = document.createElement('video');
      document.body.append(video);
      video.muted = true;
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Gallery reference decode failed.'));
          video.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d')!;
        const samples = [];
        for (const time of times) {
          const mediaTime = await new Promise<number>((resolve) => {
            const presented = (_now: number, metadata: VideoFrameCallbackMetadata) => {
              if (Math.abs(metadata.mediaTime - time) < 0.5 / 30 + 0.000001)
                resolve(metadata.mediaTime);
              else video.requestVideoFrameCallback(presented);
            };
            video.requestVideoFrameCallback(presented);
            video.currentTime = time;
          });
          context.drawImage(video, 0, 0);
          const x = Math.floor(canvas.width / 2),
            y = Math.floor(canvas.height / 2);
          samples.push({
            time,
            mediaTime,
            x,
            y,
            pixel: [...context.getImageData(x, y, 1, 1).data].slice(0, 3),
          });
        }
        return { width: canvas.width, height: canvas.height, samples };
      } finally {
        video.removeAttribute('src');
        video.load();
        video.remove();
        URL.revokeObjectURL(url);
      }
    },
    { bytes, times, mimeType }
  );
}

for (const variant of [
  {
    type: 'dissolve',
    format: 'WEBM',
    viewport: PRIMARY_BROWSER_VIEWPORTS[0]!,
    inactive: false,
    imageEdges: false,
  },
  {
    type: 'dissolve',
    format: 'WEBM',
    viewport: PRIMARY_BROWSER_VIEWPORTS[0]!,
    inactive: true,
    imageEdges: false,
  },
  {
    type: 'fade-black',
    format: 'MP4',
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    inactive: false,
    imageEdges: false,
  },
  {
    type: 'fade-black',
    format: 'MP4',
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    inactive: true,
    imageEdges: false,
  },
  {
    type: 'dissolve',
    format: 'WEBM',
    viewport: PRIMARY_BROWSER_VIEWPORTS[0]!,
    inactive: false,
    imageEdges: true,
  },
  {
    type: 'fade-black',
    format: 'MP4',
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    inactive: false,
    imageEdges: true,
  },
] as const) {
  test(`Gallery cut VFR pixels survive Native transfer and real ${variant.format} export ${variant.type}${variant.inactive ? ' retained edge-adjacent' : ''}${variant.imageEdges ? ' fractional-image-edges' : ''}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(10000);
    await page.setViewportSize({ ...variant.viewport.size });
    const theme = variant.imageEdges && variant.format === 'MP4' ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer();
    try {
      const fixture = await readFile(new URL('../fixtures/review-cut-vfr.webm', import.meta.url));
      const source = new Input({
        source: new BlobSource(new Blob([Uint8Array.from(fixture)])),
        formats: ALL_FORMATS,
      });
      try {
        const track = await source.getPrimaryVideoTrack();
        if (!track) throw new Error('Missing VFR source video.');
        const timestamps: number[] = [];
        for await (const packet of new EncodedPacketSink(track).packets())
          timestamps.push(packet.timestamp);
        timestamps.sort((a, b) => a - b);
        expect(
          new Set(
            timestamps.slice(1).map((time, i) => Math.round((time - timestamps[i]!) * 1_000_000))
          ).size
        ).toBeGreaterThan(1);
        await writeFile(info.outputPath('source-timestamps.json'), JSON.stringify(timestamps));
      } finally {
        source.dispose();
      }
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': theme },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-cut-vfr.webm', { width: 160, height: 90, duration: 6 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
      const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      const ranges = variant.inactive
        ? [
            [0, 0.3],
            [2.1, 3],
            [3, 4.2],
          ]
        : [[2, 4]];
      for (const [index, [start, end]] of ranges.entries()) {
        await button('gallery.videoReview.cutMode').click();
        const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
        const lane = plane.locator(
          (await plane.getAttribute('data-active-tool-lane')) === 'source'
            ? '[data-ui="gallery.videoReview.sourceLane"]'
            : '[data-ui="gallery.videoReview.ruler"]'
        );
        const box = (await lane.boundingBox())!;
        const duration = Number(await plane.getAttribute('aria-valuemax'));
        await page.mouse.move(box.x + (box.width * start) / duration, box.y + 12);
        await page.mouse.down();
        await page.mouse.move(box.x + (box.width * end) / duration, box.y + 12, { steps: 8 });
        await page.mouse.up();
        await expect(dialog.locator('[data-ui="gallery.videoReview.editBlock"]')).toHaveCount(
          index + 1
        );
        const fields = dialog.locator('[data-ui="gallery.videoReview.cutTransition"]');
        await expect(fields).toBeAttached();
        const section = fields.locator('xpath=ancestor::details[1]');
        if ((await section.getAttribute('open')) === null)
          await section.locator(':scope > summary').click();
        await expect(fields).toBeVisible();
        await chooseInspectorValue(
          page,
          fields,
          label('gallery.videoReview.zoomTransitionType'),
          label(
            variant.type === 'dissolve'
              ? 'gallery.videoReview.cutDissolve'
              : 'gallery.videoReview.cutFadeColor'
          )
        );
        const total = fields.getByRole('textbox', {
          name: label('gallery.videoReview.zoomTransitionDuration'),
          exact: true,
        });
        await total.fill('1');
        await total.press('Tab');
      }
      if (variant.imageEdges) {
        await button('gallery.videoReview.scene').click();
        const presentation = dialog.locator(
          '[data-ui="gallery.videoReview.presentationInspector"]'
        );
        for (const side of ['intro', 'outro'] as const) {
          const section = presentation.locator(
            `section[aria-label="${label(
              side === 'intro'
                ? 'gallery.videoReview.presentationIntro'
                : 'gallery.videoReview.presentationOutro'
            )}"]`
          );
          await section
            .getByRole('button', {
              name: label('gallery.videoReview.presentationBookend'),
              exact: true,
            })
            .click();
          const chooser = page.waitForEvent('filechooser');
          await section
            .getByRole('button', {
              name: label('gallery.videoReview.presentationComputer'),
              exact: true,
            })
            .click();
          const png = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 16;
            const context = canvas.getContext('2d')!;
            context.fillStyle = '#ff0000';
            context.fillRect(0, 0, 32, 16);
            return canvas.toDataURL('image/png').split(',')[1]!;
          });
          await (
            await chooser
          ).setFiles({
            name: `${side}-card.png`,
            mimeType: 'image/png',
            buffer: Buffer.from(png, 'base64'),
          });
          await expect(presentation).toHaveAttribute('aria-busy', 'false');
          const duration = section
            .locator('[data-ui="shared.ui.presentation-media-fields"]')
            .getByRole('textbox', {
              name: label('gallery.videoReview.presentationDuration'),
              exact: true,
            });
          await duration.fill('0.15');
          await duration.press('Enter');
          await expect(section.locator('[data-out-of-scale="true"]')).toHaveCount(0);
          await duration.focus();
          await checkInspectorPaintedFont(page, duration, 'numeric');
          await duration.press('Tab');
          await duration.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: info.outputPath(`fractional-gallery-${side}.png`),
            fullPage: false,
          });
          await chooseInspectorValue(
            page,
            section,
            label(
              side === 'intro'
                ? 'gallery.videoReview.presentationJoinIntro'
                : 'gallery.videoReview.presentationJoinOutro'
            ),
            label(
              variant.type === 'dissolve'
                ? 'gallery.videoReview.cutDissolve'
                : 'gallery.videoReview.cutFadeColor'
            )
          );
        }
        await page.screenshot({
          path: info.outputPath('fractional-gallery-cards.png'),
          fullPage: false,
        });
      }
      await button('gallery.videoReview.pointerTool').click();
      await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
      await chooseInspectorValue(
        page,
        dialog,
        label('videoEditor.exportDialog.formatLabel'),
        variant.format === 'MP4' ? 'MP4' : 'WebM'
      );
      await chooseInspectorValue(page, dialog, label('gallery.videoReview.exportCodec'), 'VP9');
      await chooseInspectorValue(
        page,
        dialog,
        label('videoEditor.exportDialog.resolutionLabel'),
        label('gallery.videoReview.exportSceneSize')
      );
      await chooseInspectorValue(page, dialog, label('gallery.videoReview.exportFrameRate'), '30');
      const downloading = page.waitForEvent('download');
      await button('gallery.videoReview.downloadVideo').click();
      const download = await downloading;
      const referencePath = info.outputPath(`gallery-reference.${variant.format.toLowerCase()}`);
      await download.saveAs(referencePath);
      const times = (
        variant.inactive ? [0, 0.3, 1.5, 1.8, 2, 3.3] : [1.5, 1.7, 1.9, 2, 2.1, 2.3, 74 / 30]
      ).map((time) => time + (variant.imageEdges ? 5 / 30 : 0) + 0.001);
      if (variant.imageEdges)
        times.push(0.001, 4 / 30 + 0.001, 5 / 30 + 0.001, 125 / 30 + 0.001, 128 / 30 + 0.001);
      const gallery = await readGalleryPixels(
        page,
        (await readFile(referencePath)).toString('base64'),
        times,
        variant.format === 'MP4' ? 'video/mp4' : 'video/webm'
      );
      await writeFile(info.outputPath('gallery-cut-pixels.json'), JSON.stringify(gallery, null, 2));
      // Red also exists in retained moving frames. The endpoint window begins with blue at1.8.
      for (const sample of gallery.samples)
        if (
          !variant.inactive &&
          sample.mediaTime >= 1.8 + (variant.imageEdges ? 5 / 30 : 0) &&
          sample.mediaTime < (variant.imageEdges ? 125 / 30 : 4)
        )
          expect(sample.pixel[0]).toBeLessThan(15);
      await dialog.locator('[data-ui="gallery.videoReview.openVideoEditor"]').click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
        )
        .toBe(1);
      const tab = (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []))[0]!;
      const nativeQuery = new URL(tab.url!).searchParams;
      nativeQuery.set('theme', theme);
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?${nativeQuery}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.locator('[data-ui="video-editor.timeline.surface"]').waitFor();
      let native = (await readNativeVideoProject(page))!;
      expect(native.compositionJoins?.[0]).toMatchObject({
        sampling: 'cut',
        transition: { type: variant.type },
      });
      expect(native.duration).toBeCloseTo(variant.inactive ? 3.6 : variant.imageEdges ? 4.3 : 4, 5);
      if (variant.imageEdges) {
        expect(native.bookendPresets?.intro.image?.duration).toBe(0.15);
        expect(native.bookendPresets?.outro.image?.duration).toBe(0.15);
        const intro = native.clips.find(({ id }) => id === `${native.id}:bookend:intro:media`)!;
        const outro = native.clips.find(({ id }) => id === `${native.id}:bookend:outro:media`)!;
        expect(intro).toMatchObject({ type: 'IMAGE', startTime: 0, duration: 5 / 30 });
        expect(outro.type).toBe('IMAGE');
        expect(outro.startTime).toBeCloseTo(125 / 30, 12);
        expect(outro.duration).toBeCloseTo(4.3 - 125 / 30, 12);
        await page.locator('[data-ui="video-editor.timeline.toolbar.fit-project"]').click();
        await page.locator(`[data-project-timeline-clip="${intro.id}"]`).click();
        await page
          .getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupTransform'),
            exact: true,
          })
          .click();
        const rotation = page.getByRole('textbox', {
          name: label('videoEditor.sidebar.rotationLabel'),
          exact: true,
        });
        await rotation.fill('5');
        await rotation.press('Enter');
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))?.clips.find(({ id }) => id === intro.id)
                ?.transform.rotation
          )
          .toBe(5);
        await checkInspectorPaintedFont(page, rotation, 'numeric');
        await page.screenshot({
          path: info.outputPath('fractional-native-card-inspector.png'),
          fullPage: false,
        });
        await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.clips)
          .toEqual(hydrateVideoProject(native).clips);
        native = (await readNativeVideoProject(page))!;
      }
      if (variant.inactive) {
        const workspace = (await readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))!;
        const cuts = inspectVideoWorkspace(workspace).document!.edits.filter(
          (edit) => edit.kind === 'cut'
        );
        expect(cuts).toHaveLength(3);
        expect(native.compositionJoins).toHaveLength(3);
        expect(native.clips.filter((clip) => clip.type === 'VIDEO')).toHaveLength(2);
        expect(resolveVideoProjectCompositionJoinPlans(native)).toEqual([]);
        for (const cut of cuts) {
          const join = native.compositionJoins!.find((join) => join.id.endsWith(`:cut:${cut.id}`))!;
          expect(join.clipId).toBeUndefined();
          expect(join.edge).toBeUndefined();
          expect(join.transition).toEqual(cut.transition);
          expect(join.sourceRange).toMatchObject({ start: cut.start, end: cut.end });
        }
        await page.locator('[data-ui="video-editor.materials.show-use"] button').click();
        const uses = page
          .getByRole('option')
          .filter({ hasText: label('videoEditor.sidebar.compositionJoins') });
        await expect(uses).toHaveText([
          `${label('videoEditor.sidebar.compositionJoins')} · 0:00.000 – 0:00.300`,
          `${label('videoEditor.sidebar.compositionJoins')} · 0:02.100 – 0:03.000`,
          `${label('videoEditor.sidebar.compositionJoins')} · 0:03.000 – 0:04.200`,
        ]);
        await page.screenshot({
          path: info.outputPath('retained-cut-material-uses.png'),
          fullPage: false,
        });
        await uses.last().scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath('retained-cut-material-uses-scrolled.png'),
          fullPage: false,
        });
        await uses.last().click();
        await expect(
          page.getByRole('button', { name: label('videoEditor.sidebar.sceneEdges'), exact: true })
        ).toHaveAttribute('aria-pressed', 'true');
        const inspector = page.locator('[data-ui="video-editor.scene-edges.inspector"]');
        await expect(
          inspector.getByRole('button', {
            name: label('videoEditor.sidebar.compositionJoinSeek'),
            exact: true,
          })
        ).toHaveCount(0);
        await expect(
          inspector.getByText(label('videoEditor.sidebar.sourceIn'), { exact: true })
        ).toHaveCount(3);
        const fields = inspector.locator('[data-ui="shared.ui.presentation-join-fields"]').first();
        const firstJoin = native.compositionJoins!.find((join) => join.sourceRange?.start === 0)!;
        const other = variant.type === 'dissolve' ? 'fade-black' : 'dissolve';
        for (const type of [other, variant.type]) {
          await chooseInspectorValue(
            page,
            fields,
            label('videoEditor.sidebar.compositionJoin'),
            label(
              type === 'dissolve'
                ? 'gallery.videoReview.cutDissolve'
                : 'gallery.videoReview.cutFadeColor'
            )
          );
          await expect
            .poll(
              async () =>
                (await readNativeVideoProject(page))?.compositionJoins?.find(
                  (join) => join.id === firstJoin.id
                )?.transition?.type
            )
            .toBe(type);
        }
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.compositionJoins)
          .toEqual(native.compositionJoins);
        await page.screenshot({
          path: info.outputPath('retained-cut-inspector.png'),
          fullPage: false,
        });
      }
      const settings = {
        format: variant.format,
        fps: 30,
        width: native.width,
        height: native.height,
        resolution: 'SOURCE',
        quality: 'MEDIUM',
        scope: 'project',
        burnInSubtitles: false,
        downloadAfterExport: false,
        subtitleSidecarFormats: [],
        ...(variant.format === 'MP4' ? { mp4VideoCodec: 'VP9' } : { webmVideoCodec: 'VP9' }),
      } as const;

      if (!variant.inactive && !variant.imageEdges) {
        const originalNative = native;
        const outgoing = native.clips.find(
          (clip) => clip.type === 'VIDEO' && clip.startTime === 0
        )!;
        const incoming = native.clips.find((clip) => clip.type === 'VIDEO' && clip.startTime > 0)!;
        const sourceNode = page.locator(`[data-project-timeline-clip="${outgoing.id}"]`);
        await sourceNode.scrollIntoViewIfNeeded();
        await sourceNode.evaluate((node) =>
          node.scrollIntoView({ block: 'center', inline: 'nearest' })
        );
        await sourceNode.click();
        await page
          .getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupTiming'),
            exact: true,
          })
          .click();
        const rate = page.getByRole('textbox', {
          name: label('videoEditor.sidebar.playbackRateLabel'),
          exact: true,
        });
        await rate.fill('2');
        await rate.press('Enter');
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === outgoing.id)
                ?.duration
          )
          .toBeCloseTo(1, 5);
        expect(
          resolveVideoProjectCompositionJoinPlans((await readNativeVideoProject(page))!)
        ).toEqual([]);
        await page
          .locator(`[data-track-lane-id="${incoming.trackId}"]`)
          .getByRole('button', { name: label('videoEditor.timeline.closeGap'), exact: true })
          .first()
          .click();
        await expect
          .poll(
            async () =>
              resolveVideoProjectCompositionJoinPlans((await readNativeVideoProject(page))!)[0]
                ?.seam
          )
          .toBeCloseTo(1, 5);
        const edited = (await readNativeVideoProject(page))!;
        const worker = await page.context().newPage();
        try {
          await applyHarnessBootstrap(worker, {
            preserveMediaLibrary: true,
            storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': theme },
          });
          const modified = await encodedNativeVideoSamples(
            worker,
            host.origin,
            edited,
            variant.format,
            [
              {
                time: 0.501,
                x: Math.floor(edited.width / 2),
                y: Math.floor(edited.height / 2),
                expected: variant.type === 'dissolve' ? [0, 127, 127] : [0, 0, 0],
              },
            ],
            { start: 0.5, end: 1.5 },
            undefined,
            { ...settings, scope: 'selected-range', rangeStartSeconds: 0.5, rangeEndSeconds: 1.5 }
          );
          expect(modified.samples[0]!.error).toBeLessThanOrEqual(12);
          await writeFile(
            info.outputPath('native-edited-source-export.json'),
            JSON.stringify({ edited, modified }, null, 2)
          );
        } finally {
          await worker.close();
        }
        expect(await readNativeVideoProject(page)).toEqual(edited);
        for (let step = 0; step < 2; step++)
          await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.clips)
          .toEqual(hydrateVideoProject(originalNative).clips);
        native = (await readNativeVideoProject(page))!;
      }

      await page.reload();
      await page.locator('[data-ui="video-editor.timeline.surface"]').waitFor();
      expect((await readNativeVideoProject(page))!.compositionJoins).toEqual(
        native.compositionJoins
      );
      const output = await encodedNativeVideoSamples(
        page,
        host.origin,
        native,
        variant.format,
        gallery.samples.map((sample) => ({
          time: sample.time,
          x: sample.x,
          y: sample.y,
          expected: sample.pixel,
        })),
        undefined,
        undefined,
        settings
      );
      expect({ width: output.width, height: output.height }).toEqual({
        width: gallery.width,
        height: gallery.height,
      });
      await writeFile(
        info.outputPath('actual-cut-parity.json'),
        JSON.stringify({ gallery, native: output }, null, 2)
      );
      for (const [index, sample] of output.samples.entries()) {
        expect(Math.abs(sample.mediaTime - gallery.samples[index]!.mediaTime)).toBeLessThanOrEqual(
          0.000001
        );
        expect(
          sample.error,
          JSON.stringify({ native: sample, gallery: gallery.samples[index] })
        ).toBeLessThanOrEqual(12);
        if (
          !variant.inactive &&
          sample.mediaTime >= 1.8 + (variant.imageEdges ? 5 / 30 : 0) &&
          sample.mediaTime < (variant.imageEdges ? 125 / 30 : 4)
        )
          expect(sample.pixel[0]).toBeLessThan(15);
        if (variant.inactive && index === gallery.samples.length - 1) {
          const reference = gallery.samples[index]!;
          expect(reference.mediaTime).toBeCloseTo(3.3, 6);
          for (const [channel, value] of sample.pixel.slice(0, 3).entries())
            expect(Math.abs(value - reference.pixel[channel]!)).toBeLessThanOrEqual(3);
        }
      }
      await writeFile(
        info.outputPath('actual-cut-parity.json'),
        JSON.stringify({ gallery, native: output }, null, 2)
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
