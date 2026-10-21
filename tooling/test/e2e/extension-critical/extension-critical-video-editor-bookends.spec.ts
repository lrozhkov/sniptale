import { isExportReadyVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { createQuickEditWatermark } from '../../../../apps/extension/src/features/video/project/scene/watermark';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  parseEffectV1Source,
  resolveEffectV1ControlDefault,
} from '@sniptale/runtime-contracts/effect-v1';
import {
  createVideoProjectFromRecording,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createShapeClip } from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';
import { createVideoProjectMotionRegion } from '../../../../apps/extension/src/features/video/project/motion';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import {
  checkInspectorLabels,
  checkInspectorPaintedFont,
  chooseInspectorValue,
} from '../support/inspector-utilities';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'ru' : 'en';
  const theme = index === 0 ? 'light' : 'dark';
  const format = index === 0 ? 'MP4' : 'WEBM';
  test(`editable bookends retain composition ${viewport.name} ${locale} ${format}`, async ({
    page,
  }, info) => {
    test.setTimeout(240000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const project = await createBookendCompositionFixture(locale);
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript((language) => {
        if (window !== window.top) return;
        localStorage.setItem('sniptale-locale-preference', language);
        if (sessionStorage.getItem('bookends-seeded')) {
          const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
          if (typeof bootstrap === 'object' && bootstrap !== null)
            Reflect.deleteProperty(bootstrap, 'videoProjects');
        }
      }, locale);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.evaluate(() => sessionStorage.setItem('bookends-seeded', 'true'));
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 641;
        canvas.height = 201;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#ff0000';
        context.fillRect(0, 0, 641, 201);
        return canvas.toDataURL('image/png').split(',')[1]!;
      });
      const imageName = 'Opening — a deliberately long material name for the command menu.png';
      await page
        .locator('[data-ui="video-editor.materials"] input[type="file"][accept*="image/"]')
        .setInputFiles({
          name: imageName,
          mimeType: 'image/png',
          buffer: Buffer.from(png, 'base64'),
        });
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.assets.some((asset) => asset.type === 'IMAGE')
        )
        .toBe(true);
      const select = async () => {
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
          .click();
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneEdges'), exact: true })
          .click();
      };
      await select();
      const intro = page.getByRole('button', {
        name: label('videoEditor.sidebar.bookendInsertIntro'),
        exact: true,
      });
      const outro = page.getByRole('button', {
        name: label('videoEditor.sidebar.bookendInsertOutro'),
        exact: true,
      });
      const owner = page.locator('[data-ui="video-editor.scene-edges.inspector"]');
      const menu = page.getByRole('menu', {
        name: label('videoEditor.sidebar.bookendInsertIntro'),
        exact: true,
      });
      await checkInspectorPaintedFont(page, intro, 'bookend-trigger-font');
      await page.locator('[data-ui="video-editor.materials.close"]').click();
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
      const rail = inspector.locator('[data-ui="video-editor.inspector.categories"] > nav');
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
        await outro.scrollIntoViewIfNeeded();
        expect((await rail.boundingBox())?.y).toBe(before?.y);
        await intro.click();
        await expect(menu).toBeVisible();
        await checkInspectorPaintedFont(
          page,
          menu.getByRole('menuitem').last(),
          `bookend-menu-font-${width}`
        );
        expect(await menu.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
        expect(await menu.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        const longName = menu.getByRole('menuitem').last().locator('span');
        await expect(longName).toHaveCSS('text-overflow', 'ellipsis');
        expect(await longName.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        await expect(menu.getByRole('menuitem').last()).toHaveAttribute('title', imageName);
        const rect = (await menu.boundingBox())!;
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.size.width + 1);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.size.height + 1);
        await checkInspectorLabels(owner);
        expect(
          await owner.evaluate((node) => {
            const body = node.closest('[data-ui="video-editor.inspector.categories"] > div');
            return body instanceof HTMLElement && body.scrollWidth <= body.clientWidth + 1;
          })
        ).toBe(true);
        await page.screenshot({ path: info.outputPath(`bookends-${width}.png`), fullPage: false });
        await page.keyboard.press('Escape');
        await expect(intro).toBeFocused();
      }
      await intro.focus();
      await page.keyboard.press('ArrowUp');
      await expect(menu.getByRole('menuitem').last()).toBeFocused();
      await page.keyboard.press('Home');
      await expect(menu.getByRole('menuitem').first()).toBeFocused();
      await page.keyboard.press('End');
      await expect(menu.getByRole('menuitem').last()).toBeFocused();
      await page.keyboard.press('Escape');
      const beforeRecipes = (await readNativeVideoProject(page))!;
      const introFields = page.locator('[data-ui="video-editor.scene-bookends.intro"]');
      await introFields
        .getByRole('button', { name: label('videoEditor.sidebar.bookendPreset'), exact: true })
        .click();
      const preset = introFields.locator('[data-ui="video-editor.scene-bookends.preset"]');
      await chooseInspectorValue(
        page,
        preset,
        label('videoEditor.sidebar.bookendPreset'),
        label('gallery.videoReview.presentationImage')
      );
      await preset
        .getByRole('button', { name: label('videoEditor.sidebar.bookendChooseImage'), exact: true })
        .click();
      await page
        .getByRole('menu', { name: label('videoEditor.sidebar.bookendChooseImage'), exact: true })
        .getByRole('menuitem', { name: imageName, exact: true })
        .click();
      await expect
        .poll(
          async () => (await readNativeVideoProject(page))?.bookendPresets?.intro.image?.duration
        )
        .toBe(3);
      const duration = preset.getByRole('textbox', {
        name: label('gallery.videoReview.presentationDuration'),
        exact: true,
      });
      await duration.fill('5');
      await duration.press('Enter');
      const framing = preset
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.presentationFraming') });
      await framing.click();
      await chooseInspectorValue(
        page,
        preset,
        label('gallery.videoReview.presentationFit'),
        label('gallery.videoReview.presentationCover')
      );
      const pan = preset.getByRole('textbox', {
        name: label('gallery.videoReview.presentationPanX'),
        exact: true,
      });
      await pan.fill('37');
      await pan.press('Enter');
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
        await pan.scrollIntoViewIfNeeded();
        await checkInspectorLabels(preset);
        await checkInspectorPaintedFont(page, framing, `preset-framing-font-${width}`);
        expect(
          await preset.evaluate((node) => {
            const body = node.closest('[data-ui="video-editor.inspector.categories"] > div');
            return body instanceof HTMLElement && body.scrollWidth <= body.clientWidth + 1;
          })
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`bookend-preset-${width}.png`),
          fullPage: false,
        });
      }
      await chooseInspectorValue(
        page,
        preset,
        label('gallery.videoReview.presentationFit'),
        label('gallery.videoReview.presentationContain')
      );
      const before = (await readNativeVideoProject(page))!;
      expect(before.clips).toEqual(beforeRecipes.clips);
      expect(before.bookendPresets?.intro.image).toMatchObject({
        duration: 5,
        crop: { panX: 0.37, panY: 0 },
      });
      await intro.click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.duration)
        .toBeCloseTo(6.2, 6);
      const prefixed = (await readNativeVideoProject(page))!;
      for (const clip of before.clips)
        expect(prefixed.clips.find((item) => item.id === clip.id)!.startTime).toBeCloseTo(
          clip.startTime + 5,
          7
        );
      expect(prefixed.textDocuments![0]!.document.fragments[0]).toMatchObject({
        start: 5.2,
        end: 5.6,
      });
      expect(prefixed.commentDocuments![0]!.annotations[0]!.anchor).toEqual({
        kind: 'point',
        time: 5.4,
      });
      expect(prefixed.effectInstances![0]).toMatchObject({
        startTime: 5,
        duration: 0.8,
        playbackRate: project.effectInstances![0]!.playbackRate,
      });
      expect(prefixed.assets).toEqual(before.assets);
      expect(prefixed.transitions).toHaveLength(before.transitions!.length);
      for (const transition of before.transitions!) {
        const retained = prefixed.transitions!.find((item) => item.id === transition.id)!;
        expect(retained).toEqual({ ...transition, duration: retained.duration });
        expect(retained.duration).toBeCloseTo(transition.duration, 7);
      }
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
            (await readNativeVideoProject(page))?.clips.find((clip) => clip.type === 'IMAGE')
              ?.transform.rotation
        )
        .toBe(5);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.find((clip) => clip.type === 'IMAGE')
              ?.transform.rotation
        )
        .toBe(0);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.duration)
        .toBeCloseTo(1.2, 6);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.duration)
        .toBeCloseTo(6.2, 6);
      await select();
      await outro.click();
      await page
        .getByRole('menu', { name: label('videoEditor.sidebar.bookendInsertOutro'), exact: true })
        .getByRole('menuitem', { name: 'beta-v1.webm', exact: true })
        .click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.duration)
        .toBeCloseTo(18.2, 6);
      const accepted = (await readNativeVideoProject(page))!;
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect((await readNativeVideoProject(page))!.clips).toEqual(accepted.clips);
      expect((await readNativeVideoProject(page))!.bookendPresets).toEqual(accepted.bookendPresets);
      await select();
      expect((await readNativeVideoProject(page))!.compositionJoins).toEqual(
        accepted.compositionJoins
      );
      await page.locator('[data-ui="video-editor.materials.close"]').click();
      const joins = owner.locator('[data-ui="shared.ui.presentation-join-fields"]');
      const firstJoin = joins.first();
      await chooseInspectorValue(
        page,
        firstJoin,
        label('videoEditor.sidebar.compositionJoin'),
        label('gallery.videoReview.cutDissolve')
      );
      await owner
        .getByRole('button', {
          name: label('videoEditor.sidebar.compositionJoinSeek'),
          exact: true,
        })
        .first()
        .click();
      await expect
        .poll(async () =>
          page.locator('[data-preview-stage-canvas]').evaluate((node) => {
            if (!(node instanceof HTMLCanvasElement)) throw new Error('Missing preview canvas');
            const pixel = node
              .getContext('2d')!
              .getImageData(Math.floor(node.width / 2), Math.floor(node.height / 2), 1, 1).data;
            return Math.max(Math.abs(pixel[0]! - 128), Math.abs(pixel[1]! - 128), pixel[2]!);
          })
        )
        .toBeLessThanOrEqual(1);
      await chooseInspectorValue(
        page,
        firstJoin,
        label('videoEditor.sidebar.compositionJoin'),
        label('gallery.videoReview.cutFadeColor')
      );
      await expect
        .poll(
          async () => (await readNativeVideoProject(page))?.compositionJoins?.[0]?.transition?.type
        )
        .toBe('fade-black');
      await owner
        .getByRole('button', {
          name: label('videoEditor.sidebar.compositionJoinSeek'),
          exact: true,
        })
        .first()
        .click();
      await expect
        .poll(async () =>
          page.locator('[data-preview-stage-canvas]').evaluate((node) => {
            if (!(node instanceof HTMLCanvasElement)) throw new Error('Missing preview canvas');
            const pixel = node
              .getContext('2d')!
              .getImageData(Math.floor(node.width / 2), Math.floor(node.height / 2), 1, 1).data;
            return Array.from(pixel);
          })
        )
        .toEqual([0, 0, 0, 255]);
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
        await firstJoin.scrollIntoViewIfNeeded();
        await checkInspectorLabels(firstJoin);
        await checkInspectorPaintedFont(page, firstJoin, `join-font-${width}`);
        expect(
          await firstJoin.evaluate((node) => {
            const body = node.closest('[data-ui="video-editor.inspector.categories"] > div');
            return body instanceof HTMLElement && body.scrollWidth <= body.clientWidth + 1;
          })
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`composition-join-${width}.png`),
          fullPage: false,
        });
      }
      await chooseInspectorValue(
        page,
        firstJoin,
        label('videoEditor.sidebar.compositionJoin'),
        label('gallery.videoReview.transitionNone')
      );
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.compositionJoins?.[0]?.transition)
        .toBeUndefined();
      await page.setViewportSize({ width: 1100, height: 560 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true);
      const output = structuredClone(accepted);
      const card = output.assets.find((asset) => asset.type === 'IMAGE')!;
      output.sceneEdges = {
        intro: { enabled: true, duration: 5.2, color: '#000000ff', audioFade: false },
        outro: { enabled: false, duration: 0.2 },
      };
      output.watermark = {
        ...createQuickEditWatermark('Mark'),
        mode: 'image',
        image: {
          assetId: `project-asset:${card.id}`,
          width: 641,
          height: 201,
          size: 0.1,
          opacity: 1,
        },
        placement: { anchor: 'top-left', margin: 0.02 },
      };
      output.compositionJoins = output.compositionJoins!.map((boundary) => ({
        ...boundary,
        transition:
          boundary.edge === 'end'
            ? { type: 'dissolve', before: 0.2, after: 0.2 }
            : { type: 'fade-black', before: 0.1, after: 0.1, color: '#ffffff' },
      }));
      expect(isExportReadyVideoProject(output)).toBe(true);
      const encoded = await encodedNativeVideoSamples(page, host.origin, output, format, [
        { time: 0.2, x: 320, y: 180, expected: [10, 0, 0] },
        { time: 0.2, x: 320, y: 10, expected: [0, 0, 0] },
        { time: 4.9, x: 320, y: 180, expected: [180, 60, 0] },
        { time: 5, x: 320, y: 180, expected: [123, 123, 0] },
        { time: 5.1, x: 320, y: 180, expected: [63, 188, 0] },
        { time: 5, x: 320, y: 10, expected: [0, 123, 0] },
        { time: 5, x: 20, y: 12, expected: [245, 0, 0] },
        { time: 5.2, x: 320, y: 180, expected: [0, 255, 0] },
        { time: 5.8, x: 320, y: 180, expected: [0, 255, 0] },
        { time: 6.2, x: 320, y: 180, expected: [255, 255, 255] },
        { time: 6.2, x: 20, y: 12, expected: [255, 255, 255] },
      ]);
      expect(
        accepted.compositionJoins!.every((boundary) => boundary.transition === undefined)
      ).toBe(true);
      expect(encoded.duration).toBeCloseTo(18.2, 1);
      expect(encoded.samples.every((sample) => sample.error < 12)).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

async function createBookendCompositionFixture(locale: 'ru' | 'en') {
  const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
  const project = createVideoProjectFromRecording({
    recordingId: 'beta-v1-recording',
    filename: 'beta-v1.webm',
    width: 640,
    height: 360,
    duration: 12,
    mimeType: 'video/webm',
    size: bytes.length,
    hasAudio: true,
  });
  project.version = 24;
  project.sceneBackground = { kind: 'solid', color: '#0000ffff' };
  project.duration = 1.2;
  project.clips.forEach((clip) => {
    clip.duration = 1.2;
    if (clip.type === 'VIDEO' || clip.type === 'AUDIO') clip.sourceDuration = 1.2;
  });
  const leading = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (leading.type !== 'VIDEO') throw new Error('Expected video');
  leading.duration = leading.sourceDuration = 0.8;
  const trailing = { ...leading, id: 'trailing', startTime: 0.4, sourceStart: 0.4 };
  project.clips.push(trailing);
  project.transitions = [
    {
      id: 'join',
      leadingClipId: leading.id,
      trailingClipId: trailing.id,
      kind: 'CROSSFADE',
      duration: 0.4,
      easing: 'LINEAR',
    },
  ];
  const track = createVideoProjectTrack('Upper composition', -1, 'PRIMARY');
  const shape = createShapeClip(track.id, 640, 360, 0, 'RECTANGLE');
  shape.duration = 1.2;
  shape.transform = { x: 0, y: 0, width: 640, height: 360, opacity: 1, rotation: 0 };
  shape.style = {
    fillColor: '#00ff00ff',
    strokeColor: '#00ff00ff',
    strokeWidth: 0,
    borderRadius: 0,
  };
  project.tracks.push(track);
  project.clips.push(shape);
  project.motionRegions = [{ ...createVideoProjectMotionRegion(project, 0.2), duration: 0.4 }];
  project.textDocuments = [
    {
      id: 'script',
      binding: { kind: 'project' },
      document: {
        version: 1,
        fragments: [
          {
            id: 'phrase',
            originalText: 'Main',
            text: 'Main',
            start: 0.2,
            end: 0.6,
            revision: 0,
            timingRevision: 0,
            alignment: 'range',
            timeDomain: 'result',
            showInVideo: false,
          },
        ],
      },
    },
  ];
  project.commentDocuments = [
    {
      id: 'notes',
      binding: { kind: 'project' },
      annotations: [{ id: 'note', text: 'Main note', anchor: { kind: 'point', time: 0.4 } }],
      canvasComments: [],
    },
  ];
  const sourceMaterial = project.assets[0]!;
  for (let materialIndex = 0; materialIndex < 12; materialIndex++) {
    project.assets.push({
      ...sourceMaterial,
      id: `unused-material-${materialIndex}`,
      name: `Source ${materialIndex + 1} — retained project material`,
    });
  }
  const source = await readFile(
    new URL(
      '../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-target-effect.sniptale-effect.json',
      import.meta.url
    ),
    'utf8'
  );
  const effect = parseEffectV1Source(source).document;
  if (!effect) throw new Error('Invalid effect fixture');
  const sha256 = createHash('sha256').update(source).digest('hex');
  project.effectSnapshots = [
    {
      id: `effect:${sha256}`,
      sha256,
      source,
      documentId: effect.id,
      kind: effect.kind,
      schemaVersion: 'sniptale.effect.v1',
      assets: [],
      retainedByteLength: Buffer.byteLength(source),
    },
  ];
  project.effectInstances = [
    {
      id: 'fx',
      kind: 'targetEffect',
      target: { kind: 'clip', clipId: leading.id },
      snapshotId: `effect:${sha256}`,
      enabled: true,
      startTime: 0,
      duration: 0.8,
      playbackRate: effect.duration / 0.8,
      rangeMode: 'owner',
      controls: Object.fromEntries(
        effect.controls.map((control) => [
          control.id,
          resolveEffectV1ControlDefault(control, locale),
        ])
      ),
    },
  ];
  return project;
}
