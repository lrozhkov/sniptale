import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { mapCompositionPointThroughCamera } from '../../../../apps/extension/src/features/video/composition/motion';
import { resolveEffectSourceProjection } from '../../../../apps/extension/src/features/video/composition/motion/source-window';
import { projectQuickEditPoint } from '../../../../apps/extension/src/features/video/composition/motion/spatial-geometry';
import {
  EFFECT_V1_TARGET_FIXTURE,
  EFFECT_V1_TRANSITION_FIXTURE,
  importEffectFile,
} from './extension-critical-video-effects.helpers';
import { isBoundedVideoProjectExportSettings } from '../../../../apps/extension/src/features/video/project/export/settings-validation';
import { resolveVideoCompositionFrame } from '../../../../apps/extension/src/features/video/composition/timeline/frame';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { isProjectExportInputReference } from '../../../../apps/extension/src/contracts/video/types/project-export-input';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  SETTINGS_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
  VideoMessageType,
  getRuntimeMessagesByType,
} from '../extension-critical.helpers';
import { addReviewFocus, seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { readNativeVideoProject } from '../support/native-video-project';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import { checkInspectorPaintedFont, chooseInspectorValue } from '../support/inspector-utilities';

async function drawAnnotation(page: Page, start: number, end: number) {
  const lane = page.locator('[data-ui="gallery.videoReview.annotationEffectsLane"]');
  await lane.scrollIntoViewIfNeeded();
  const box = (await lane.boundingBox())!;
  await page.mouse.move(box.x + (box.width * start) / 12, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width * end) / 12, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

const baseCase = {
  viewport: PRIMARY_BROWSER_VIEWPORTS[0]!,
  format: 'WEBM',
  locale: 'en',
  theme: 'light',
  crop: false,
  spatial: false,
  selectedOnly: false,
  nativeFx: false,
  groupFx: false,
  spotlight: false,
  spotlightEffect: 'dim',
  galleryCut: 'none',
} as const;

for (const {
  viewport,
  format,
  locale,
  theme,
  crop,
  spatial,
  selectedOnly,
  nativeFx,
  groupFx,
  spotlight,
  spotlightEffect,
  galleryCut,
} of [
  { ...baseCase, nativeFx: true },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
  },
  { ...baseCase, crop: true },
  { ...baseCase, crop: true, spatial: true },
  { ...baseCase, crop: true, selectedOnly: true, nativeFx: true },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
    crop: true,
    spatial: true,
    selectedOnly: true,
    nativeFx: true,
  },
  { ...baseCase, crop: true, spotlight: true, nativeFx: true },
  { ...baseCase, crop: true, spotlight: true, nativeFx: true, groupFx: true },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
    crop: true,
    spatial: true,
    spotlight: true,
    nativeFx: true,
    groupFx: true,
  },
  {
    ...baseCase,
    crop: true,
    spotlight: true,
    spotlightEffect: 'blur',
    nativeFx: true,
    groupFx: true,
  },
  { ...baseCase, crop: true, spatial: true, spotlight: true, nativeFx: true },
  { ...baseCase, crop: true, spotlight: true, spotlightEffect: 'blur', nativeFx: true },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
    crop: true,
    spotlight: true,
    nativeFx: true,
  },
  { ...baseCase, crop: true, nativeFx: true, galleryCut: 'dissolve' },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
    crop: true,
    spatial: true,
    nativeFx: true,
    galleryCut: 'fade-black',
  },
] as const) {
  test(`resource-bearing Gallery annotations remain editable through Native montage reopen and real export ${viewport.name} ${format}${crop ? ' crop-header' : ''}${spatial ? ' 3D' : ''}${selectedOnly ? ' selected-only' : ''}${nativeFx ? ' native-FX' : ''}${groupFx ? ' group-FX' : ''}${spotlight ? ` spotlight-${spotlightEffect}` : ''}${galleryCut === 'none' ? '' : ` gallery-cut-${galleryCut}`}`, async ({
    page,
  }, info) => {
    test.setTimeout(240000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ ...viewport.size });
    const host = await startHostServer();
    await page.emulateMedia({ colorScheme: theme });
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const aggregate = 'recording:beta-v1-recording';
    const title = 'Retained SVG annotation';
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      const base = parseEffectV1Source(
        await readFile(
          'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-standalone.sniptale-effect.json',
          'utf8'
        )
      );
      if (!base.document) throw new Error('Missing EffectV1 fixture');
      const svgText =
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#e020b0"/></svg>';
      const source = JSON.stringify({
        ...base.document,
        id: 'transfer-svg',
        label: { en: title, ru: title },
        objectLayout: { width: 160, height: 90, resize: 'scale' },
        controls: [
          {
            id: 'reveal',
            kind: 'number',
            min: 0.2,
            max: 1,
            step: 0.1,
            defaultValue: 1,
            label: { en: 'Reveal', ru: 'Появление' },
            group: 'appearance',
          },
        ],
        assets: [
          {
            id: 'mark',
            kind: 'svg',
            mimeType: 'image/svg+xml',
            width: 32,
            height: 32,
            svgText,
            byteLength: Buffer.byteLength(svgText),
            sha256: createHash('sha256').update(svgText).digest('hex'),
          },
        ],
        layers: [
          {
            id: 'mark',
            name: 'Mark',
            type: 'svgAsset',
            visible: true,
            assetId: 'mark',
            width: 32,
            height: 32,
            x: 0,
            y: 0,
          },
        ],
        clips: [{ layerId: 'mark', sceneId: 'main', start: 0, duration: 3 }],
        timeline: { phases: [], tracks: [] },
        program: {
          kind: 'graph',
          version: 1,
          commands: [
            {
              op: 'svgParts',
              layerId: 'mark',
              assetId: 'mark',
              x: 0,
              y: 0,
              width: { op: 'read', path: 'width' },
              height: { op: 'read', path: 'height' },
              part: {
                kind: 'preset',
                mode: 'assemble',
                order: 'center',
                reveal: { op: 'read', path: 'controls.reveal' },
                spread: 0,
                scaleFrom: 1,
                stagger: 0,
                rotate: 0,
              },
            },
          ],
        },
      });
      const admitted = parseEffectV1Source(source);
      expect(admitted.diagnostics).toEqual([]);
      expect(admitted.ok).toBe(true);
      await page.goto(
        `${host.origin}${SETTINGS_HARNESS_PATH}?section=video-effects&theme=${theme}`
      );
      const chooser = page.waitForEvent('filechooser');
      await page
        .locator('[data-ui="settings.video-effects"]')
        .getByRole('button', { name: label('videoEditor.effectsLibrary.importMany'), exact: true })
        .click();
      await (
        await chooser
      ).setFiles({
        name: 'transfer-svg.sniptale-effect.json',
        mimeType: 'application/json',
        buffer: Buffer.from(source),
      });
      await expect(
        page.locator('[data-settings-collection-item]').filter({ hasText: title })
      ).toBeVisible();
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      if (crop) {
        await button('gallery.videoReview.scene').click();
        await button('gallery.videoReview.sourceCropEnable').click();
        await button('gallery.videoReview.sourceCropEdit').click();
        const size = dialog.getByRole('textbox', {
          name: label('gallery.videoReview.sourceCropSize'),
          exact: true,
        });
        await size.fill('80');
        await size.press('Enter');
        await button('gallery.videoReview.sourceCropApply').click();
        await button('windowHeader.browser').click();
      }
      if (spotlight) {
        for (const start of [0, 6]) {
          const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
          await ruler.scrollIntoViewIfNeeded();
          const box = (await ruler.boundingBox())!;
          const duration = Number(
            await dialog
              .locator('[data-ui="gallery.videoReview.timePlane"]')
              .getAttribute('aria-valuemax')
          );
          await page.mouse.click(box.x + (box.width * start) / duration + 0.1, box.y + 10);
          await addReviewFocus(page);
          await button('gallery.videoReview.focusSpotlight').click();
          await chooseInspectorValue(
            page,
            dialog,
            label('gallery.videoReview.focusOutside'),
            label(
              spotlightEffect === 'blur'
                ? 'gallery.videoReview.focusBlur'
                : 'gallery.videoReview.focusDim'
            )
          );
          if (
            !(await dialog
              .getByRole('textbox', {
                name: label('gallery.videoReview.focusAreaWidth'),
                exact: true,
              })
              .isVisible())
          )
            await dialog
              .getByRole('heading', { name: label('gallery.videoReview.preciseArea'), exact: true })
              .click();
          for (const key of [
            'gallery.videoReview.focusAreaWidth',
            'gallery.videoReview.focusAreaHeight',
          ] as const) {
            const input = dialog.getByRole('textbox', { name: label(key), exact: true });
            await input.fill('10');
            await input.press('Enter');
          }
        }
      }
      if (spatial) {
        const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
        await ruler.scrollIntoViewIfNeeded();
        const box = (await ruler.boundingBox())!;
        await page.mouse.click(box.x + 0.1, box.y + 10);
        await addReviewFocus(page);
        await dialog
          .locator('[data-ui="gallery.videoReview.spatialTools"]')
          .getByRole('button', { name: label('gallery.videoReview.spatialToolTilt'), exact: true })
          .click();
        const tilt = dialog.getByRole('textbox', {
          name: label('gallery.videoReview.perspectiveY'),
          exact: true,
        });
        await tilt.fill('25');
        await tilt.press('Enter');
      }
      for (const [start, end] of [
        [1, 5],
        [6, 10],
      ]) {
        await button('gallery.videoReview.annotationEffectsAdd').click();
        await button('gallery.videoReview.annotationEffectsChoose').click();
        await page.getByRole('option', { name: title, exact: true }).click();
        await drawAnnotation(page, start!, end!);
      }
      await expect(dialog.locator('[data-annotation-effect-id]')).toHaveCount(2);
      await button('gallery.videoReview.pointerTool').click();
      await dialog.locator('[data-annotation-effect-id]').last().click();
      const attachment = button('gallery.videoReview.annotationAttachment');
      if (!(await attachment.isVisible()))
        await button('gallery.videoReview.annotationPlacement').click();
      await attachment.click();
      await page
        .getByRole('option', {
          name: label('gallery.videoReview.annotationViewportAttachment'),
          exact: true,
        })
        .click();
      await button('gallery.videoReview.annotationEffectsAdd').click();
      await button('gallery.videoReview.annotationEffectsChoose').click();
      await page.getByRole('option', { name: title, exact: true }).click();
      await drawAnnotation(page, 0.1, 0.6);
      await expect(dialog.locator('[data-annotation-effect-id]')).toHaveCount(3);
      await button('gallery.videoReview.cutMode').click();
      const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
      const cutLane = plane.locator(
        (await plane.getAttribute('data-active-tool-lane')) === 'source'
          ? '[data-ui="gallery.videoReview.sourceLane"]'
          : '[data-ui="gallery.videoReview.ruler"]'
      );
      await cutLane.scrollIntoViewIfNeeded();
      const cutBox = (await cutLane.boundingBox())!;
      const sourceDuration = Number(await plane.getAttribute('aria-valuemax'));
      await page.mouse.move(cutBox.x + (cutBox.width * 0.05) / sourceDuration, cutBox.y + 12);
      await page.mouse.down();
      await page.mouse.move(cutBox.x + (cutBox.width * 0.8) / sourceDuration, cutBox.y + 12, {
        steps: 8,
      });
      await page.mouse.up();
      if (galleryCut !== 'none') {
        const settings = dialog.locator('[data-ui="gallery.videoReview.cutTransition"]');
        if (!(await settings.isVisible()))
          await dialog
            .locator('summary')
            .filter({ hasText: label('gallery.videoReview.cutTransition') })
            .click();
        await chooseInspectorValue(
          page,
          settings,
          label('gallery.videoReview.zoomTransitionType'),
          label(
            galleryCut === 'dissolve'
              ? 'gallery.videoReview.cutDissolve'
              : 'gallery.videoReview.cutFadeColor'
          )
        );
      }
      await expect
        .poll(
          async () => (await readNativeReviewWorkspace(page, aggregate))?.effectSnapshots?.length
        )
        .toBe(1);
      await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
      await dialog.locator('[data-ui="gallery.videoReview.openVideoEditor"]').click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
        )
        .toBe(1);
      const gallery = (await readNativeReviewWorkspace(page, aggregate))!;
      const tab = (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []))[0]!;
      const nativeQuery = new URL(tab.url!).searchParams;
      nativeQuery.set('theme', theme);
      await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?${nativeQuery}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.filter((clip) => clip.type === 'EFFECT')
              .length
        )
        .toBe(3);
      const native = (await readNativeVideoProject(page))!;
      expect(native.id).not.toBe(aggregate);
      if (galleryCut !== 'none') {
        expect(
          native.compositionJoins?.some(
            (join) => join.sampling === 'cut' && join.transition?.type === galleryCut
          )
        ).toBe(true);
        expect(native.version).toBeGreaterThanOrEqual(40);
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
          .click();
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneEdges'), exact: true })
          .click();
        const joinFields = page
          .locator(
            '[data-ui="video-editor.scene-edges.inspector"] [data-ui="shared.ui.presentation-join-fields"]'
          )
          .first();
        const other = galleryCut === 'dissolve' ? 'fade-black' : 'dissolve';
        await chooseInspectorValue(
          page,
          joinFields,
          label('videoEditor.sidebar.compositionJoin'),
          label(
            other === 'dissolve'
              ? 'gallery.videoReview.cutDissolve'
              : 'gallery.videoReview.cutFadeColor'
          )
        );
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))?.compositionJoins?.[0]?.transition?.type
          )
          .toBe(other);
        await chooseInspectorValue(
          page,
          joinFields,
          label('videoEditor.sidebar.compositionJoin'),
          label(
            galleryCut === 'dissolve'
              ? 'gallery.videoReview.cutDissolve'
              : 'gallery.videoReview.cutFadeColor'
          )
        );
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.compositionJoins)
          .toEqual(native.compositionJoins);
        expect((await readNativeVideoProject(page))!.clips).toEqual(
          hydrateVideoProject(native).clips
        );
        const seek = page
          .getByRole('button', {
            name: label('videoEditor.sidebar.compositionJoinSeek'),
            exact: true,
          })
          .first();
        const geometry = await seek.evaluate((button) => {
          const bounds = button.getBoundingClientRect(),
            icon = button.querySelector('svg')!.getBoundingClientRect();
          return {
            width: bounds.width,
            clientWidth: button.clientWidth,
            scrollWidth: button.scrollWidth,
            left: bounds.left,
            iconLeft: icon.left,
            iconRight: icon.right,
            right: bounds.right,
          };
        });
        await writeFile(
          info.outputPath('native-cut-seek-geometry.json'),
          JSON.stringify(geometry, null, 2)
        );
        expect(geometry.scrollWidth - geometry.clientWidth).toBeLessThanOrEqual(1);
        expect(geometry.iconLeft).toBeGreaterThanOrEqual(geometry.left - 1);
        expect(geometry.iconRight).toBeLessThanOrEqual(geometry.right + 1);
        await checkInspectorPaintedFont(page, joinFields, 'transferred-cut-join');
        await page.screenshot({
          path: info.outputPath('native-gallery-cut-inspector.png'),
          fullPage: false,
        });
      }
      if (crop) {
        const source = native.clips.find((clip) => clip.type === 'VIDEO');
        expect(source?.type === 'VIDEO' && source.sourceCrop?.width).toBeCloseTo(0.8, 6);
        expect(source?.type === 'VIDEO' && source.windowHeader).toBeTruthy();
      }
      expect(native.effectSnapshots?.[0]?.assets).toHaveLength(1);
      if (spotlight) {
        const region = native.motionRegions!.find((item) => item.spotlight && item.duration > 0.1)!;
        await page.locator(`[data-timeline-effect-segment="${region.id}"] button`).first().click();
        const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
        await inspector
          .locator('nav')
          .getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupAppearance'),
            exact: true,
          })
          .click();
        const coverageLabel = label('videoEditor.sidebar.spotlightCoverage');
        const group = inspector.getByRole('group', { name: coverageLabel, exact: true });
        const currentControl = (await group.count())
          ? group.getByRole('button', {
              name: label('videoEditor.sidebar.spotlightCoverageSourceScene'),
              exact: true,
            })
          : inspector.getByRole('button', { name: coverageLabel, exact: true });
        if (await group.count())
          await expect(currentControl).toHaveAttribute('aria-pressed', 'true');
        await checkInspectorPaintedFont(page, currentControl, 'source-scene-coverage');
        await page.screenshot({
          path: info.outputPath('native-spotlight-coverage.png'),
          fullPage: false,
        });
        const coverage = async () =>
          (await readNativeVideoProject(page))!.motionRegions!.find(
            (item) => item.id === region.id
          )!.spotlightTarget;
        await chooseInspectorValue(
          page,
          inspector,
          coverageLabel,
          label('videoEditor.sidebar.spotlightCoverageScene')
        );
        await expect.poll(coverage).toBe('scene');
        await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
        await expect.poll(coverage).toBe('source-scene');
        await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
        await expect.poll(coverage).toBe('scene');
        await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
        await expect.poll(coverage).toBe('source-scene');
      }
      const content = native.clips.find(
        (clip) => clip.type === 'EFFECT' && clip.attachment?.kind === 'source'
      )!;
      const viewport = native.clips.find(
        (clip) => clip.type === 'EFFECT' && clip.attachment?.kind === 'viewport'
      )!;
      expect(content).toBeTruthy();
      expect(viewport).toBeTruthy();
      const dormant = native.clips.find(
        (clip) => clip.type === 'EFFECT' && clip.sourceRange?.dormant
      )!;
      expect(dormant).toBeTruthy();
      if (spatial)
        expect(native.motionRegions?.some((region) => region.perspective?.enabled)).toBe(true);
      const initialVideoCount = native.clips.filter((clip) => clip.type === 'VIDEO').length;
      const durationBeforeDormantEdit = native.duration;
      const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      await playhead.press('Home');
      for (let n = 0; n < 6; n++) await playhead.press('ArrowRight');
      const dormantPoint = {
        x: Math.round(dormant.transform.x + dormant.transform.width / 2),
        y: Math.round(dormant.transform.y + dormant.transform.height / 2),
      };
      const readDormantPixel = (point = dormantPoint) =>
        page
          .locator('[data-ui="video.preview.stage.root"] canvas[data-preview-stage-canvas]')
          .evaluate(
            (canvas: HTMLCanvasElement, input) =>
              Array.from(
                canvas
                  .getContext('2d')!
                  .getImageData(
                    Math.round((canvas.width * input.point.x) / input.width),
                    Math.round((canvas.height * input.point.y) / input.height),
                    1,
                    1
                  ).data
              ).slice(0, 3),
            { point, width: native.width, height: native.height }
          );
      await expect
        .poll(() =>
          page
            .locator('[data-ui="video.preview.stage.root"] canvas[data-preview-stage-canvas]')
            .evaluate((canvas: HTMLCanvasElement, dimmed) => {
              const pixels = canvas
                .getContext('2d')!
                .getImageData(0, 0, canvas.width, canvas.height).data;
              let colored = 0;
              for (let i = 0; i < pixels.length; i += 16) {
                const channels = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
                if (Math.max(...channels) - Math.min(...channels) > (dimmed ? 20 : 50)) colored++;
              }
              return colored;
            }, spotlight)
        )
        .toBeGreaterThan(50);
      const dormantPixel = await readDormantPixel();
      expect(
        Math.max(
          ...dormantPixel.map((channel, channelIndex) =>
            Math.abs(channel - [224, 32, 176][channelIndex]!)
          )
        )
      ).toBeGreaterThan(32);

      const dragTimelineClip = async (id: string, delta: number) => {
        const node = page.locator(`[data-project-timeline-clip="${id}"]`);
        await node.scrollIntoViewIfNeeded();
        await node.evaluate((item) => item.scrollIntoView({ block: 'center', inline: 'nearest' }));
        const box = (await node.boundingBox())!;
        const x = box.x + Math.min(box.width / 2, 60),
          y = box.y + box.height / 2;
        const hit = await page.evaluate(
          ({ x, y }) =>
            document
              .elementFromPoint(x, y)
              ?.closest('[data-project-timeline-clip]')
              ?.getAttribute('data-project-timeline-clip'),
          { x, y }
        );
        expect(hit).toBe(id);
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + delta, y, { steps: 8 });
        await page.mouse.up();
      };
      await dragTimelineClip(dormant.id, 80);
      await expect
        .poll(async () => {
          const host = (await readNativeVideoProject(page))?.clips.find(
            (clip) => clip.id === dormant.id
          );
          return host?.type === 'EFFECT' ? host.sourceRange?.dormant === true : true;
        })
        .toBe(false);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => {
          const host = (await readNativeVideoProject(page))?.clips.find(
            (clip) => clip.id === dormant.id
          );
          return host?.type === 'EFFECT' ? host.sourceRange?.dormant : false;
        })
        .toBe(true);
      expect((await readNativeVideoProject(page))!.duration).toBe(durationBeforeDormantEdit);
      await dragTimelineClip(content.id, 60);
      await page
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupTiming'),
          exact: true,
        })
        .click();
      const restoreTiming = page.locator('[data-ui="video-editor.effect.restore-source-timing"]');
      await expect(restoreTiming).toBeEnabled();
      await checkInspectorPaintedFont(page, restoreTiming, 'annotation-source-interval-restore');
      await page.screenshot({
        path: info.outputPath('native-annotation-timing.png'),
        fullPage: false,
      });
      await restoreTiming.click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === content.id)
              ?.startTime
        )
        .toBeCloseTo(content.startTime, 5);
      await expect(restoreTiming).toBeDisabled();

      await page.locator(`[data-project-timeline-clip="${content.id}"]`).click();
      await playhead.press('Home');
      for (let n = 0; n < 60; n++) await playhead.press('ArrowRight');
      await page
        .getByRole('button', {
          name: label('videoEditor.effectsLibrary.objectAppearance'),
          exact: true,
        })
        .click();
      const reveal = page.getByRole('textbox', {
        name: locale === 'en' ? 'Reveal' : 'Появление',
        exact: true,
      });
      await reveal.fill('0.8');
      await reveal.press('Enter');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.effectInstances?.find(
              (item) => item.id === (content.type === 'EFFECT' ? content.effectInstanceId : '')
            )?.controls['reveal']
        )
        .toBe(0.8);
      await reveal.fill('1');
      await reveal.press('Enter');
      await checkInspectorPaintedFont(page, reveal, 'transferred-annotation-control');
      await page
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupTransform'),
          exact: true,
        })
        .click();
      await page.locator('[data-ui="video.preview.stage.root"]').focus();
      const attachmentControl = page.locator('[data-ui="video-editor.inspector.attachment"]');
      const beforeAttachmentBox = (await page
        .locator('[data-preview-selection-state="editable"]')
        .boundingBox())!;
      await attachmentControl
        .getByRole('button', {
          name: label('gallery.videoReview.annotationViewportAttachment'),
          exact: true,
        })
        .click();
      const attachmentKind = async () => {
        const host = (await readNativeVideoProject(page))?.clips.find(
          (item) => item.id === content.id
        );
        return host?.type === 'EFFECT' ? host.attachment?.kind : null;
      };
      await expect.poll(attachmentKind).toBe('viewport');
      await page.locator('[data-ui="video.preview.stage.root"]').focus();
      const afterAttachmentBox = (await page
        .locator('[data-preview-selection-state="editable"]')
        .boundingBox())!;
      for (const key of ['x', 'y', 'width', 'height'] as const)
        expect(Math.abs(beforeAttachmentBox[key] - afterAttachmentBox[key])).toBeLessThanOrEqual(
          0.5
        );
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(attachmentKind).toBe('source');
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect.poll(attachmentKind).toBe('viewport');
      await attachmentControl
        .getByRole('button', {
          name: label('gallery.videoReview.annotationContentAttachment'),
          exact: true,
        })
        .click();
      await expect.poll(attachmentKind).toBe('source');
      await checkInspectorPaintedFont(page, attachmentControl, 'transferred-attachment-control');
      await page.screenshot({
        path: info.outputPath('native-annotation-attachment.png'),
        fullPage: false,
      });
      await page.locator('[data-ui="video.preview.stage.root"]').focus();
      const selection = page.locator('[data-preview-selection-state="editable"]');
      await expect(selection).toBeVisible();
      if (spatial) {
        await playhead.press('Home');
        for (let n = 0; n < 18; n++) await playhead.press('ArrowRight');
        await page.locator('[data-ui="video.preview.stage.root"]').focus();
        const before = (await readNativeVideoProject(page))!;
        const beforeHost = before.clips.find((clip) => clip.id === content.id)!;
        const projectedCenter = (project: typeof before) => {
          const host = project.clips.find((clip) => clip.id === content.id)!;
          const camera = resolveVideoCompositionFrame(project, 0.6).camera;
          expect(camera.spatial).toBeTruthy();
          const projection = resolveEffectSourceProjection(project, host, camera, 0.6);
          expect(projection).toBeTruthy();
          return mapCompositionPointThroughCamera(
            projectQuickEditPoint(projection!, {
              x: host.transform.x + host.transform.width / 2,
              y: host.transform.y + host.transform.height / 2,
            })!,
            camera
          )!;
        };
        const point = projectedCenter(before);
        const canvas = (await page.locator('[data-preview-stage-canvas]').boundingBox())!;
        const scale = Math.min(canvas.width / before.width, canvas.height / before.height);
        const origin = {
          x: canvas.x + (canvas.width - before.width * scale) / 2 + point.x * scale,
          y: canvas.y + (canvas.height - before.height * scale) / 2 + point.y * scale,
        };
        await page.mouse.move(origin.x, origin.y);
        await page.mouse.down();
        await page.mouse.move(origin.x + 24, origin.y + 12, { steps: 8 });
        await page.mouse.up();
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))!.clips.find((clip) => clip.id === content.id)!
                .transform.x
          )
          .not.toBe(beforeHost.transform.x);
        const after = projectedCenter((await readNativeVideoProject(page))!);
        expect(Math.abs((after.x - point.x) * scale - 24)).toBeLessThanOrEqual(1);
        expect(Math.abs((after.y - point.y) * scale - 12)).toBeLessThanOrEqual(1);
        await page.screenshot({
          path: info.outputPath('native-annotation-3d-moved.png'),
          fullPage: false,
        });
        await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))!.clips.find((clip) => clip.id === content.id)!
                .transform
          )
          .toEqual(beforeHost.transform);
        await playhead.press('Home');
        for (let n = 0; n < 60; n++) await playhead.press('ArrowRight');
        await page.locator('[data-ui="video.preview.stage.root"]').focus();
      }
      const selectionBox = (await selection.boundingBox())!;
      await page.mouse.move(
        selectionBox.x + selectionBox.width / 2,
        selectionBox.y + selectionBox.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        selectionBox.x + selectionBox.width / 2 + 24,
        selectionBox.y + selectionBox.height / 2 + 12,
        { steps: 8 }
      );
      await page.mouse.up();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.find((item) => item.id === content.id)
              ?.transform.x
        )
        .not.toBe(content.transform.x);
      await page.screenshot({
        path: info.outputPath('native-annotation-edited.png'),
        fullPage: false,
      });
      await page.locator('[data-ui="video-editor.materials.import"]').click();
      const secondChooser = page.waitForEvent('filechooser');
      await page
        .locator('[data-ui="video-editor.materials.import-menu"]')
        .getByRole('button', { name: label('videoEditor.app.materialsVideo'), exact: true })
        .click();
      await (await secondChooser).setFiles('tooling/test/e2e/fixtures/review-webcam-clock.webm');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.assets.length)
        .toBe(native.assets.length + 1);
      const asset = (await readNativeVideoProject(page))!.assets.find(
        (item) => !native.assets.some((original) => original.id === item.id)
      )!;
      expect(asset.id).not.toBe(
        content.type === 'EFFECT' && content.attachment?.kind === 'source'
          ? content.attachment.assetId
          : ''
      );
      await page.locator(`[data-material-id="${asset.id}"]`).locator('[draggable="true"]').click();
      await page
        .locator('[data-ui="video-editor.source-viewer"]')
        .getByTitle(label('videoEditor.app.materialsAppend'), { exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.filter((item) => item.type === 'VIDEO')
              .length
        )
        .toBe(initialVideoCount + 1);
      const appended = (await readNativeVideoProject(page))!.clips
        .filter((item) => item.type === 'VIDEO')
        .at(-1)!;
      await page.locator('[data-ui="video-editor.timeline.toolbar.fit-project"]').click();
      await page.locator(`[data-project-timeline-clip="${appended.id}"]`).click();
      await playhead.press('End');
      for (let n = 0; n < 6; n++) await playhead.press('ArrowLeft');
      await page
        .getByRole('button', { name: label('videoEditor.timeline.split'), exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.filter((item) => item.type === 'VIDEO')
              .length
        )
        .toBe(initialVideoCount + 2);
      await page.locator(`[data-project-timeline-clip="${appended.id}"]`).click();
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
        .poll(async () => {
          const clip = (await readNativeVideoProject(page))?.clips.find(
            (item) => item.id === appended.id
          );
          return clip?.type === 'VIDEO' ? clip.playbackRate : null;
        })
        .toBe(2);
      let sourceTransitionTime: number | null = null;
      let sourceTransitionPair: { leading: string; trailing: string; trackId: string } | null =
        null;
      if (groupFx && spotlight) {
        const sourceAssets = new Set(
          native.clips.filter((clip) => clip.type === 'VIDEO').map((clip) => clip.assetId)
        );
        const beforeSplit = (await readNativeVideoProject(page))!;
        expect(beforeSplit.fps).toBe(30);
        const source = beforeSplit.clips.find(
          (clip) =>
            clip.type === 'VIDEO' &&
            sourceAssets.has(clip.assetId) &&
            clip.startTime < 0.6 &&
            clip.startTime + clip.duration > 0.6
        );
        if (source?.type !== 'VIDEO') throw new Error('Missing source placement for transition.');
        await page.locator(`[data-project-timeline-clip="${source.id}"]`).click();
        await playhead.press('Home');
        for (let frame = 0; frame < 18; frame++) await playhead.press('ArrowRight');
        await page
          .getByRole('button', { name: label('videoEditor.timeline.split'), exact: true })
          .click();
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))!.clips.filter((clip) => clip.type === 'VIDEO')
                .length
          )
          .toBe(initialVideoCount + 3);
        const trailing = (await readNativeVideoProject(page))!.clips.find(
          (clip) =>
            clip.type === 'VIDEO' &&
            clip.assetId === source.assetId &&
            clip.sourceInstanceId === source.sourceInstanceId &&
            Math.abs(clip.startTime - 0.6) < 0.000001
        );
        if (!trailing) throw new Error('Missing split source tail.');
        sourceTransitionPair = {
          leading: source.id,
          trailing: trailing.id,
          trackId: source.trackId,
        };
      }
      if (nativeFx) {
        await page.locator(`[data-project-timeline-clip="${content.id}"]`).click();
        const targetBase = parseEffectV1Source(await readFile(EFFECT_V1_TARGET_FIXTURE, 'utf8'));
        if (!targetBase.document) throw new Error('Missing target effect fixture');
        const targetSource = JSON.stringify({
          ...targetBase.document,
          id: 'native-annotation-accent',
          label: { en: 'Native annotation accent', ru: 'Native annotation accent' },
          controls: groupFx
            ? []
            : [
                {
                  id: 'accent',
                  kind: 'color',
                  label: { en: 'Accent', ru: 'Акцент' },
                  defaultValue: '#20b060',
                },
              ],
          program: {
            kind: 'graph',
            version: 1,
            commands: [
              { op: 'clear' },
              {
                op: 'image',
                input: 'source',
                fit: 'cover',
                x: 0,
                y: 0,
                width: { op: 'read', path: 'width' },
                height: { op: 'read', path: 'height' },
              },
              {
                op: 'shape',
                shape: 'rect',
                fill: { op: 'read', path: 'controls.accent' },
                x: { op: 'mul', args: [{ op: 'read', path: 'width' }, 0.65] },
                y: { op: 'mul', args: [{ op: 'read', path: 'height' }, 0.6] },
                width: { op: 'mul', args: [{ op: 'read', path: 'width' }, 0.1] },
                height: { op: 'mul', args: [{ op: 'read', path: 'height' }, 0.1] },
              },
            ].filter((command) => !groupFx || command.op !== 'shape'),
          },
        });
        expect(parseEffectV1Source(targetSource).diagnostics).toEqual([]);
        const targetPath = info.outputPath('native-annotation-accent.sniptale-effect.json');
        await writeFile(targetPath, targetSource);
        await importEffectFile(page, {
          documentId: 'native-annotation-accent',
          fixturePath: targetPath,
          locale,
        });
        if (groupFx)
          await chooseInspectorValue(
            page,
            page.locator('[data-ui="video-editor.effects-library.dock"]'),
            label('videoEditor.effectsLibrary.applyTo'),
            label('videoEditor.effectsLibrary.wholeVideo')
          );
        const targetCard = page.locator('[data-effect-document="native-annotation-accent"]');
        await targetCard.hover();
        await targetCard
          .getByRole('button', {
            name: label(
              groupFx
                ? 'videoEditor.effectsLibrary.wholeVideo'
                : 'videoEditor.effectsLibrary.applyToClip'
            ),
            exact: true,
          })
          .click();
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))?.effectInstances?.filter(
                (item) => item.kind === 'targetEffect'
              ).length
          )
          .toBe(1);
        await importEffectFile(page, {
          documentId: 'neutral-transition',
          fixturePath: EFFECT_V1_TRANSITION_FIXTURE,
          locale,
        });
        await page.locator('[data-ui="video-editor.timeline.toolbar.fit-project"]').click();
        const sourceTrack = (await readNativeVideoProject(page))!.clips.find(
          (clip) => clip.id === appended.id
        )!.trackId;
        const leadingBeforeClose = (await readNativeVideoProject(page))!.clips.find(
          (clip) => clip.id === appended.id
        )!;
        const trailingBeforeClose = (await readNativeVideoProject(page))!.clips.find(
          (clip) =>
            clip.type === 'VIDEO' &&
            clip.trackId === sourceTrack &&
            clip.id !== appended.id &&
            clip.startTime > leadingBeforeClose.startTime
        )!;
        await page
          .locator(`[data-track-lane-id="${sourceTrack}"]`)
          .getByRole('button', { name: label('videoEditor.timeline.closeGap'), exact: true })
          .last()
          .click();
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))!.clips.find(
                (clip) => clip.id === trailingBeforeClose.id
              )!.startTime
          )
          .toBeCloseTo(leadingBeforeClose.startTime + leadingBeforeClose.duration, 5);
        const junction = page
          .locator(`[data-track-lane-id="${sourceTrack}"]`)
          .locator('[data-ui="timeline.transition-cut-drop"]')
          .last();
        await junction.scrollIntoViewIfNeeded();
        const cardLabel = page.locator('[data-effect-document="neutral-transition"] p').first();
        await cardLabel.scrollIntoViewIfNeeded();
        const card = (await cardLabel.boundingBox())!;
        expect(
          await page.evaluate(
            ({ x, y }) =>
              document
                .elementFromPoint(x, y)
                ?.closest('[data-effect-document]')
                ?.getAttribute('data-effect-document'),
            { x: card.x + card.width / 2, y: card.y + card.height / 2 }
          )
        ).toBe('neutral-transition');
        const drop = (await junction.boundingBox())!;
        await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
        await page.mouse.down();
        await page.mouse.move(drop.x + drop.width / 2, drop.y + drop.height / 2, { steps: 20 });
        await page.mouse.up();
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))?.effectInstances?.filter(
                (item) => item.kind === 'transition'
              ).length
          )
          .toBe(1);
        if (sourceTransitionPair) {
          const sourceJunction = page
            .locator(`[data-track-lane-id="${sourceTransitionPair.trackId}"]`)
            .locator('[data-ui="timeline.transition-cut-drop"]')
            .nth(1);
          await sourceJunction.scrollIntoViewIfNeeded();
          await cardLabel.scrollIntoViewIfNeeded();
          const origin = (await cardLabel.boundingBox())!;
          const destination = (await sourceJunction.boundingBox())!;
          expect(
            await page.evaluate(
              ({ x, y }) =>
                document
                  .elementFromPoint(x, y)
                  ?.closest('[data-effect-document]')
                  ?.getAttribute('data-effect-document'),
              { x: origin.x + origin.width / 2, y: origin.y + origin.height / 2 }
            )
          ).toBe('neutral-transition');
          await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
          await page.mouse.down();
          await page.mouse.move(
            destination.x + destination.width / 2,
            destination.y + destination.height / 2,
            { steps: 20 }
          );
          await page.mouse.up();
          await expect
            .poll(
              async () =>
                (await readNativeVideoProject(page))!.effectInstances?.filter(
                  (item) => item.kind === 'transition'
                ).length
            )
            .toBe(2);
          const transitioned = (await readNativeVideoProject(page))!;
          const junction = transitioned.transitions!.find(
            (item) =>
              item.leadingClipId === sourceTransitionPair!.leading &&
              item.trailingClipId === sourceTransitionPair!.trailing
          )!;
          const runtimeTransition = transitioned.effectInstances!.find(
            (item) => item.target.kind === 'transition' && item.target.transitionId === junction.id
          )!;
          sourceTransitionTime = runtimeTransition.startTime + runtimeTransition.duration / 2;
          const sourceFrame = resolveVideoCompositionFrame(transitioned, sourceTransitionTime);
          await writeFile(
            info.outputPath('source-transition-state.json'),
            JSON.stringify(
              {
                pair: sourceTransitionPair,
                time: sourceTransitionTime,
                transition: runtimeTransition,
                masks: sourceFrame.sceneSpotlights,
                regions: transitioned.motionRegions,
              },
              null,
              2
            )
          );
          expect(
            sourceFrame.effectRuntimePlans.some(
              (plan) =>
                plan.target.kind === 'transition' &&
                plan.target.leadingClipId === sourceTransitionPair!.leading &&
                plan.target.trailingClipId === sourceTransitionPair!.trailing
            )
          ).toBe(true);
          expect(
            sourceFrame.sceneSpotlights?.some(
              (mask) =>
                mask.afterClipId &&
                [sourceTransitionPair!.leading, sourceTransitionPair!.trailing].includes(
                  mask.afterClipId
                )
            )
          ).toBe(true);
        }
        await page.locator('[data-ui="video-editor.materials.close"]').click();
      }
      const checksBackdrop = groupFx && spotlightEffect === 'blur';
      if (checksBackdrop) {
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
          .click();
        const backgroundTab = page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupBackground'),
          exact: true,
        });
        if (await backgroundTab.isVisible()) await backgroundTab.click();
        const background = page.locator('[data-ui="video-editor.scene-background"]');
        await background
          .getByRole('button', {
            name: label('videoEditor.sidebar.sceneBackgroundImage'),
            exact: true,
          })
          .click();
        await background
          .locator('[data-ui="background.image.picker"] input[type="file"]')
          .setInputFiles({
            name: 'native-checkerboard.svg',
            mimeType: 'image/svg+xml',
            buffer: Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="${native.width}" height="${native.height}"><defs><pattern id="tile" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="white"/><rect width="2" height="2" fill="black"/><rect x="2" y="2" width="2" height="2" fill="black"/></pattern></defs><rect width="100%" height="100%" fill="url(#tile)"/></svg>`
            ),
          });
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.sceneBackground?.kind)
          .toBe('image');
        const backgroundBlur = background.getByRole('textbox', {
          name: label('editor.scene.backgroundBlurAmount'),
          exact: true,
        });
        await backgroundBlur.fill('0');
        await backgroundBlur.press('Enter');
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.sceneBackground?.blur ?? 0)
          .toBe(0);
        await playhead.press('Home');
        const originalAssets = new Set(
          native.clips.filter((clip) => clip.type === 'VIDEO').map((clip) => clip.assetId)
        );
        for (const source of (await readNativeVideoProject(page))!.clips.filter(
          (clip) => clip.type === 'VIDEO' && originalAssets.has(clip.assetId)
        )) {
          await page.locator(`[data-project-timeline-clip="${source.id}"]`).click();
          const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
          await inspector
            .locator('nav')
            .getByRole('button', {
              name: label('videoEditor.sidebar.inspectorGroupTransform'),
              exact: true,
            })
            .click();
          const width = inspector.getByRole('textbox', {
            name: label('videoEditor.sidebar.widthLabel'),
            exact: true,
          });
          if (!(await width.isVisible()))
            await inspector
              .getByRole('heading', {
                name: label('videoEditor.sidebar.inspectorExactPlacement'),
                exact: true,
              })
              .click();
          for (const [name, field, value] of [
            [label('videoEditor.sidebar.widthLabel'), 'width', 40],
            [label('videoEditor.sidebar.heightLabel'), 'height', 40],
            ['X', 'x', (native.width - 40) / 2],
            ['Y', 'y', (native.height - 40) / 2],
          ] as const) {
            const input = inspector.getByRole('textbox', { name, exact: true });
            await input.fill(String(value));
            await input.press('Enter');
            await expect
              .poll(
                async () =>
                  (await readNativeVideoProject(page))!.clips.find((clip) => clip.id === source.id)!
                    .transform[field]
              )
              .toBe(value);
          }
        }
      }
      const final = (await readNativeVideoProject(page))!;
      if (spatial) {
        const spatialFrame = resolveVideoCompositionFrame(final, 0.6);
        expect(spatialFrame.camera.spatial).toBeTruthy();
        expect(spatialFrame.visualLayers.some((layer) => layer.clipId === content.id)).toBe(true);
      }
      if (nativeFx) {
        const appliedFx = final.effectInstances!.find((item) => item.kind === 'targetEffect')!;
        expect(appliedFx.target).toEqual(
          groupFx ? { kind: 'video-group' } : { kind: 'clip', clipId: content.id }
        );
        const transition = final.effectInstances!.find((item) => item.kind === 'transition')!;
        expect(
          resolveVideoCompositionFrame(
            final,
            transition.startTime + transition.duration / 2
          ).effectRuntimePlans.some((plan) => plan.effectInstanceId === transition.id)
        ).toBe(true);
      }
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      expect(await readNativeVideoProject(page)).toEqual(final);
      expect(await readNativeReviewWorkspace(page, aggregate)).toEqual(gallery);
      if (spotlight) {
        await page.goto(
          `${host.origin}${SETTINGS_HARNESS_PATH}?section=video-effects&theme=${theme}`
        );
        const catalogRow = page
          .locator('[data-settings-collection-item]')
          .filter({ hasText: title });
        await catalogRow
          .getByRole('button', {
            name: label('settings.collection.actions.delete'),
            exact: true,
          })
          .click();
        await page
          .getByRole('alertdialog')
          .getByRole('button', {
            name: label('common.actions.delete'),
            exact: true,
          })
          .click();
        await expect(catalogRow).toHaveCount(0);
        expect(await readNativeReviewWorkspace(page, aggregate)).toEqual(gallery);
        expect(await readNativeVideoProject(page)).toEqual(final);
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
        await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
        await page
          .locator('[data-gallery-folder="video-project"]')
          .getByRole('button')
          .first()
          .click();
        await page
          .locator(`[data-gallery-keyboard-id="quick-edit-project:${aggregate}"]`)
          .getByRole('button', { name: gallery.project!.name, exact: true })
          .first()
          .click();
        await page
          .locator('[data-ui="gallery.preview.lifecycle-actions"]')
          .getByRole('button', { name: label('common.actions.delete'), exact: true })
          .click();
        const deletion = page.locator('[data-ui="gallery.deletion.menu"]');
        await deletion
          .getByRole('menuitem', {
            name: label('gallery.app.permanentDelete'),
            exact: true,
          })
          .click();
        await deletion
          .getByRole('menuitem', {
            name: label('gallery.app.confirmPermanentDelete'),
            exact: true,
          })
          .click();
        await expect.poll(() => readNativeReviewWorkspace(page, aggregate)).toBeNull();
        await page.goto(
          `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${encodeURIComponent(final.id)}&theme=${theme}`
        );
        await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
        expect(await readNativeVideoProject(page)).toEqual(final);
      }
      await page.locator(`[data-project-timeline-clip="${content.id}"]`).click();
      await playhead.press('Home');
      for (let n = 0; n < 60; n++) await playhead.press('ArrowRight');
      await page.locator('[data-ui="video.preview.stage.root"]').focus();
      await expect(page.locator('[data-preview-selection-state="editable"]')).toBeVisible();
      const reopenedHost = final.clips.find((item) => item.id === content.id)!;
      const annotationPoint = (time: number) => {
        const camera = resolveVideoCompositionFrame(final, time).camera;
        const projection = resolveEffectSourceProjection(final, reopenedHost, camera, time);
        expect(projection).toBeTruthy();
        return mapCompositionPointThroughCamera(
          projectQuickEditPoint(projection!, {
            x: reopenedHost.transform.x + reopenedHost.transform.width / 2,
            y: reopenedHost.transform.y + reopenedHost.transform.height / 2,
          })!,
          camera
        )!;
      };
      const reopenedPoint = annotationPoint(2);
      await expect
        .poll(() =>
          page
            .locator('[data-ui="video.preview.stage.root"] canvas[data-preview-stage-canvas]')
            .evaluate(
              (canvas: HTMLCanvasElement, point) => {
                const pixel = canvas
                  .getContext('2d')!
                  .getImageData(
                    Math.round(
                      (canvas.width -
                        point.width *
                          Math.min(canvas.width / point.width, canvas.height / point.height)) /
                        2 +
                        point.x * Math.min(canvas.width / point.width, canvas.height / point.height)
                    ),
                    Math.round(
                      (canvas.height -
                        point.height *
                          Math.min(canvas.width / point.width, canvas.height / point.height)) /
                        2 +
                        point.y * Math.min(canvas.width / point.width, canvas.height / point.height)
                    ),
                    1,
                    1
                  ).data;
                return pixel[0]! > 180 && pixel[1]! < 70 && pixel[2]! > 130;
              },
              {
                ...reopenedPoint,
                width: final.width,
                height: final.height,
              }
            )
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath('native-annotation-reopened.png'),
        fullPage: false,
      });
      await page.evaluate(
        ({ capabilitiesType, startType }) => {
          window.__sniptaleHarness?.setRuntimeResponse(capabilitiesType, {
            success: true,
            capabilities: {
              formats: [
                { format: 'WEBM', available: true },
                { format: 'MP4', available: true },
              ],
              mp4Codecs: [
                { codec: 'AVC', available: true },
                { codec: 'VP9', available: true },
              ],
              defaultMp4VideoCodec: 'AVC',
            },
            capabilityToken: 'annotation-export-start',
            cancelCapabilityToken: 'annotation-export-cancel',
            ownerDocumentId: 'annotation-editor',
          });
          window.__sniptaleHarness?.setRuntimeResponse(startType, {
            success: true,
            capabilityToken: 'annotation-export-cancel',
            ownerDocumentId: 'annotation-editor',
          });
        },
        {
          capabilitiesType: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
          startType: VideoMessageType.START_PROJECT_EXPORT,
        }
      );
      await page.locator('[data-ui="video-editor.timeline.toolbar.project-menu"]').click();
      await page
        .getByRole('button', { name: label('videoEditor.app.exportButton'), exact: true })
        .click();
      const exportInspector = page.locator('[data-ui="video-editor.export.inspector"]');
      if (selectedOnly)
        await chooseInspectorValue(
          page,
          exportInspector,
          label('videoEditor.exportDialog.scopeLabel'),
          label('videoEditor.exportDialog.scopeSelectedClipLabel')
        );

      await exportInspector
        .getByRole('button', {
          name: label(
            format === 'WEBM'
              ? 'videoEditor.exportDialog.formatWebmLabel'
              : 'videoEditor.exportDialog.formatMp4Label'
          ),
          exact: true,
        })
        .click();
      if (format === 'MP4')
        await exportInspector
          .getByRole('button', {
            name: label('videoEditor.exportDialog.codecVp9Label'),
            exact: true,
          })
          .click();
      await exportInspector
        .getByRole('button', { name: label('videoEditor.exportDialog.submit'), exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await getRuntimeMessagesByType(page, VideoMessageType.START_PROJECT_EXPORT)).length
        )
        .toBe(1);
      const start = (
        await getRuntimeMessagesByType(page, VideoMessageType.START_PROJECT_EXPORT)
      )[0]!;
      if (!isProjectExportInputReference(start.input)) throw new Error('Invalid UI export input');
      if (!isBoundedVideoProjectExportSettings(start.settings))
        throw new Error('Invalid UI export settings');
      if (selectedOnly) {
        expect(start.settings.scope).toBe('selected-clip');
        expect(start.settings.selectedClipIds).toEqual([content.id]);
      }

      const edited = final.clips.find((item) => item.id === content.id)!;
      const greenProjection =
        nativeFx && !groupFx
          ? resolveEffectSourceProjection(
              final,
              edited,
              resolveVideoCompositionFrame(final, 2).camera,
              2
            )
          : null;
      const greenPoint = greenProjection
        ? projectQuickEditPoint(greenProjection, {
            x: edited.transform.x + edited.transform.width * 0.7,
            y: edited.transform.y + edited.transform.height * 0.65,
          })
        : null;
      if (nativeFx && !groupFx) expect(greenPoint).toBeTruthy();
      const spotlightFrame = resolveVideoCompositionFrame(final, 0.6);
      if (spotlight) {
        expect(
          spotlightFrame.sceneSpotlights?.some(
            (state) =>
              state.afterClipId &&
              state.progress > 0.5 &&
              state.spotlight.effect === spotlightEffect
          )
        ).toBe(true);
        expect(
          final.motionRegions
            ?.filter((region) => region.spotlight)
            .every(
              (region) =>
                region.spotlightTarget === 'source-scene' &&
                region.spotlight?.effect === spotlightEffect
            )
        ).toBe(true);
      }
      const spotlightProjection = spotlight
        ? resolveEffectSourceProjection(final, edited, spotlightFrame.camera, 0.6)
        : null;
      const spotlightPoint = spotlightProjection
        ? mapCompositionPointThroughCamera(
            projectQuickEditPoint(spotlightProjection, {
              x: edited.transform.x + edited.transform.width * 0.3,
              y: edited.transform.y + edited.transform.height * 0.3,
            })!,
            spotlightFrame.camera
          )
        : { x: 30, y: 30 };
      if (spotlight && spatial) {
        expect(spotlightFrame.camera.spatial).toBeTruthy();
        expect(spotlightFrame.sceneSpotlights?.some((state) => state.afterClipId)).toBe(true);
        expect(spotlightPoint).toBeTruthy();
      }
      const transitionCamera =
        sourceTransitionTime === null
          ? null
          : resolveVideoCompositionFrame(final, sourceTransitionTime).camera;
      const transitionProjection =
        transitionCamera &&
        resolveEffectSourceProjection(final, edited, transitionCamera, sourceTransitionTime!);
      const transitionPoint =
        transitionProjection &&
        mapCompositionPointThroughCamera(
          projectQuickEditPoint(transitionProjection, {
            x: edited.transform.x + edited.transform.width * 0.3,
            y: edited.transform.y + edited.transform.height * 0.3,
          })!,
          transitionCamera!
        );
      if (sourceTransitionPair) expect(transitionPoint).toBeTruthy();
      const output = await encodedNativeVideoSamples(
        page,
        host.origin,
        final,
        format,
        selectedOnly
          ? [
              ...(greenPoint
                ? [
                    {
                      time: 2,
                      x: Math.round(greenPoint.x),
                      y: Math.round(greenPoint.y),
                      expected: [32, 176, 96],
                    },
                  ]
                : []),
              ...(spatial
                ? [
                    {
                      time: 0.35,
                      x: Math.round(final.width / 2),
                      y: Math.round(final.height / 2),
                      expected: [224, 32, 176],
                    },
                  ]
                : []),
              {
                time: 1,
                x: Math.round(edited.transform.x + edited.transform.width / 2),
                y: Math.round(edited.transform.y + edited.transform.height / 2),
                expected: [224, 32, 176],
              },
              { time: 2, x: Math.round(final.width / 2), y: 2, expected: [0, 0, 0] },
            ]
          : [
              ...(sourceTransitionTime !== null && transitionPoint
                ? [
                    {
                      time: sourceTransitionTime,
                      x: Math.round(transitionPoint.x),
                      y: Math.round(transitionPoint.y),
                      expected: [224, 32, 176],
                    },
                  ]
                : []),
              ...(sourceTransitionTime !== null && !spatial && spotlightEffect === 'dim'
                ? [
                    {
                      time: sourceTransitionTime,
                      x: Math.round(final.width / 2),
                      y: 2,
                      expected: [0, 0, 0],
                    },
                  ]
                : []),
              ...(checksBackdrop
                ? [0.6, 2].flatMap((time) =>
                    Array.from({ length: 16 }, (_, index) => ({
                      time,
                      x: 9 + index * 2,
                      y: 11,
                      expected: [0, 0, 0],
                    }))
                  )
                : []),
              ...(spotlight
                ? [
                    {
                      time: 0.6,
                      x: Math.round(spotlightPoint!.x),
                      y: Math.round(spotlightPoint!.y),
                      expected: [224, 32, 176],
                    },
                    { time: 6.6, x: 30, y: 30, expected: [224, 32, 176] },
                    ...(!spatial && spotlightEffect === 'dim'
                      ? [
                          { time: 0.6, x: Math.round(final.width / 2), y: 2, expected: [0, 0, 0] },
                          { time: 2, x: Math.round(final.width / 2), y: 2, expected: [0, 0, 0] },
                        ]
                      : []),
                  ]
                : []),
              ...(greenPoint
                ? [
                    {
                      time: 2,
                      x: Math.round(greenPoint.x),
                      y: Math.round(greenPoint.y),
                      expected: [32, 176, 96],
                    },
                  ]
                : []),
              ...(spatial
                ? [
                    {
                      time: 0.6,
                      x: Math.round(final.width / 2),
                      y: Math.round(final.height / 2),
                      expected: [224, 32, 176],
                    },
                  ]
                : []),
              { time: 0.2, x: dormantPoint.x, y: dormantPoint.y, expected: [224, 32, 176] },
              {
                time: 2,
                x: Math.round(reopenedPoint.x),
                y: Math.round(reopenedPoint.y),
                expected: [224, 32, 176],
              },
              {
                time: 7,
                x: Math.round(viewport.transform.x + viewport.transform.width / 2),
                y: Math.round(viewport.transform.y + viewport.transform.height / 2),
                expected: [224, 32, 176],
              },
            ],
        undefined,
        start.input,
        selectedOnly ? start.settings : undefined
      );
      expect(output.size).toBeGreaterThan(0);
      for (const sample of output.samples) {
        if (sample.time === sourceTransitionTime && sample.y !== 2) continue;
        if (checksBackdrop && sample.y === 11) continue;
        if (spotlight && sample.y === 2 && sample.x === Math.round(final.width / 2)) continue;
        if (!selectedOnly && sample.time === 0.2)
          expect(sample.error, JSON.stringify(sample)).toBeGreaterThan(32);
        else expect(sample.error, JSON.stringify(sample)).toBeLessThanOrEqual(12);
      }
      let unmaskedTransitionHeader: number | null = null;
      if (sourceTransitionTime !== null && transitionPoint) {
        const actual = output.samples.find(
          (sample) => sample.time === sourceTransitionTime && sample.y !== 2
        )!;
        const reference = structuredClone(final);
        const instance = reference.effectInstances!.find(
          (item) => edited.type === 'EFFECT' && item.id === edited.effectInstanceId
        )!;
        instance.enabled = false;
        const backgroundOnly = await encodedNativeVideoSamples(
          page,
          host.origin,
          reference,
          format,
          [
            {
              time: actual.mediaTime,
              x: Math.round(transitionPoint.x),
              y: Math.round(transitionPoint.y),
              expected: [0, 0, 0],
            },
          ],
          { start: 0, end: Math.max(0.6, actual.mediaTime + 0.05) }
        );
        const background = backgroundOnly.samples[0]!;
        expect(Math.abs(background.mediaTime - actual.mediaTime)).toBeLessThanOrEqual(0.000001);
        const appearance = resolveVideoCompositionFrame(final, actual.mediaTime).visualLayers.find(
          (layer) => layer.clipId === edited.id
        );
        if (appearance?.kind !== 'effect' || !appearance.sourceAttachment)
          throw new Error('Missing transition attachment.');
        const alpha = appearance.opacity * appearance.sourceAttachment.owner.opacity;
        expect(alpha).toBeGreaterThan(0);
        expect(alpha).toBeLessThan(1);
        const expected = [224, 32, 176].map(
          (color, channel) => color * alpha + background.pixel[channel]! * (1 - alpha)
        );
        const error =
          expected.reduce(
            (sum, color, channel) => sum + Math.abs(actual.pixel[channel]! - color),
            0
          ) / 3;
        await writeFile(
          info.outputPath('encoded-source-transition-opacity.json'),
          JSON.stringify(
            {
              alpha,
              expected,
              actual,
              background,
              error,
            },
            null,
            2
          )
        );
        expect(error).toBeLessThanOrEqual(12);
        if (!spatial && spotlightEffect === 'dim') {
          const unmasked = structuredClone(reference);
          unmasked.motionRegions = unmasked.motionRegions!.map((region) =>
            region.spotlight
              ? { ...region, spotlight: { ...region.spotlight, strength: 0 } }
              : region
          );
          const control = await encodedNativeVideoSamples(
            page,
            host.origin,
            unmasked,
            format,
            [{ time: actual.mediaTime, x: Math.round(final.width / 2), y: 2, expected: [0, 0, 0] }],
            { start: 0, end: Math.max(0.6, actual.mediaTime + 0.05) }
          );
          expect(Math.abs(control.samples[0]!.mediaTime - actual.mediaTime)).toBeLessThanOrEqual(
            0.000001
          );
          unmaskedTransitionHeader = control.samples[0]!.pixel.slice(0, 3).reduce(
            (sum, channel) => sum + channel,
            0
          );
          await writeFile(
            info.outputPath('encoded-source-transition-unmasked.json'),
            JSON.stringify(control, null, 2)
          );
        }
      }
      if (spotlight && !spatial && spotlightEffect === 'dim') {
        const header = output.samples.filter(
          (sample) => sample.y === 2 && sample.x === Math.round(final.width / 2)
        );
        const brightness = (time: number) =>
          header
            .find((sample) => sample.time === time)!
            .pixel.slice(0, 3)
            .reduce((sum, channel) => sum + channel, 0);
        expect(brightness(2)).toBeGreaterThan(90);
        expect(brightness(0.6)).toBeLessThan(brightness(2) * 0.65);
        if (sourceTransitionTime !== null) {
          const strength = final.motionRegions!.find((region) => region.spotlight)!.spotlight!
            .strength;
          expect(unmaskedTransitionHeader).toBeGreaterThan(90);
          const ratio = brightness(sourceTransitionTime) / unmaskedTransitionHeader!;
          await writeFile(
            info.outputPath('encoded-source-transition-dim.json'),
            JSON.stringify(
              {
                time: sourceTransitionTime,
                strength,
                ratio,
                expected: 1 - strength,
                header,
              },
              null,
              2
            )
          );
          // A single authored mask must not compound when its source is split into a crossfade.
          // The bound allows codec rounding on an otherwise unchanged, static window header.
          expect(Math.abs(ratio - (1 - strength))).toBeLessThanOrEqual(0.08);
        }
        expect(
          final.motionRegions
            ?.filter((region) => region.spotlight)
            .every((region) => region.spotlightTarget === 'source-scene')
        ).toBe(true);
      }
      if (checksBackdrop) {
        const contrast = (time: number) => {
          const luma = output.samples
            .filter((sample) => sample.time === time && sample.y === 11)
            .map((sample) => sample.pixel.slice(0, 3).reduce((sum, value) => sum + value, 0) / 3);
          expect(luma).toHaveLength(16);
          return Math.max(...luma) - Math.min(...luma);
        };
        const sharp = contrast(2),
          blurred = contrast(0.6);
        await writeFile(
          info.outputPath('encoded-backdrop-contrast.json'),
          JSON.stringify(
            {
              sharp,
              blurred,
              background: final.sceneBackground,
              sources: final.clips
                .filter((clip) => native.clips.some((source) => source.id === clip.id))
                .map((clip) => ({ id: clip.id, transform: clip.transform })),
              samples: output.samples.filter((sample) => sample.y === 11),
            },
            null,
            2
          )
        );
        expect(sharp).toBeGreaterThan(100);
        expect(blurred).toBeLessThan(sharp * 0.35);
      }
      const expectedDuration = selectedOnly
        ? (start.settings.rangeEndSeconds ?? final.duration) -
          (start.settings.rangeStartSeconds ?? 0)
        : final.duration;
      expect(Math.abs(output.duration - expectedDuration)).toBeLessThanOrEqual(0.1);
      if (selectedOnly) expect(output.audioTrackCount).toBe(0);
      expect(await readNativeVideoProject(page)).toEqual(final);
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
