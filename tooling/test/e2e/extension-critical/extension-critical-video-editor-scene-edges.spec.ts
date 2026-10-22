import { createHash } from 'node:crypto';
import {
  parseEffectV1Source,
  resolveEffectV1ControlDefault,
} from '@sniptale/runtime-contracts/effect-v1';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createShapeClip } from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';
import { createVideoProjectTrack } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createQuickEditWatermark } from '../../../../apps/extension/src/features/video/project/scene/watermark';
import {
  encodedNativeVideoSamples,
  readEncodedAudioWindows,
} from '../support/native-video-export-proof';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { checkInspectorLabels, checkInspectorPaintedFont } from '../support/inspector-utilities';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'ru' : 'en';
  const theme = index === 0 ? 'light' : 'dark';
  test(`Native scene edges preserve composition ${viewport.size.width} ${locale}`, async ({
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
      });
      project.version = 24;
      project.sceneEdges = {
        intro: { enabled: false, duration: 0.8, color: '#ff0000ff', audioFade: true },
        outro: { enabled: false, duration: 1.2, color: '#0000ffff', audioFade: false },
      };
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript((language) => {
        localStorage.setItem('sniptale-locale-preference', language);
        if (sessionStorage.getItem('scene-edges-seeded')) {
          const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
          if (typeof bootstrap === 'object' && bootstrap !== null)
            Reflect.deleteProperty(bootstrap, 'videoProjects');
        }
      }, locale);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.evaluate(() => sessionStorage.setItem('scene-edges-seeded', 'true'));
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      // The first accepted write materializes the existing default lane, independently of scene edges.
      const clips = (await readNativeVideoProject(page))!.clips.map((clip) => ({
        ...clip,
        timelineLaneId: clip.timelineLaneId ?? null,
      }));
      const select = async () => {
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
          .click();
        const category = page.getByRole('button', {
          name: label('videoEditor.sidebar.sceneEdges'),
          exact: true,
        });
        await expect(category).toBeVisible();
        await category.click();
      };
      await select();
      const owner = page.locator('[data-ui="video-editor.scene-edges.inspector"]');
      const intro = owner.getByRole('group', {
        name: label('gallery.videoReview.presentationIntro'),
        exact: true,
      });
      const outro = owner.getByRole('group', {
        name: label('gallery.videoReview.presentationOutro'),
        exact: true,
      });
      await intro
        .getByRole('button', { name: label('gallery.videoReview.presentationFadeIn'), exact: true })
        .click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sceneEdges?.intro.enabled)
        .toBe(true);
      const canvas = page.locator('[data-preview-stage-canvas]');
      await expect
        .poll(() =>
          canvas.evaluate((node: HTMLCanvasElement) =>
            Array.from(
              node
                .getContext('2d')!
                .getImageData(Math.floor(node.width / 2), Math.floor(node.height / 2), 1, 1).data
            )
          )
        )
        .toEqual([255, 0, 0, 255]);
      const fields = owner.locator('[data-ui="shared.ui.presentation-fade-fields"]');
      await fields.first().locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker"]');
      await expect(picker).toBeVisible();
      await picker
        .getByRole('textbox', { name: label('shared.ui.colorSelectorHex'), exact: true })
        .fill('#00ff00');
      await expect
        .poll(() =>
          canvas.evaluate((node: HTMLCanvasElement) =>
            Array.from(
              node
                .getContext('2d')!
                .getImageData(Math.floor(node.width / 2), Math.floor(node.height / 2), 1, 1).data
            )
          )
        )
        .toEqual([0, 255, 0, 255]);
      expect((await readNativeVideoProject(page))?.sceneEdges?.intro.color).toBe('#ff0000ff');
      await picker
        .getByRole('button', { name: label('shared.ui.colorSelectorCancel'), exact: true })
        .click();
      await expect(picker).not.toBeVisible();
      await expect
        .poll(() =>
          canvas.evaluate((node: HTMLCanvasElement) =>
            Array.from(
              node
                .getContext('2d')!
                .getImageData(Math.floor(node.width / 2), Math.floor(node.height / 2), 1, 1).data
            )
          )
        )
        .toEqual([255, 0, 0, 255]);
      const duration = fields.first().getByRole('textbox', {
        name: label('gallery.videoReview.presentationDuration'),
        exact: true,
      });
      await duration.fill('0.6');
      await duration.press('Escape');
      expect((await readNativeVideoProject(page))?.sceneEdges?.intro.duration).toBe(0.8);
      await duration.fill('0.6');
      await duration.press('Enter');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sceneEdges?.intro.duration)
        .toBe(0.6);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sceneEdges?.intro.duration)
        .toBe(0.8);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sceneEdges?.intro.duration)
        .toBe(0.6);
      await outro
        .getByRole('button', {
          name: label('gallery.videoReview.presentationFadeOut'),
          exact: true,
        })
        .click();
      await expect(fields).toHaveCount(2);
      await checkInspectorPaintedFont(page, intro.getByRole('button').first(), 'scene-edge-font');
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
      const rail = inspector.locator('[data-ui="video-editor.inspector.categories"] > nav');
      await page.locator('[data-ui="video-editor.materials.close"]').click();
      for (const width of [359, 360, 361, 520]) {
        const current = (await inspector.boundingBox())!.width;
        const box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + 12);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + current - width, box.y + 12);
        await page.mouse.up();
        await expect
          .poll(async () => Math.round((await inspector.boundingBox())!.width))
          .toBe(width);
        const before = await rail.boundingBox();
        await fields.last().getByRole('switch').scrollIntoViewIfNeeded();
        expect((await rail.boundingBox())?.y).toBe(before?.y);
        await checkInspectorLabels(owner);
        expect(
          await owner.evaluate((node) => {
            const body = node.closest('[data-ui="video-editor.inspector.categories"] > div');
            return body instanceof HTMLElement && body.scrollWidth <= body.clientWidth + 1;
          })
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`scene-edges-${width}.png`),
          fullPage: false,
        });
      }
      await intro
        .getByRole('button', {
          name: label('gallery.videoReview.presentationNoEffect'),
          exact: true,
        })
        .click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sceneEdges?.intro.enabled)
        .toBe(false);
      const accepted = (await readNativeVideoProject(page))!;
      expect(accepted.sceneEdges?.intro).toEqual({
        enabled: false,
        duration: 0.6,
        color: '#ff0000ff',
        audioFade: true,
      });
      expect(accepted.clips).toEqual(clips);
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await select();
      expect((await readNativeVideoProject(page))?.sceneEdges).toEqual(accepted.sceneEdges);
      await page.setViewportSize({ width: 1100, height: 560 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

for (const format of ['MP4', 'WEBM'] as const) {
  test(`Native scene edges cover the encoded ${format} composition`, async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1280, height: 560 });
    const host = await startHostServer();
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
        hasAudio: true,
      });
      project.version = 24;
      project.width = 640;
      project.height = 360;
      project.duration = 1.2;
      project.clips.forEach((clip) => {
        clip.duration = 1.2;
        if (clip.type === 'VIDEO' || clip.type === 'AUDIO') clip.sourceDuration = 1.2;
      });
      const track = createVideoProjectTrack('Upper', -1, 'PRIMARY');
      project.tracks.push(track);
      const shape = createShapeClip(track.id, 640, 360, 0, 'RECTANGLE');
      shape.duration = 1.2;
      shape.transform = { x: 0, y: 0, width: 640, height: 360, opacity: 1, rotation: 0 };
      shape.style = {
        fillColor: '#00ff00ff',
        strokeColor: '#00ff00ff',
        strokeWidth: 0,
        borderRadius: 0,
      };
      project.clips.push(shape);
      const leading = project.clips.find((clip) => clip.type === 'VIDEO')!;
      if (leading.type !== 'VIDEO') throw new Error('Missing source video');
      leading.duration = 0.8;
      leading.sourceDuration = 0.8;
      const trailing = {
        ...structuredClone(leading),
        id: 'trailing-source',
        startTime: 0.4,
        sourceStart: 0.4,
      };
      project.clips.push(trailing);
      project.transitions = [
        {
          id: 'scene-edge-crossfade',
          leadingClipId: leading.id,
          trailingClipId: trailing.id,
          kind: 'CROSSFADE',
          duration: 0.4,
          easing: 'LINEAR',
        },
      ];
      const source = await readFile(
        new URL(
          '../../../../packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-video-warm.sniptale-effect.json',
          import.meta.url
        ),
        'utf8'
      );
      const document = parseEffectV1Source(source).document;
      if (!document) throw new Error('Invalid effect fixture');
      const sha256 = createHash('sha256').update(source).digest('hex');
      project.effectSnapshots = [
        {
          id: `effect:${sha256}`,
          sha256,
          source,
          assets: [],
          retainedByteLength: Buffer.byteLength(source),
          schemaVersion: 'sniptale.effect.v1',
          documentId: document.id,
          kind: 'targetEffect',
        },
      ];
      project.effectInstances = [
        {
          id: 'scene-edge-effect',
          kind: 'targetEffect',
          target: { kind: 'clip', clipId: leading.id },
          snapshotId: `effect:${sha256}`,
          controls: Object.fromEntries(
            document.controls.map((control) => [
              control.id,
              resolveEffectV1ControlDefault(control, 'en'),
            ])
          ),
          rangeMode: 'owner',
          enabled: true,
          startTime: 0,
          duration: 0.8,
          playbackRate: document.duration / 0.8,
        },
      ];
      project.textDocuments = [
        {
          id: 'scene-edge-captions',
          binding: { kind: 'project' },
          captions: {
            enabled: true,
            style: {
              position: 'bottom',
              fontSize: 0.12,
              color: '#00ff00ff',
              background: '#00ff00ff',
            },
          },
          document: {
            version: 1,
            fragments: [
              {
                id: 'caption',
                text: 'MMMMMMMMMMMM',
                originalText: 'MMMMMMMMMMMM',
                start: 0,
                end: 1.2,
                timeDomain: 'result',
                alignment: 'manual',
                revision: 0,
                timingRevision: 0,
                showInVideo: true,
              },
            ],
          },
        },
      ];

      project.watermark = createQuickEditWatermark('MMMM');
      project.watermark.mode = 'text';
      project.watermark.text.color = '#00ff00ff';
      project.watermark.text.shadow = false;
      project.sceneEdges = {
        intro: { enabled: true, duration: 0.5, color: '#ff0000ff', audioFade: true },
        outro: { enabled: true, duration: 0.5, color: '#0000ffff', audioFade: true },
      };
      await applyHarnessBootstrap(page, { preserveMediaLibrary: true, videoProjects: [project] });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      const points = [
        { time: 0.025, expected: [242, 13, 0] },
        { time: 0.25, expected: [128, 128, 0] },
        { time: 0.6, expected: [0, 255, 0] },
        // At40fps the last frame is1.175s. The visual envelope ends on that frame.
        { time: 0.95, expected: [0, 115, 140] },
        { time: 1.175, expected: [0, 0, 255] },
      ].flatMap((point) => [180, 325].map((y) => ({ ...point, x: 320, y })));
      const proof = await encodedNativeVideoSamples(page, host.origin, project, format, points);
      expect(proof.width).toBe(640);
      expect(proof.height).toBe(360);
      // An Opus packet can extend the container tail by 20 ms, within one 40 fps frame.
      expect(Math.abs(proof.duration - 1.2)).toBeLessThanOrEqual(0.0250001);
      expect(proof.samples).toHaveLength(points.length);
      await writeFile(
        test.info().outputPath('scene-edge-encoded-video.json'),
        JSON.stringify({ format, ...proof }, null, 2)
      );
      const fadedAudio = await readEncodedAudioWindows(page, [0.1, 0.3, 0.6, 0.8, 1.1]);
      const neutral = structuredClone(project);
      neutral.sceneEdges!.intro.audioFade = false;
      neutral.sceneEdges!.outro.audioFade = false;
      await encodedNativeVideoSamples(page, host.origin, neutral, format, points.slice(0, 1));
      const referenceAudio = await readEncodedAudioWindows(page, [0.1, 0.3, 0.6, 0.8, 1.1]);
      await writeFile(
        test.info().outputPath('scene-edge-encoded-audio.json'),
        JSON.stringify({ format, fadedAudio, referenceAudio }, null, 2)
      );
      for (const [i, time] of [0.1, 0.3, 0.6, 0.8, 1.1].entries()) {
        expect(referenceAudio[i]!).toBeGreaterThan(0.001);
        const middle = time + 0.01;
        const expected = Math.min(1, middle / 0.5, (1.2 - middle) / 0.5);
        // The 20 ms RMS window and lossy Opus encoding allow 0.06 of the reference level.
        expect(Math.abs(fadedAudio[i]! / referenceAudio[i]! - expected)).toBeLessThan(0.06);
      }

      // VP9 chroma conversion and quantization can move a flat RGB sample by a few levels.
      for (const sample of proof.samples) expect(sample.error).toBeLessThanOrEqual(8);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
