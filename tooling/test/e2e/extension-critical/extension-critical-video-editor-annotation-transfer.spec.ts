import { windowHeaderGeometry } from '@sniptale/runtime-contracts/window-header';
import { syntheticSpeechWav } from '../support/voiceover-speech-fixture';
import { reviewSpeechTextSignature } from '../../../../apps/extension/src/features/video/review/speech-transcript';
import { inspectVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';
import { resolveVideoCompositionRenderPasses } from '../../../../apps/extension/src/features/video/composition/timeline/render';
import { resolveEffectRuntimeFramePlans } from '../../../../apps/extension/src/features/video/composition/effect-runtime/frame/plan';
import { presentationMainHoldTime } from '../../../../apps/extension/src/features/video/review/presentation-sequence';
import { buildReviewTimeMap } from '../../../../apps/extension/src/features/video/review/timeline';
import {
  planReviewPresentationSequence,
  presentationAudioGain,
} from '../../../../apps/extension/src/features/video/review/presentation-sequence';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
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
import { expect, test, type Page, type Locator } from '@playwright/test';
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
import {
  readNativeReviewWorkspace,
  replaceNativeReviewWorkspace,
} from '../support/native-review-workspace';
import { readNativeVideoProject } from '../support/native-video-project';
import {
  encodedNativeVideoSamples,
  readEncodedAudioWindows,
} from '../support/native-video-export-proof';
import {
  checkInspectorLabels,
  checkInspectorPaintedFont,
  chooseInspectorValue,
} from '../support/inspector-utilities';

async function drawAnnotation(page: Page, start: number, end: number) {
  const lane = page.locator('[data-ui="gallery.videoReview.annotationEffectsLane"]');
  await lane.scrollIntoViewIfNeeded();
  const box = (await lane.boundingBox())!;
  await page.mouse.move(box.x + (box.width * start) / 12, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width * end) / 12, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function resourceAnnotationSource(title: string, clocked = false, spatialDetails = false) {
  const base = parseEffectV1Source(
    await readFile(
      'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-standalone.sniptale-effect.json',
      'utf8'
    )
  );
  if (!base.document) throw new Error('Missing EffectV1 fixture');
  const svgText =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#e020b0"/>' +
    (spatialDetails ? '<rect x="4" y="4" width="4" height="4" fill="#22d3ee"/>' : '') +
    '</svg>';
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
          x: clocked
            ? {
                op: 'mul',
                args: [{ op: 'read', path: 'progress' }, { op: 'read', path: 'width' }, 0.4],
              }
            : 0,
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
  return source;
}

type InspectorLabel = (key: Parameters<typeof translate>[0]) => string;
type NativeProject = NonNullable<Awaited<ReturnType<typeof readNativeVideoProject>>>;

const frozenVoiceText = {
  kind: 'microphone',
  textId: 'deleted-historical-phrase',
  revision: 2,
  timingRevision: 3,
  text: 'Frozen historical voice words. Привет, мир!',
  start: 1,
  end: 3,
  timeDomain: 'result',
} as const;

async function prepareResultVoiceGalleryFixture(
  page: Page,
  dialog: Locator,
  origin: string,
  theme: string,
  aggregate: string,
  label: InspectorLabel,
  outputPath: (name: string) => string
) {
  await expect(dialog.locator('[data-ui="autosave-control"] button').first()).toHaveAttribute(
    'aria-label',
    `${label('editor.documentActions.autosaveTitle')}: ${label('common.states.saved')}`
  );
  await page.goto(`${origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
  const stored = (await readNativeReviewWorkspace(page, aggregate))!;
  const document = replayReviewHistory(
    stored.history,
    stored.cursor,
    stored.source,
    reviewDocumentBaseline(stored)
  );
  const takeBytes = syntheticSpeechWav(5, 220);
  // The source interval of the passive replacement is silent in the accepted take.
  takeBytes.fill(0, 44 + 16000 * 2, 44 + 1.5 * 16000 * 2);
  await page.evaluate(
    async (resources) => {
      const objects = await (
        await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
      ).getDirectoryHandle('objects');
      for (const resource of resources) {
        const bytes = Uint8Array.from(atob(resource.body), (value) => value.charCodeAt(0));
        const writer = await (
          await objects.getFileHandle(resource.id, { create: true })
        ).createWritable();
        await writer.write(bytes);
        await writer.close();
      }
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(['project_assets', 'asset_refs', 'asset_owners'], 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      for (const resource of resources) {
        const size = atob(resource.body).length;
        tx.objectStore('project_assets').put({
          id: resource.id,
          assetId: resource.id,
          mimeType: 'audio/wav',
          size,
          createdAt: 1,
        });
        tx.objectStore('asset_refs').put({
          assetId: resource.id,
          mimeType: 'audio/wav',
          size,
          createdAt: 1,
          sha256: null,
          location: { kind: 'opfs', objectKey: `objects/${resource.id}` },
        });
        tx.objectStore('asset_owners').put({
          assetId: resource.id,
          ownerKind: 'project-asset',
          ownerId: resource.id,
          role: 'body',
        });
      }
      await done;
      db.close();
    },
    [
      { id: 'result-voice-take', body: takeBytes.toString('base64') },
      { id: 'result-voice-passive', body: syntheticSpeechWav(0.5, 880).toString('base64') },
    ]
  );
  const profile = {
    modelId: 'legacy-result-model',
    voiceId: 'voice',
    responseFormat: 'wav' as const,
  };
  document.advancedContent.audio.original = { muted: true, volume: 1 };
  document.advancedContent.audio.voiceover = [
    {
      id: 'result-voice',
      assetId: 'project-asset:result-voice-take',
      timelineStart: 1,
      sourceOffset: 0.5,
      duration: 4,
      tempo: 0.5,
      volume: 0.8,
      muted: false,
      fadeIn: 0.1,
      fadeOut: 0.2,
      textSnapshot: frozenVoiceText,
      transcript: {
        version: 1,
        phrases: [
          {
            id: 'legacy-result-phrase',
            start: 1,
            end: 1.5,
            originalText: 'Recorded words',
            text: 'Passive replacement words',
            revision: 2,
            alignment: 'manual',
          },
        ],
        replacements: [
          {
            id: 'legacy-result-replacement',
            phraseId: 'legacy-result-phrase',
            start: 1,
            end: 1.5,
            duration: 0.5,
            assetId: 'project-asset:result-voice-passive',
            revision: 2,
            text: 'Passive replacement words',
            textSignature: reviewSpeechTextSignature('Passive replacement words', profile),
            profile,
          },
        ],
      },
    },
  ];
  document.advancedContent.text = {
    version: 1,
    fragments: [
      {
        id: 'current-result-phrase',
        start: 1,
        end: 3,
        timeDomain: 'result',
        originalText: 'Current editable words',
        text: 'Current editable words',
        revision: 1,
        timingRevision: 1,
        alignment: 'manual',
        showInVideo: false,
      },
    ],
  };
  const inspected = inspectVideoWorkspace({
    ...stored,
    formatVersion: stored.project ? 4 : 2,
    baseline: document,
    history: [],
    cursor: 0,
    revision: stored.revision + 1,
    updatedAt: Date.now(),
    advanced: { ...document.advancedContent, ui: stored.advanced.ui },
  });
  if (!inspected.workspace)
    throw new Error(`Invalid result voice Gallery workspace: ${JSON.stringify(inspected.failure)}`);
  await replaceNativeReviewWorkspace(page, aggregate, inspected.workspace);
  await writeFile(outputPath('result-voice-gallery.json'), JSON.stringify(inspected.workspace));
  await page.goto(
    `${origin}${GALLERY_HARNESS_PATH}?recordingId=beta-v1-recording&mode=edit&theme=${theme}`
  );
  await expect(dialog).toBeVisible();
}

async function checkTransferredResultVoiceEditing(
  page: Page,
  native: NativeProject,
  label: InspectorLabel,
  outputPath: (name: string) => string
) {
  const resultTake = native.clips.find((clip) => clip.type === 'AUDIO' && clip.textSnapshot);
  const canonicalResultTake = resultTake
    ? hydrateVideoProject(native).clips.find((clip) => clip.id === resultTake.id)
    : undefined;
  if (resultTake?.type !== 'AUDIO') throw new Error('Missing transferred result take');
  expect(native.version).toBe(44);
  expect(resultTake).toMatchObject({
    startTime: 1,
    sourceStart: 0.5,
    sourceDuration: 4,
    duration: 8,
    playbackRate: 0.5,
    linkMode: 'DETACHED',
    volume: 0.8,
    muted: false,
    fadeInMs: 200,
    fadeOutMs: 400,
    textSnapshot: { binding: { kind: 'project' }, text: frozenVoiceText },
  });
  expect(resultTake.textSnapshot?.basisHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect('sourceRange' in resultTake).toBe(false);
  expect(native.sourceVoiceoverDocuments).toBeUndefined();
  const passive = native.assets.find(
    (item) =>
      item.source.kind === 'project-asset' && item.source.projectAssetId === 'result-voice-passive'
  );
  expect(passive?.type).toBe('AUDIO');
  expect(resultTake.transcript?.replacements[0]?.assetId).toBe(passive?.id);
  expect(native.clips.some((clip) => 'assetId' in clip && clip.assetId === passive?.id)).toBe(
    false
  );
  await page.locator(`[data-project-timeline-clip="${resultTake.id}"]`).click();
  const audio = page.getByRole('button', {
    name: label('videoEditor.sidebar.inspectorGroupAudio'),
    exact: true,
  });
  if ((await audio.getAttribute('aria-expanded')) === 'false') await audio.click();
  const volume = page.getByRole('textbox', {
    name: label('videoEditor.sidebar.volumeLabel'),
    exact: true,
  });
  await expect(volume).toBeVisible();
  await expect(volume).toHaveValue('80');
  await checkInspectorPaintedFont(page, volume, 'result-voice-volume');
  await page.screenshot({
    path: outputPath('result-voice-audio-inspector.png'),
    fullPage: false,
  });
  await page
    .getByRole('button', {
      name: label('videoEditor.sidebar.sceneProperties'),
      exact: true,
    })
    .click();
  await page
    .getByRole('button', {
      name: label('videoEditor.sidebar.textDocuments'),
      exact: true,
    })
    .click();
  const textPanel = page.locator('[data-ui="video-editor.text.panel"]');
  const phrase = textPanel.locator('[data-text-id="current-result-phrase"]');
  await expect(phrase).toContainText('Current editable words');
  const editor = phrase.getByRole('textbox', {
    name: label('gallery.videoReview.speechText'),
    exact: true,
  });
  if (!(await editor.isVisible())) await phrase.locator('button[aria-expanded]').click();
  await checkInspectorPaintedFont(page, editor, 'input');
  await editor.fill('Edited current words after transfer');
  await editor.press('Tab');
  await expect
    .poll(
      async () =>
        (await readNativeVideoProject(page))?.textDocuments
          ?.flatMap((entry) => entry.document.fragments)
          .find((fragment) => fragment.id === 'current-result-phrase')?.text
    )
    .toBe('Edited current words after transfer');
  expect(
    (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === resultTake.id)
  ).toEqual(canonicalResultTake);
  await page.screenshot({
    path: outputPath('result-voice-current-text-edited.png'),
    fullPage: false,
  });
  await phrase
    .getByRole('button', {
      name: label('gallery.videoReview.textFragmentDelete'),
      exact: true,
    })
    .click();
  await expect
    .poll(
      async () =>
        (await readNativeVideoProject(page))?.textDocuments
          ?.flatMap((entry) => entry.document.fragments)
          .some((fragment) => fragment.id === 'current-result-phrase') ?? false
    )
    .toBe(false);
  expect(
    (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === resultTake.id)
  ).toEqual(canonicalResultTake);
  await page.screenshot({
    path: outputPath('result-voice-current-text-deleted.png'),
    fullPage: false,
  });
}

async function configureGallerySpatialDetails(page: Page, dialog: Locator, label: InspectorLabel) {
  await dialog
    .locator('[data-ui="gallery.videoReview.spatialTools"]')
    .getByRole('button', { name: label('gallery.videoReview.spatialToolFocus'), exact: true })
    .click();
  for (const [key, value] of [
    ['gallery.videoReview.depthStrength', '55'],
    ['gallery.videoReview.depthSoftness', '35'],
  ] as const) {
    const input = dialog.getByRole('textbox', { name: label(key), exact: true });
    await input.fill(value);
    await input.press('Enter');
  }
  for (const phase of ['enter', 'exit'] as const) {
    const blur = dialog.locator(
      `[data-ui="gallery.videoReview.motionBlurSettings"][data-phase="${phase}"]`
    );
    if (!(await blur.isVisible()))
      await dialog
        .getByRole('heading', {
          name: label('videoEditor.sidebar.inspectorGroupAnimation'),
          exact: true,
        })
        .click();
    await blur
      .getByRole('switch', { name: label('gallery.videoReview.motionBlur'), exact: true })
      .click();
    const strength = blur.getByRole('textbox', {
      name: label('gallery.videoReview.motionBlurStrength'),
      exact: true,
    });
    await strength.fill('65');
    await strength.press('Enter');
    await checkInspectorPaintedFont(page, strength, `gallery-resource-motion-blur-${phase}`);
  }
}

async function checkTransferredSpatialDetails(
  page: Page,
  native: NativeProject,
  label: InspectorLabel,
  outputPath: (name: string) => string
) {
  await writeFile(outputPath('native-resource-spatial-intake.json'), JSON.stringify(native));
  const region = native.motionRegions?.find(
    (entry) => entry.depthOfField?.enabled && entry.duration > 0.1
  );
  if (!region) throw new Error('Missing transferred spatial focus');
  expect(region.depthOfField).toMatchObject({
    enabled: true,
    mode: 'depth',
    strength: 0.55,
    softness: 0.35,
  });
  expect(region.motionBlur?.enter).toEqual({ enabled: true, strength: 0.65 });
  const accepted = async () =>
    (await readNativeVideoProject(page))!.motionRegions!.find((entry) => entry.id === region.id)!;
  await page.locator(`[data-timeline-effect-segment="${region.id}"] button[title]`).click();
  await page
    .locator('[data-ui="video-editor.inspector.categories"] > nav')
    .getByRole('button', { name: label('gallery.videoReview.depthOfField'), exact: true })
    .click();
  const depth = page.locator('[data-ui="video-editor.motion.depth"]');
  await chooseInspectorValue(
    page,
    depth,
    label('gallery.videoReview.depthMode'),
    label('gallery.videoReview.depthModeArea')
  );
  const strength = depth.getByRole('textbox', {
    name: label('gallery.videoReview.depthStrength'),
    exact: true,
  });
  await expect(strength).toHaveValue('55');
  await strength.fill('60');
  await strength.press('Enter');
  await expect
    .poll(async () => (await accepted()).depthOfField)
    .toMatchObject({ enabled: true, mode: 'area', strength: 0.6 });
  await checkInspectorPaintedFont(page, strength, 'native-resource-depth');
  await page.screenshot({ path: outputPath('native-resource-depth.png'), fullPage: false });
  const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
  await playhead.press('Home');
  for (let frame = 0; frame < 18; frame++) await playhead.press('ArrowRight');
  const pixels = () =>
    page.locator('[data-preview-stage-canvas]').evaluate(async (canvas: HTMLCanvasElement) => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      const bytes = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(
        ''
      );
    });
  let previous: string | undefined;
  let stableFrames = 0;
  await expect
    .poll(async () => {
      const current = await pixels();
      stableFrames = current === previous ? stableFrames + 1 : 0;
      previous = current;
      return stableFrames;
    })
    .toBeGreaterThanOrEqual(2);
  const saveCanvas = async (name: string) => {
    const url = await page
      .locator('[data-preview-stage-canvas]')
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await writeFile(outputPath(name), Buffer.from(url.split(',')[1]!, 'base64'));
  };
  const focused = await pixels();
  await saveCanvas('resource-depth-enabled.png');
  const enabled = depth.getByRole('switch', {
    name: label('gallery.videoReview.spatialEnabled'),
    exact: true,
  });
  await enabled.click();
  await expect.poll(async () => (await accepted()).depthOfField?.enabled).toBe(false);
  await expect.poll(pixels).not.toBe(focused);
  await saveCanvas('resource-depth-disabled.png');
  await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
  await expect.poll(async () => (await accepted()).depthOfField?.enabled).toBe(true);
  await saveCanvas('resource-depth-restored.png');
  await expect.poll(pixels).toBe(focused);
  await page
    .locator('[data-ui="video-editor.inspector.categories"] > nav')
    .getByRole('button', {
      name: label('videoEditor.sidebar.inspectorGroupAnimation'),
      exact: true,
    })
    .click();
  const exit = page.locator('[data-ui="video-editor.motion.blur"][data-phase="exit"]');
  const exitStrength = exit.getByRole('textbox', {
    name: label('gallery.videoReview.motionBlurStrength'),
    exact: true,
  });
  await expect(exitStrength).toHaveValue('65');
  await exitStrength.fill('75');
  await exitStrength.press('Enter');
  await expect
    .poll(async () => (await accepted()).motionBlur?.exit)
    .toEqual({ enabled: true, strength: 0.75 });
  await checkInspectorPaintedFont(page, exitStrength, 'native-resource-motion-exit');
  await page.screenshot({ path: outputPath('native-resource-motion-exit.png'), fullPage: false });
  const blurRegion = native.motionRegions?.find(
    (entry) => entry.motionBlur?.enter?.enabled && entry.duration > 0
  );
  if (!blurRegion) throw new Error('Missing visible retained blur phase');
  const zoom = page.getByRole('slider', { name: label('videoEditor.timeline.zoom'), exact: true });
  const originalZoom = Number(await zoom.inputValue());
  await zoom.press('End');
  await page.locator('[data-ui="video-editor.timeline.canvas-scroll"]').evaluate((node) => {
    node.scrollLeft = 0;
  });
  await page.locator(`[data-timeline-effect-segment="${blurRegion.id}"] button[title]`).click();
  await page
    .locator('[data-ui="video-editor.inspector.categories"] > nav')
    .getByRole('button', {
      name: label('videoEditor.sidebar.inspectorGroupAnimation'),
      exact: true,
    })
    .click();
  const blur = page.locator('[data-ui="video-editor.motion.blur"][data-phase="enter"]');
  const blurStrength = blur.getByRole('textbox', {
    name: label('gallery.videoReview.motionBlurStrength'),
    exact: true,
  });
  await expect(blurStrength).toHaveValue('65');
  await blurStrength.fill('75');
  await blurStrength.press('Enter');
  await expect
    .poll(
      async () =>
        (await readNativeVideoProject(page))!.motionRegions!.find(
          (entry) => entry.id === blurRegion.id
        )?.motionBlur?.enter
    )
    .toEqual({ enabled: true, strength: 0.75 });
  await checkInspectorPaintedFont(page, blurStrength, 'native-resource-motion-blur');
  await page.screenshot({ path: outputPath('native-resource-motion-blur.png'), fullPage: false });
  await zoom.press('Home');
  for (let pageStep = 0; pageStep < Math.floor(originalZoom / 10); pageStep++)
    await zoom.press('PageUp');
  const steps = Math.round((originalZoom - Number(await zoom.inputValue())) * 10);
  for (let step = 0; step < Math.abs(steps); step++)
    await zoom.press(steps < 0 ? 'ArrowLeft' : 'ArrowRight');
  expect(Number(await zoom.inputValue())).toBeCloseTo(originalZoom, 1);
  return { depthRegionId: region.id, blurRegionId: blurRegion.id };
}

async function checkTransferredRotatedArea(args: {
  page: Page;
  origin: string;
  theme: string;
  project: NativeProject;
  regionId: string;
  format: 'WEBM' | 'MP4';
  label: InspectorLabel;
  outputPath: (name: string) => string;
}) {
  const { page, project, label, outputPath } = args;
  await page.goto(
    `${args.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${encodeURIComponent(project.id)}&theme=${args.theme}`
  );
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  const initial = project.motionRegions!.find((region) => region.id === args.regionId)!;
  const video = project.clips.find((clip) => clip.id === initial.sourceBinding?.clipId);
  if (video?.type !== 'VIDEO') throw new Error('Missing transferred camera owner');
  const accepted = async () => (await readNativeVideoProject(page, project.id))!;
  const region = async () =>
    (await accepted()).motionRegions!.find((entry) => entry.id === args.regionId)!;
  await page.locator('[data-ui="video-editor.timeline.toolbar.fit-project"]').click();
  await page.locator(`[data-project-timeline-clip="${video.id}"]`).click();
  const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
  await playhead.press('Home');
  for (let frame = 0; frame < 18; frame++) await playhead.press('ArrowRight');
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
  await rotation.fill('30');
  await rotation.press('Enter');
  await expect
    .poll(
      async () => (await accepted()).clips.find((clip) => clip.id === video.id)?.transform.rotation
    )
    .toBe(30);
  await page.locator(`[data-timeline-effect-segment="${args.regionId}"] button[title]`).click();
  await page
    .locator('[data-ui="video-editor.inspector.categories"] > nav')
    .getByRole('button', { name: label('videoEditor.sidebar.inspectorGroupFraming'), exact: true })
    .click();
  const inspector = page.locator('[data-ui="video-editor.inspector.categories"]');
  await chooseInspectorValue(
    page,
    inspector,
    label('videoEditor.sidebar.motionFocusLabel'),
    label('videoEditor.sidebar.motionFocusManualArea')
  );
  await expect.poll(async () => (await region()).focusArea).toBeTruthy();
  const sourceArea = (await region()).focusArea!;
  await chooseInspectorValue(
    page,
    inspector,
    label('videoEditor.sidebar.motionCoverage'),
    label('videoEditor.sidebar.spotlightCoverageScene')
  );
  await expect
    .poll(async () => (await region()).sourceBinding?.coordinateSpace)
    .not.toBe('source-window');
  const rebased = await accepted();
  await writeFile(
    outputPath('native-resource-area-rebase.json'),
    JSON.stringify({ sourceArea, video, rebased })
  );
  const transform = rebased.clips.find((clip) => clip.id === video.id)!.transform;
  const source = rebased.assets.find((asset) => asset.id === video.assetId);
  const sourceWidth = source?.metadata.width;
  const sourceHeight = source?.metadata.height;
  if (!sourceWidth || !sourceHeight || !video.sourceCrop || !video.windowHeader)
    throw new Error('Missing cropped decorated source fixture');
  const crop = video.sourceCrop;
  const header = windowHeaderGeometry(video.windowHeader, {
    width: sourceWidth,
    height: sourceHeight,
  });
  const visibleBodyHeight =
    (transform.width * (sourceHeight * crop.height)) / (sourceWidth * crop.width);
  const snappedHeader = 2 * Math.ceil((header.height * transform.width) / sourceWidth / 2 - 1e-12);
  expect(visibleBodyHeight + snappedHeader).toBeCloseTo(transform.height, 6);
  const originalWidth = transform.width / crop.width;
  const originalBodyHeight = visibleBodyHeight / crop.height;
  const originalHeader = (header.height * originalWidth) / sourceWidth;
  const originalWindow = {
    x: transform.x - crop.x * originalWidth,
    y: transform.y + snappedHeader - crop.y * originalBodyHeight - originalHeader,
    width: originalWidth,
    height: originalBodyHeight + originalHeader,
  };
  const c = Math.cos(Math.PI / 6),
    sine = Math.sin(Math.PI / 6);
  const turn = (x: number, y: number) => {
    const dx =
      originalWindow.x +
      (x / project.width) * originalWindow.width -
      (transform.x + transform.width / 2);
    const dy =
      originalWindow.y +
      (y / project.height) * originalWindow.height -
      (transform.y + transform.height / 2);
    return {
      x: transform.x + transform.width / 2 + dx * c - dy * sine,
      y: transform.y + transform.height / 2 + dx * sine + dy * c,
    };
  };
  const axes = sourceArea.axes ?? { x: { x: 1, y: 0 }, y: { x: 0, y: 1 } };
  const origin = turn(sourceArea.x, sourceArea.y);
  const xEnd = turn(
    sourceArea.x + sourceArea.width * axes.x.x,
    sourceArea.y + sourceArea.width * axes.x.y
  );
  const yEnd = turn(
    sourceArea.x + sourceArea.height * axes.y.x,
    sourceArea.y + sourceArea.height * axes.y.y
  );
  const oldWidth = Math.hypot(xEnd.x - origin.x, xEnd.y - origin.y);
  const oldHeight = Math.hypot(yEnd.x - origin.x, yEnd.y - origin.y);
  const unitX = { x: (xEnd.x - origin.x) / oldWidth, y: (xEnd.y - origin.y) / oldWidth };
  const unitY = { x: (yEnd.x - origin.x) / oldHeight, y: (yEnd.y - origin.y) / oldHeight };
  const checkArea = (candidate: NativeProject, width: number) => {
    const area = candidate.motionRegions!.find((entry) => entry.id === args.regionId)!.focusArea!;
    expect(area.axes).toBeDefined();
    expect(area.width).toBeCloseTo(width, 6);
    expect(area.height).toBeCloseTo(oldHeight, 6);
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      expect(
        area.x + u! * area.width * area.axes!.x.x + v! * area.height * area.axes!.y.x
      ).toBeCloseTo(origin.x + u! * width * unitX.x + v! * oldHeight * unitY.x, 6);
      expect(
        area.y + u! * area.width * area.axes!.x.y + v! * area.height * area.axes!.y.y
      ).toBeCloseTo(origin.y + u! * width * unitX.y + v! * oldHeight * unitY.y, 6);
    }
  };
  checkArea(rebased, oldWidth);
  const exact = inspector.locator('[data-ui="video-editor.inspector.disclosure"]').filter({
    has: page.getByRole('heading', {
      name: label('videoEditor.sidebar.inspectorExactPlacement'),
      exact: true,
    }),
  });
  if (!(await exact.evaluate((node: HTMLDetailsElement) => node.open)))
    await exact.locator('summary').click();
  const width = inspector.getByRole('textbox', {
    name: label('videoEditor.sidebar.motionAreaWidthLabel'),
    exact: true,
  });
  const editedWidth = Math.round(oldWidth * 0.9);
  await width.fill(String(editedWidth));
  await width.press('Tab');
  await expect.poll(async () => (await region()).focusArea?.width).toBeCloseTo(editedWidth, 6);
  await checkInspectorPaintedFont(page, width, 'native-resource-rotated-area');
  const authored = await accepted();
  checkArea(authored, editedWidth);
  await page.screenshot({ path: outputPath('native-resource-rotated-area.png'), fullPage: false });
  await page.reload();
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  const restored = await accepted();
  expect(restored).toEqual(authored);
  checkArea(restored, editedWidth);
  expect(restored.assets).toEqual(project.assets);
  expect(restored.effectSnapshots).toEqual(project.effectSnapshots);
  expect(restored.effectInstances).toEqual(project.effectInstances);
  expect(restored.transitions).toEqual(project.transitions);
  expect(
    restored.clips
      .filter((clip) => clip.id !== video.id)
      .map((clip) => ({ ...clip, timelineLaneId: clip.timelineLaneId ?? null }))
  ).toEqual(
    project.clips
      .filter((clip) => clip.id !== video.id)
      .map((clip) => ({ ...clip, timelineLaneId: clip.timelineLaneId ?? null }))
  );
  for (const asset of restored.effectSnapshots?.flatMap((snapshot) => snapshot.assets) ?? []) {
    expect(
      createHash('sha256')
        .update(new Uint8Array(await asset.blob.arrayBuffer()))
        .digest('hex')
    ).toBe(asset.sha256);
  }
  const host = restored.clips.find(
    (clip) =>
      clip.type === 'EFFECT' && clip.attachment?.kind === 'source' && !clip.sourceRange?.dormant
  )!;
  const point = (time: number, x = 0.5, y = 0.5) => {
    const camera = resolveVideoCompositionFrame(restored, time).camera;
    const projection = resolveEffectSourceProjection(restored, host, camera, time);
    if (!projection) throw new Error('Missing restored resource projection');
    const projected = projectQuickEditPoint(projection, {
      x: host.transform.x + host.transform.width * x,
      y: host.transform.y + host.transform.height * y,
    });
    const result = projected && mapCompositionPointThroughCamera(projected, camera);
    if (!result) throw new Error('Missing restored resource landmark');
    return result;
  };
  const samples = [0.6, 2].map((time) => ({
    time,
    x: Math.round(point(time).x),
    y: Math.round(point(time).y),
    expected: [224, 32, 176],
  }));
  if (
    restored.effectInstances?.some(
      (instance) =>
        instance.kind === 'targetEffect' &&
        instance.target.kind === 'clip' &&
        instance.target.clipId === host.id
    )
  ) {
    const green = point(2, 0.7, 0.65);
    samples.push({
      time: 2,
      x: Math.round(green.x),
      y: Math.round(green.y),
      expected: [32, 176, 96],
    });
  }
  const output = await encodedNativeVideoSamples(page, args.origin, restored, args.format, samples);
  for (const sample of output.samples)
    expect(sample.error, JSON.stringify(sample)).toBeLessThanOrEqual(12);
  await writeFile(
    outputPath('native-resource-rotated-area-encoded.json'),
    JSON.stringify({ sourceArea, editedWidth, restored, output })
  );
}

const baseCase = {
  viewport: PRIMARY_BROWSER_VIEWPORTS[0]!,
  format: 'WEBM',
  locale: 'en',
  theme: 'light',
  crop: false,
  spatial: false,
  spatialDetails: false,
  selectedOnly: false,
  nativeFx: false,
  groupFx: false,
  spotlight: false,
  spotlightEffect: 'dim',
  galleryCut: 'none',
  bookends: false,
  activeIntro: false,
  fractionalVideo: false,
  fractionalMain: false,
  heldExposure: false,
  lateExposureEnd: false,
  emptyMedia: false,
  resultVoice: false,
} as const;

for (const {
  viewport,
  format,
  locale,
  theme,
  crop,
  spatial,
  spatialDetails,
  selectedOnly,
  nativeFx,
  groupFx,
  spotlight,
  spotlightEffect,
  galleryCut,
  bookends,
  activeIntro,
  fractionalVideo,
  fractionalMain,
  heldExposure,
  lateExposureEnd,
  emptyMedia,
  resultVoice,
} of [
  { ...baseCase, resultVoice: true },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
    resultVoice: true,
  },
  { ...baseCase, nativeFx: true },
  { ...baseCase, bookends: true, heldExposure: true, emptyMedia: true },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
    bookends: true,
    heldExposure: true,
    emptyMedia: true,
  },
  { ...baseCase, bookends: true, heldExposure: true },
  { ...baseCase, bookends: true, heldExposure: true, lateExposureEnd: true },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
    bookends: true,
    heldExposure: true,
    lateExposureEnd: true,
  },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
    bookends: true,
    heldExposure: true,
  },
  {
    ...baseCase,
    crop: true,
    nativeFx: true,
    galleryCut: 'dissolve',
    bookends: true,
    fractionalVideo: true,
    fractionalMain: true,
  },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
    crop: true,
    nativeFx: true,
    galleryCut: 'fade-black',
    bookends: true,
    fractionalVideo: true,
    fractionalMain: true,
  },
  {
    ...baseCase,
    crop: true,
    nativeFx: true,
    galleryCut: 'dissolve',
    bookends: true,
    fractionalVideo: true,
  },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
    crop: true,
    nativeFx: true,
    galleryCut: 'fade-black',
    bookends: true,
    fractionalVideo: true,
  },
  {
    ...baseCase,
    crop: true,
    nativeFx: true,
    galleryCut: 'dissolve',
    bookends: true,
    activeIntro: true,
  },
  { ...baseCase, crop: true, nativeFx: true, galleryCut: 'dissolve', bookends: true },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
    crop: true,
    nativeFx: true,
    galleryCut: 'fade-black',
    bookends: true,
  },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
    crop: true,
    nativeFx: true,
    galleryCut: 'fade-black',
    bookends: true,
    activeIntro: true,
  },
  {
    ...baseCase,
    viewport: PRIMARY_BROWSER_VIEWPORTS[1]!,
    format: 'MP4',
    locale: 'ru',
    theme: 'dark',
  },
  { ...baseCase, crop: true },
  { ...baseCase, crop: true, spatial: true, spatialDetails: true },
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
    spatialDetails: true,
    nativeFx: true,
    galleryCut: 'fade-black',
  },
] as const) {
  test(`resource-bearing Gallery annotations remain editable through Native montage reopen and real export ${viewport.name} ${format}${crop ? ' crop-header' : ''}${spatial ? ' 3D' : ''}${selectedOnly ? ' selected-only' : ''}${nativeFx ? ' native-FX' : ''}${groupFx ? ' group-FX' : ''}${spotlight ? ` spotlight-${spotlightEffect}` : ''}${galleryCut === 'none' ? '' : ` gallery-cut-${galleryCut}`}${bookends ? ' gallery-bookends' : ''}${activeIntro ? ' active-intro' : ''}${fractionalVideo ? ' fractional-video' : ''}${fractionalMain ? ' fractional-main' : ''}${heldExposure ? ' held-exposure' : ''}${lateExposureEnd ? ' late-end' : ''}${emptyMedia ? ' empty-media' : ''}${resultVoice ? ' result-voice' : ''}${spatialDetails ? ' spatial-details' : ''}`, async ({
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
    const outroFixture =
      activeIntro || fractionalVideo ? 'review-cut-vfr-audio.webm' : 'review-cut-vfr.webm';
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
      const source = await resourceAnnotationSource(title, heldExposure, spatialDetails);
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
        if (spatialDetails) await configureGallerySpatialDetails(page, dialog, label);
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
      if (bookends) {
        const fields = dialog.locator('[data-ui="gallery.videoReview.editRangeFields"]');
        for (const [field, value] of [
          ['gallery.videoReview.rangeStart', '0.03'],
          [
            'gallery.videoReview.rangeEnd',
            (sourceDuration - (fractionalMain ? 11.21 : 11.2) + 0.03).toFixed(6),
          ],
        ] as const) {
          const input = fields.getByRole('textbox', { name: label(field), exact: true });
          await input.fill(value);
          await input.press('Enter');
        }
        await button('gallery.videoReview.scene').click();
        const presentation = dialog.locator(
          '[data-ui="gallery.videoReview.presentationInspector"]'
        );
        const intro = presentation.locator(
          `section[aria-label="${label('gallery.videoReview.presentationIntro')}"]`
        );
        await intro
          .getByRole('button', {
            name: label('gallery.videoReview.presentationBookend'),
            exact: true,
          })
          .click();
        const image = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 16;
          const context = canvas.getContext('2d')!;
          context.fillStyle = '#ff0000';
          context.fillRect(0, 0, 32, 16);
          return canvas.toDataURL('image/png').split(',')[1]!;
        });
        const card = page.waitForEvent('filechooser');
        await intro
          .getByRole('button', {
            name: label('gallery.videoReview.presentationComputer'),
            exact: true,
          })
          .click();
        await (
          await card
        ).setFiles({
          name: 'retained-opening.png',
          mimeType: 'image/png',
          buffer: Buffer.from(image, 'base64'),
        });
        await expect(presentation).toHaveAttribute('aria-busy', 'false');
        if (activeIntro) {
          const duration = intro
            .locator('[data-ui="shared.ui.presentation-media-fields"]')
            .getByRole('textbox', {
              name: label('gallery.videoReview.presentationDuration'),
              exact: true,
            });
          await duration.fill('0.15');
          await duration.press('Enter');
          await chooseInspectorValue(
            page,
            intro,
            label('gallery.videoReview.presentationJoinIntro'),
            label(
              format === 'WEBM'
                ? 'gallery.videoReview.cutDissolve'
                : 'gallery.videoReview.cutFadeColor'
            )
          );
        } else if (!fractionalVideo) {
          await intro
            .getByRole('button', {
              name: label('gallery.videoReview.presentationNoEffect'),
              exact: true,
            })
            .click();
        }
        if (fractionalVideo) {
          const movie = page.waitForEvent('filechooser');
          await intro
            .getByRole('button', {
              name: label('gallery.videoReview.presentationComputer'),
              exact: true,
            })
            .click();
          await (await movie).setFiles(`tooling/test/e2e/fixtures/${outroFixture}`);
          await expect(presentation).toHaveAttribute('aria-busy', 'false');
          const trim = intro.getByRole('textbox', {
            name: label('gallery.videoReview.presentationTrimEnd'),
            exact: true,
          });
          if (!(await trim.isVisible()))
            await intro
              .locator('summary')
              .filter({ hasText: label('gallery.videoReview.presentationTrim') })
              .click();
          await trim.fill('0.15');
          await trim.press('Enter');
          await expect
            .poll(async () => {
              const workspace = (await readNativeReviewWorkspace(page, aggregate))!;
              return replayReviewHistory(
                workspace.history,
                workspace.cursor,
                workspace.source,
                reviewDocumentBaseline(workspace)
              ).advancedContent.presentation?.intro.video?.trim.end;
            })
            .toBe(0.15);
        }
        const outro = presentation.locator(
          `section[aria-label="${label('gallery.videoReview.presentationOutro')}"]`
        );
        if (activeIntro) {
          await outro
            .getByRole('button', {
              name: label('gallery.videoReview.presentationFadeOut'),
              exact: true,
            })
            .click();
          const plain = outro.locator('[data-ui="shared.ui.presentation-fade-fields"]');
          const duration = plain.getByRole('textbox', {
            name: label('gallery.videoReview.presentationDuration'),
            exact: true,
          });
          await duration.fill('0.7');
          await duration.press('Enter');
        }
        await outro
          .getByRole('button', {
            name: label('gallery.videoReview.presentationBookend'),
            exact: true,
          })
          .click();
        const movie = page.waitForEvent('filechooser');
        await outro
          .getByRole('button', {
            name: label('gallery.videoReview.presentationComputer'),
            exact: true,
          })
          .click();
        await (await movie).setFiles(`tooling/test/e2e/fixtures/${outroFixture}`);
        await expect(presentation).toHaveAttribute('aria-busy', 'false');
        const trim = outro.getByRole('textbox', {
          name: label('gallery.videoReview.presentationTrimEnd'),
          exact: true,
        });
        if (!(await trim.isVisible()))
          await outro
            .locator('summary')
            .filter({ hasText: label('gallery.videoReview.presentationTrim') })
            .click();
        await trim.fill('1');
        await trim.press('Enter');
        if (activeIntro) {
          const gain = outro.getByRole('textbox', {
            name: label('gallery.videoReview.presentationVolume'),
            exact: true,
          });
          await gain.fill('70');
          await gain.press('Enter');
        }
        await expect
          .poll(async () => {
            const workspace = (await readNativeReviewWorkspace(page, aggregate))!;
            const content = replayReviewHistory(
              workspace.history,
              workspace.cursor,
              workspace.source,
              reviewDocumentBaseline(workspace)
            ).advancedContent;
            return content.presentation?.outro.video?.trim.end;
          })
          .toBe(1);
        if (activeIntro) {
          const beforeCadenceTransfer = await readNativeReviewWorkspace(page, aggregate);
          await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
          await dialog.locator('[data-ui="gallery.videoReview.openVideoEditor"]').click();
          await expect
            .poll(
              async () =>
                (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
            )
            .toBe(1);
          const cadenceTab = (
            await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])
          )[0]!;
          const cadenceQuery = new URL(cadenceTab.url!).searchParams;
          cadenceQuery.set('theme', theme);
          const cadencePage = await page.context().newPage();
          try {
            await cadencePage.setViewportSize({ ...viewport.size });
            await cadencePage.emulateMedia({ colorScheme: theme });
            await applyHarnessBootstrap(cadencePage, {
              preserveMediaLibrary: true,
              storage: {
                'sniptale-locale-preference': locale,
                'sniptale-theme-preference': theme,
              },
            });
            await cadencePage.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?${cadenceQuery}`);
            await expect(
              cadencePage.locator('[data-ui="video-editor.timeline.surface"]')
            ).toBeVisible();
            await expect
              .poll(
                async () =>
                  (await readNativeVideoProject(cadencePage))?.clips.filter(
                    (clip) => clip.type === 'EFFECT'
                  ).length
              )
              .toBe(3);
            const transferred = (await readNativeVideoProject(cadencePage))!;
            expect(transferred.id).not.toBe(aggregate);
            expect(transferred.bookendPresets?.intro.image?.duration).toBe(0.15);
            expect(
              transferred.clips.find(({ id }) => id === `${transferred.id}:bookend:intro:media`)
            ).toMatchObject({ type: 'IMAGE', startTime: 0, duration: expect.closeTo(5 / 30, 8) });
            await expect(
              cadencePage.getByText(label('common.errors.storageDetail'), { exact: false })
            ).toHaveCount(0);
            expect(await readNativeReviewWorkspace(page, aggregate)).toEqual(beforeCadenceTransfer);
            await cadencePage.screenshot({
              path: info.outputPath('native-transfer-main-cadence.png'),
              fullPage: false,
            });
          } finally {
            await cadencePage.close();
          }
          await button('gallery.videoReview.scene').click();
          const duration = intro
            .locator('[data-ui="shared.ui.presentation-media-fields"]')
            .getByRole('textbox', {
              name: label('gallery.videoReview.presentationDuration'),
              exact: true,
            });
          await duration.fill('0.1');
          await duration.press('Enter');
        }
        await page.screenshot({ path: info.outputPath('gallery-bookends.png'), fullPage: false });
        await button('gallery.videoReview.pointerTool').click();
        await dialog.locator('[data-ui="gallery.videoReview.editBlock"]').first().click();
      }
      if (heldExposure) {
        await expect(dialog.locator('[data-ui="autosave-control"] button').first()).toHaveAttribute(
          'aria-label',
          `${label('editor.documentActions.autosaveTitle')}: ${label('common.states.saved')}`
        );
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
        const stored = (await readNativeReviewWorkspace(page, aggregate))!;
        const document = replayReviewHistory(
          stored.history,
          stored.cursor,
          stored.source,
          reviewDocumentBaseline(stored)
        );
        const mainDuration = emptyMedia ? 1.1955 : 1.198;
        const sourceEnd = stored.source.duration;
        const cutEnd = sourceEnd - 1.198 + 0.03;
        document.edits = [
          {
            id: 'held-main-cut',
            kind: 'cut',
            start: 0.03,
            end: cutEnd,
            requestedStart: 0.03,
            requestedEnd: cutEnd,
          },
        ];
        if (emptyMedia)
          document.edits.push({
            id: 'last-subframe-speed',
            kind: 'speed',
            start: sourceEnd - 0.005,
            end: sourceEnd,
            requestedStart: sourceEnd - 0.005,
            requestedEnd: sourceEnd,
            rate: 2,
            audio: 'speed',
          });
        document.advancedContent.audio.voiceoverSegments = buildReviewTimeMap(
          sourceEnd,
          document.edits
        );
        for (const [
          i,
          annotation,
        ] of document.advancedContent.annotationEffects!.instances.entries()) {
          if (i > 1) continue;
          annotation.start = 0;
          annotation.end = sourceEnd - (lateExposureEnd ? 0.005 : 0);
          annotation.transform = {
            x: i === 0 ? 0.1 : 0.65,
            y: i === 0 ? 0.1 : 0.65,
            width: 0.2,
            height: 0.2,
            rotation: 0,
          };
        }
        document.advancedContent.zoom = {
          enabled: true,
          regions: [
            {
              ...createQuickEditZoomRegion({
                id: 'held-camera',
                at: mainDuration - 0.8,
                duration: 0.8,
                sourceAnchor: { start: sourceEnd - 0.8, end: sourceEnd },
              }),
              transform: { scale: 3, centerX: 0.7, centerY: 0.3 },
              followCursor: false,
              enter: { type: 'none', duration: 0 },
              exit: { type: 'linear', duration: 0.8 },
              motionBlur: { exit: { enabled: true, strength: 1 } },
            },
          ],
        };
        const presentation = document.advancedContent.presentation!;
        presentation.intro.mode = 'none';
        presentation.outro.mode = 'none';
        presentation.introControl!.mode = 'none';
        presentation.outroControl!.mode = 'none';
        delete presentation.introTransition;
        delete presentation.outroTransition;
        const transfer = async () => {
          const inspected = inspectVideoWorkspace({
            ...stored,
            formatVersion: stored.project ? 4 : 2,
            baseline: document,
            history: [],
            cursor: 0,
            revision: stored.revision + 1,
            updatedAt: Date.now(),
            advanced: {
              ...document.advancedContent,
              ui: {
                ...stored.advanced.ui,
                mode: 'advanced',
                tracks: { ...stored.advanced.ui.tracks, zoom: true },
              },
            },
          });
          const fixture = inspected.workspace;
          if (!fixture)
            throw new Error(
              `Invalid held exposure Gallery workspace: ${JSON.stringify(inspected.failure)}`
            );
          await replaceNativeReviewWorkspace(page, aggregate, fixture);
          await page.goto(
            `${host.origin}${GALLERY_HARNESS_PATH}?recordingId=beta-v1-recording&mode=edit&theme=${theme}`
          );
          await expect(dialog).toBeVisible();
          await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
          const beforeTabs = (
            await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])
          ).length;
          await dialog.locator('[data-ui="gallery.videoReview.openVideoEditor"]').click();
          await expect
            .poll(
              async () =>
                (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
            )
            .toBe(beforeTabs + 1);
          const created = (
            await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])
          ).at(-1)!;
          const query = new URL(created.url!).searchParams;
          await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?${query}`);
          await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
          await expect
            .poll(
              async () => (await readNativeVideoProject(page))?.effectSnapshots?.[0]?.assets.length
            )
            .toBe(1);
          const project = (await readNativeVideoProject(page))!;
          await page.reload();
          await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
          await expect.poll(async () => (await readNativeVideoProject(page))?.id).toBe(project.id);
          return (await readNativeVideoProject(page))!;
        };
        const reference = await transfer();
        presentation.intro.mode = 'image';
        presentation.intro.image!.duration = emptyMedia ? 0.15 : 0.14;
        presentation.introControl!.mode = 'media';
        presentation.introControl!.media.enabled = false;
        const sequence = planReviewPresentationSequence({
          settings: presentation,
          mainDuration,
          fragmentOffset: 0,
          includeBookends: true,
          rate: { numerator: 30, denominator: 1 },
        });
        if (!sequence.ok) throw new Error('Missing held exposure sequence');
        const main = sequence.plan.segments.find(({ name }) => name === 'main')!;
        const hold = presentationMainHoldTime(sequence.plan);
        const last = (sequence.plan.candidateCount - 1) / 30;
        if (emptyMedia) expect(last - main.startTick / 30).toBeLessThan(mainDuration);
        else expect(last - main.startTick / 30).toBeGreaterThanOrEqual(mainDuration);
        const points = [12, 28, 44, 60, 76, 92, 108, 124, 140].flatMap((x) =>
          [8, 20, 32, 44, 56, 68, 80].map((y) => ({ x, y, expected: [0, 0, 0] }))
        );
        const settings = {
          burnInSubtitles: false,
          downloadAfterExport: false,
          format,
          fps: 30,
          width: reference.width,
          height: reference.height,
          quality: 'MEDIUM' as const,
          resolution: 'SOURCE' as const,
          scope: 'project' as const,
          subtitleSidecarFormats: [],
          ...(format === 'WEBM'
            ? { webmVideoCodec: 'VP9' as const }
            : { mp4VideoCodec: 'VP9' as const }),
        };
        const referenceTime = emptyMedia ? last - main.startTick / 30 : hold;
        const expected = resolveVideoCompositionRenderPasses(reference, referenceTime);
        expect(expected.visualPasses).toHaveLength(5);
        expect(expected.overlayFrame.camera.scale).toBeGreaterThan(1.05);
        const original = await encodedNativeVideoSamples(
          page,
          host.origin,
          reference,
          format,
          points.map((point) => ({ ...point, time: hold + 0.001 })),
          undefined,
          undefined,
          settings
        );
        const project = await transfer();
        const nativeUrl = page.url();
        expect(project.id).not.toBe(reference.id);
        const resource = project.effectSnapshots![0]!.assets[0]!;
        expect(resource.blob.type).toBe('image/svg+xml');
        expect(resource.blob.size).toBeGreaterThan(0);
        expect(project.effectSnapshots![0]!.sha256).toBe(reference.effectSnapshots![0]!.sha256);
        const current = resolveVideoCompositionRenderPasses(project, last);
        if (emptyMedia)
          await writeFile(
            info.outputPath('empty-media-clock-diagnostic.json'),
            JSON.stringify({
              reference,
              project,
              hold,
              last,
              referenceTime,
              expectedCamera: expected.overlayFrame.camera,
              actualCamera: current.overlayFrame.camera,
            })
          );
        expect(current.visualPasses).toHaveLength(5);
        for (const key of ['scale', 'viewportX', 'viewportY'] as const)
          expect(current.overlayFrame.camera[key]).toBeCloseTo(
            expected.overlayFrame.camera[key],
            6
          );
        const originalPlans = resolveEffectRuntimeFramePlans(reference, referenceTime);
        const heldPlans = resolveEffectRuntimeFramePlans(project, last);
        expect(originalPlans).toHaveLength(2);
        expect(heldPlans).toHaveLength(2);
        for (const [i, plan] of heldPlans.entries())
          expect(plan.time).toBeCloseTo(originalPlans[i]!.time, 7);
        const heldPlayhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
        await heldPlayhead.press('Home');
        for (let tick = 0; tick < sequence.plan.candidateCount - 1; tick++)
          await heldPlayhead.press('ArrowRight');
        for (const point of [
          { x: 28, y: 20 },
          { x: 124, y: 68 },
        ])
          await expect
            .poll(() =>
              page
                .locator('[data-ui="video.preview.stage.root"] canvas[data-preview-stage-canvas]')
                .evaluate(
                  (canvas: HTMLCanvasElement, input) => {
                    const pixel = canvas
                      .getContext('2d')!
                      .getImageData(
                        Math.round((canvas.width * input.point.x) / input.width),
                        Math.round((canvas.height * input.point.y) / input.height),
                        1,
                        1
                      ).data;
                    return Math.max(
                      ...[224, 32, 176].map((color, channel) => Math.abs(pixel[channel]! - color))
                    );
                  },
                  { point, width: project.width, height: project.height }
                )
            )
            .toBeLessThanOrEqual(12);
        await page.screenshot({
          path: info.outputPath('native-held-exposure-reopened.png'),
          fullPage: false,
        });
        const actual = await encodedNativeVideoSamples(
          page,
          host.origin,
          project,
          format,
          points.map((point) => ({ ...point, time: last + 0.0001 })),
          undefined,
          undefined,
          settings
        );
        await writeFile(
          info.outputPath('held-resource-exposure-pixels.json'),
          JSON.stringify(
            {
              hold,
              referenceTime,
              last,
              mainDuration,
              original,
              actual,
              camera: { original: expected.overlayFrame.camera, held: current.overlayFrame.camera },
              passes: {
                original: expected.visualPasses.map(({ time, alpha }) => ({ time, alpha })),
                held: current.visualPasses.map(({ time, alpha }) => ({ time, alpha })),
              },
            },
            null,
            2
          )
        );
        for (const region of [
          (x: number, y: number) => x < 80 && y < 45,
          (x: number, y: number) => x > 80 && y > 45,
        ])
          expect(
            original.samples.some(
              ({ x, y, pixel }) =>
                region(x, y) &&
                Math.abs(pixel[0]! - 224) < 12 &&
                Math.abs(pixel[1]! - 32) < 12 &&
                Math.abs(pixel[2]! - 176) < 12
            )
          ).toBe(true);
        // WebM stores millisecond packets; MP4 keeps microseconds. Both comparisons use a one-microsecond tolerance.
        const packetScale = format === 'WEBM' ? 1000 : 1_000_000;
        const originalPacketTime = Math.round(hold * packetScale) / packetScale;
        const heldPacketTime = Math.round(last * packetScale) / packetScale;
        for (const [i, sample] of actual.samples.entries()) {
          expect(Math.abs(original.samples[i]!.mediaTime - originalPacketTime)).toBeLessThanOrEqual(
            0.000001
          );
          expect(Math.abs(sample.mediaTime - heldPacketTime)).toBeLessThanOrEqual(0.000001);
          for (let channel = 0; channel < 3; channel++)
            expect(
              Math.abs(sample.pixel[channel]! - original.samples[i]!.pixel[channel]!)
            ).toBeLessThanOrEqual(12);
        }
        if (emptyMedia) {
          await page.goto(nativeUrl);
          await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
          const retained = project.clips.find(
            (clip) => clip.type === 'VIDEO' && clip.duration === 0
          )!;
          expect(retained).toBeDefined();
          expect(retained.playbackWindow!.extent).toBeCloseTo(0.0025, 12);
          expect(
            project.clips.filter((clip) => clip.type === 'AUDIO' && clip.duration === 0)
          ).toHaveLength(1);
          const node = page.locator(`[data-project-timeline-clip="${retained.id}"]`);
          await node.scrollIntoViewIfNeeded();
          await expect(node).toBeVisible();
          await node.click();
          await page
            .getByRole('button', {
              name: label('videoEditor.sidebar.inspectorGroupTiming'),
              exact: true,
            })
            .click();
          const bounds = page.locator('[data-ui="video-editor.inspector.source-range"]');
          if (!(await bounds.isVisible()))
            await page
              .getByRole('heading', {
                name: label('videoEditor.sidebar.inspectorSourceBounds'),
                exact: true,
              })
              .click();
          const out = bounds.getByRole('textbox', {
            name: label('videoEditor.sidebar.sourceOut'),
            exact: true,
          });
          await expect(out).toHaveValue(String(Number((sourceEnd - 0.005).toFixed(3))));
          await out.fill(String(sourceEnd));
          await out.press('Enter');
          await expect
            .poll(
              async () =>
                (await readNativeVideoProject(page))!.clips.find((clip) => clip.id === retained.id)!
                  .duration
            )
            .toBeCloseTo(0.0025, 9);
          await page.screenshot({
            path: info.outputPath('native-empty-media-restored.png'),
            fullPage: false,
          });
          await page.reload();
          await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
          const restored = (await readNativeVideoProject(page))!;
          expect(restored.clips.find((clip) => clip.id === retained.id)).toMatchObject({
            sourceStart: sourceEnd - 0.005,
            playbackRate: 2,
          });
          expect(restored.clips.find((clip) => clip.id === retained.id)!.duration).toBeCloseTo(
            0.0025,
            9
          );
        }
        expect(errors).toEqual([]);
        return;
      }
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
      if (activeIntro) {
        await button('gallery.videoReview.scene').click();
        const category = dialog
          .locator('[data-ui="gallery.videoReview.inspectorCategories"] nav')
          .getByRole('button', { name: label('gallery.videoReview.watermark'), exact: true });
        if (await category.count()) await category.click();
        const watermark = dialog.locator('[data-ui="gallery.videoReview.watermarkInspector"]');
        await chooseInspectorValue(
          page,
          watermark,
          label('gallery.videoReview.watermark'),
          label('gallery.videoReview.watermarkImage')
        );
        const logo = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const context = canvas.getContext('2d')!;
          context.fillStyle = '#ffff00';
          context.fillRect(0, 0, 32, 32);
          return canvas.toDataURL('image/png').split(',')[1]!;
        });
        await watermark.locator('input[type="file"]').setInputFiles({
          name: 'source-watermark.png',
          mimeType: 'image/png',
          buffer: Buffer.from(logo, 'base64'),
        });
        await expect(watermark).toHaveAttribute('aria-busy', 'false');
        const size = watermark.getByRole('textbox', {
          name: label('gallery.videoReview.watermarkSize'),
          exact: true,
        });
        await size.fill('20');
        await size.press('Enter');
        await watermark
          .locator('[data-ui="watermark.anchors"]')
          .getByRole('button', {
            name: label('gallery.videoReview.watermarkAnchor_bottom-left'),
            exact: true,
          })
          .click();
        const presentationCategory = dialog
          .locator('[data-ui="gallery.videoReview.inspectorCategories"] nav')
          .getByRole('button', { name: label('gallery.videoReview.presentation'), exact: true });
        if (await presentationCategory.count()) await presentationCategory.click();
        await button('gallery.videoReview.presentationPreviewJoinIntro').click();
        const preview = page.locator('[data-ui="gallery.videoReview.presentationPreview"]');
        const clip = preview.locator('video');
        await expect(clip).toBeVisible({ timeout: 45_000 });
        await expect
          .poll(() => clip.evaluate((video: HTMLVideoElement) => video.readyState))
          .toBeGreaterThanOrEqual(4);
        await clip.evaluate(async (video: HTMLVideoElement) => {
          await video.play();
          video.pause();
          video.currentTime = 0.001;
        });
        await expect
          .poll(() =>
            clip.evaluate((video: HTMLVideoElement) => !video.seeking && video.readyState >= 2)
          )
          .toBe(true);
        const reference = await clip.evaluate((video: HTMLVideoElement) => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext('2d')!;
          context.drawImage(video, 0, 0);
          return {
            width: canvas.width,
            height: canvas.height,
            time: video.currentTime,
            pixel: Array.from(
              context.getImageData(
                Math.round((canvas.width * 10) / 160),
                Math.round((canvas.height * 70) / 100),
                1,
                1
              ).data
            ),
          };
        });
        await writeFile(
          info.outputPath('gallery-bookend-watermark-reference.json'),
          JSON.stringify(reference, null, 2)
        );
        for (const [channel, value] of [255, 255, 0].entries())
          expect(Math.abs(reference.pixel[channel]! - value)).toBeLessThanOrEqual(12);
        await page.screenshot({
          path: info.outputPath('gallery-bookend-watermark-reference.png'),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
        await expect(preview).toHaveCount(0);
      }
      let dormantNativeProjectId: string | undefined;
      if (activeIntro) {
        const saved = async () =>
          expect(dialog.locator('[data-ui="autosave-control"] button').first()).toHaveAttribute(
            'aria-label',
            `${label('editor.documentActions.autosaveTitle')}: ${label('common.states.saved')}`
          );
        await saved();
        const beforeCut = (await readNativeReviewWorkspace(page, aggregate))!;
        await button('gallery.videoReview.cutMode').click();
        const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
        const lane = plane.locator(
          (await plane.getAttribute('data-active-tool-lane')) === 'source'
            ? '[data-ui="gallery.videoReview.sourceLane"]'
            : '[data-ui="gallery.videoReview.ruler"]'
        );
        await lane.scrollIntoViewIfNeeded();
        const box = (await lane.boundingBox())!;
        const duration = Number(await plane.getAttribute('aria-valuemax'));
        await page.mouse.move(box.x + box.width / duration, box.y + 12);
        await page.mouse.down();
        await page.mouse.move(box.x + (box.width * 11) / duration, box.y + 12, { steps: 8 });
        await page.mouse.up();
        const fields = dialog.locator('[data-ui="gallery.videoReview.editRangeFields"]');
        for (const [key, value] of [
          ['gallery.videoReview.rangeStart', '1'],
          ['gallery.videoReview.rangeEnd', '11'],
        ] as const) {
          const field = fields.getByRole('textbox', { name: label(key), exact: true });
          await field.fill(value);
          await field.press('Enter');
        }
        await saved();
        const cutWorkspace = (await readNativeReviewWorkspace(page, aggregate))!;
        await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
        await dialog.locator('[data-ui="gallery.videoReview.openVideoEditor"]').click();
        await expect
          .poll(
            async () =>
              (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
          )
          .toBe(2);
        const tab = (
          await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])
        ).at(-1)!;
        const query = new URL(tab.url!).searchParams;
        query.set('theme', theme);
        const isolated = await page.context().newPage();
        try {
          await isolated.setViewportSize({ ...viewport.size });
          await isolated.emulateMedia({ colorScheme: theme });
          await applyHarnessBootstrap(isolated, {
            preserveMediaLibrary: true,
            storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
          });
          await isolated.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?${query}`);
          await expect(isolated.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
          await expect
            .poll(
              async () =>
                (await readNativeVideoProject(isolated))?.clips.filter(
                  (clip) => clip.type === 'EFFECT'
                ).length
            )
            .toBe(3);
          const project = (await readNativeVideoProject(isolated))!;
          dormantNativeProjectId = project.id;
          expect(project.duration).toBeCloseTo(2.3, 6);
          const hosts = project.clips.filter((clip) => clip.type === 'EFFECT');
          expect(hosts).toHaveLength(3);
          expect(hosts.every((clip) => clip.sourceRange?.dormant)).toBe(true);
          expect(project.effectSnapshots).toHaveLength(1);
          expect(project.effectSnapshots![0]!.assets).toHaveLength(1);
          await isolated.reload();
          await expect(isolated.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
          const reopened = (await readNativeVideoProject(isolated))!;
          expect(reopened.duration).toBe(project.duration);
          expect(reopened.effectSnapshots).toEqual(project.effectSnapshots);
          expect(
            reopened.clips.filter((clip) => clip.type === 'EFFECT').map((clip) => clip.sourceRange)
          ).toEqual(hosts.map((clip) => clip.sourceRange));
          await isolated.screenshot({
            path: info.outputPath('native-wholly-cut-annotations-reopened.png'),
            fullPage: false,
          });
          const output = await encodedNativeVideoSamples(isolated, host.origin, reopened, format, [
            {
              time: 0.001,
              x: Math.round(reopened.width / 2),
              y: Math.round(reopened.height / 2),
              expected: [255, 0, 0],
            },
            {
              time: 0.201,
              x: Math.round(reopened.width / 2),
              y: Math.round(reopened.height / 2),
              expected: [224, 32, 176],
            },
            {
              time: Math.round((reopened.duration - 0.8) * 1_000_000) / 1_000_000 + 0.001,
              x: Math.round(reopened.width / 2),
              y: Math.round(reopened.height / 2),
              expected: [255, 0, 0],
            },
          ]);
          await writeFile(
            info.outputPath('wholly-cut-annotations-encoded.json'),
            JSON.stringify(
              {
                format,
                projectDuration: reopened.duration,
                sourceRanges: hosts.map((clip) => clip.sourceRange),
                output,
              },
              null,
              2
            )
          );
          for (const sample of output.samples) {
            if (sample.time === 0.201)
              expect(sample.error, JSON.stringify(sample)).toBeGreaterThan(32);
            else expect(sample.error, JSON.stringify(sample)).toBeLessThanOrEqual(12);
          }
          expect(await readNativeReviewWorkspace(page, aggregate)).toEqual(cutWorkspace);
        } finally {
          await isolated.close();
        }
        for (let cursor = cutWorkspace.cursor; cursor > beforeCut.cursor; cursor--) {
          await button('gallery.videoReview.undo').click();
          await expect
            .poll(async () => (await readNativeReviewWorkspace(page, aggregate))?.cursor)
            .toBe(cursor - 1);
        }
        await saved();
        const restored = (await readNativeReviewWorkspace(page, aggregate))!;
        expect(
          replayReviewHistory(
            restored.history,
            restored.cursor,
            restored.source,
            reviewDocumentBaseline(restored)
          )
        ).toEqual(
          replayReviewHistory(
            beforeCut.history,
            beforeCut.cursor,
            beforeCut.source,
            reviewDocumentBaseline(beforeCut)
          )
        );
        await button('gallery.videoReview.scene').click();
      }
      if (resultVoice)
        await prepareResultVoiceGalleryFixture(
          page,
          dialog,
          host.origin,
          theme,
          aggregate,
          label,
          (name) => info.outputPath(name)
        );
      await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
      await dialog.locator('[data-ui="gallery.videoReview.openVideoEditor"]').click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
        )
        .toBe(activeIntro ? 3 : 1);
      const gallery = (await readNativeReviewWorkspace(page, aggregate))!;
      const tab = (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).at(
        -1
      )!;
      const nativeQuery = new URL(tab.url!).searchParams;
      nativeQuery.set('theme', theme);
      if (bookends)
        await writeFile(info.outputPath('gallery-bookend-workspace.json'), JSON.stringify(gallery));
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
      const spatialDetailIds = spatialDetails
        ? await checkTransferredSpatialDetails(page, native, label, (name) => info.outputPath(name))
        : undefined;
      const resultTake = resultVoice
        ? native.clips.find((clip) => clip.type === 'AUDIO' && clip.textSnapshot)
        : undefined;
      const canonicalResultTake = resultTake
        ? hydrateVideoProject(native).clips.find((clip) => clip.id === resultTake.id)
        : undefined;
      if (resultVoice)
        await checkTransferredResultVoiceEditing(page, native, label, (name) =>
          info.outputPath(name)
        );

      if (fractionalMain)
        expect(
          native.clips.some(
            (clip) =>
              clip.type === 'VIDEO' &&
              !clip.id.includes(':bookend:') &&
              clip.playbackWindow !== undefined
          )
        ).toBe(true);
      if (activeIntro) expect(native.id).not.toBe(dormantNativeProjectId);
      if (bookends) {
        expect(native.version).toBe(fractionalVideo ? 43 : 41);
        expect(
          native.assets.find(({ id }) => id === native.bookendPresets?.intro.image?.assetId)?.name
        ).toBe('retained-opening.png');
        expect(
          native.assets.find(({ id }) => id === native.bookendPresets?.outro.video?.assetId)?.name
        ).toBe(outroFixture);
        expect(native.bookendPresets?.intro.image).toBeDefined();
        expect(native.bookendPresets?.intro.edgeControl?.mode).toBe(
          activeIntro || fractionalVideo ? 'media' : 'none'
        );
        if (activeIntro)
          expect(native.clips).toContainEqual(
            expect.objectContaining({
              id: `${native.id}:bookend:intro:media`,
              type: 'IMAGE',
              startTime: 0,
              duration: 0.1,
            })
          );
        if (fractionalVideo) {
          expect(native.bookendPresets?.intro.video?.trim).toEqual({ start: 0, end: 0.15 });
          expect(
            native.clips.find(({ id }) => id === `${native.id}:bookend:intro:media`)
          ).toMatchObject({
            type: 'VIDEO',
            duration: expect.closeTo(5 / 30, 8),
            sourceStart: 0,
            sourceDuration: 0.15,
            playbackWindow: { offset: 0, holdAt: 0.15 },
          });
        }
        expect(native.bookendPresets?.outro.video?.trim).toEqual({ start: 0, end: 1 });
        if (activeIntro) {
          expect(native.bookendPresets?.outro.video?.audio).toEqual({ muted: false, gain: 0.7 });
          expect(
            native.clips.find(({ id }) => id === `${native.id}:bookend:outro:audio`)
          ).toMatchObject({ type: 'AUDIO', muted: false, audioGainStart: 0.7, audioGainEnd: 0.7 });
        }
        expect(native.clips).toContainEqual(
          expect.objectContaining({
            id: `${native.id}:bookend:outro:media`,
            type: 'VIDEO',
            duration: fractionalVideo
              ? expect.closeTo(1 - (5 / 30 - 0.15) + (fractionalMain ? 0.01 : 0), 8)
              : 1,
            sourceStart: 0,
            sourceDuration: 1,
            playbackRate: 1,
          })
        );
      }
      if (activeIntro) {
        expect(native.watermarkSource).toBeUndefined();
        expect(native.watermark?.image?.size).toBe(0.2);
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
          .click();
        await page
          .locator('[data-ui="video-editor.inspector.categories"] > nav')
          .getByRole('button', { name: label('gallery.videoReview.watermark'), exact: true })
          .click();
        const watermark = page.locator('[data-ui="video-editor.watermark.inspector"]');
        const size = watermark.getByRole('textbox', {
          name: label('gallery.videoReview.watermarkSize'),
          exact: true,
        });
        await size.fill('25');
        await size.press('Enter');
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.watermark?.image?.size)
          .toBe(0.25);
        await size.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath('native-watermark-inspector.png'),
          fullPage: false,
        });
        expect(native.bookendPresets?.outro.edgeControl?.plain.duration).toBe(0.7);
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
          .click();
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneEdges'), exact: true })
          .click();
        const outro = page
          .locator('[data-ui="video-editor.scene-bookends.outro"]')
          .locator('xpath=ancestor::details[1]');
        await chooseInspectorValue(
          page,
          outro,
          label('gallery.videoReview.presentationOutro'),
          label('gallery.videoReview.presentationFadeOut')
        );
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.sceneEdges?.outro)
          .toEqual(native.bookendPresets!.outro.edgeControl!.plain);
        const plainFields = outro.locator('[data-ui="shared.ui.presentation-fade-fields"]');
        const duration = plainFields.getByRole('textbox', {
          name: label('gallery.videoReview.presentationDuration'),
          exact: true,
        });
        await duration.fill('0.9');
        await duration.press('Enter');
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))?.bookendPresets?.outro.edgeControl?.plain
                .duration
          )
          .toBe(0.9);
        const authored = (await readNativeVideoProject(page))!;
        expect(authored.bookendPresets?.outro.edgeControl?.media).toEqual(
          native.bookendPresets?.outro.edgeControl?.media
        );
        expect(authored.clips).toEqual(hydrateVideoProject(native).clips);
        await checkInspectorPaintedFont(page, plainFields, 'native-restored-plain-fade');
        await page.screenshot({
          path: info.outputPath('native-restored-plain-fade.png'),
          fullPage: false,
        });
        await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.sceneEdges?.outro.duration)
          .toBe(0.7);
        await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.sceneEdges)
          .toEqual(native.sceneEdges);
        expect((await readNativeVideoProject(page))?.bookendPresets).toEqual(native.bookendPresets);
        await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.sceneEdges?.outro.duration)
          .toBe(0.7);
        await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.sceneEdges?.outro.duration)
          .toBe(0.9);
        expect(
          (await readNativeVideoProject(page))?.bookendPresets?.outro.edgeControl?.plain.duration
        ).toBe(0.9);
      }
      if (bookends) {
        const mediaId = `${native.id}:bookend:outro:media`;
        await page.locator('[data-ui="video-editor.timeline.toolbar.fit-project"]').click();
        await page.locator(`[data-project-timeline-clip="${mediaId}"]`).click();
        const bookendPlayhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
        await bookendPlayhead.press('End');
        for (let n = 0; n < 15; n++) await bookendPlayhead.press('ArrowLeft');
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
              (await readNativeVideoProject(page))!.clips.find(({ id }) => id === mediaId)
                ?.transform.rotation
          )
          .toBe(5);
        await checkInspectorPaintedFont(page, rotation, 'transferred-bookend-rotation');
        await page.screenshot({
          path: info.outputPath('native-bookend-inspector.png'),
          fullPage: false,
        });
        await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))!.clips.find(({ id }) => id === mediaId)
                ?.transform.rotation
          )
          .toBe(0);
      }
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
        const cutBoundary = native.compositionJoins!.find(
          (join) => join.sampling === 'cut' && join.transition?.type === galleryCut
        )!;
        const sourceAsset = native.assets.find(
          ({ id }) => id === cutBoundary.sourceRange?.assetId
        )!;
        const joinGroup = page
          .getByRole('heading', { name: sourceAsset.name, exact: true })
          .locator('xpath=ancestor::details[1]');
        const joinFields = joinGroup.locator('[data-ui="shared.ui.presentation-join-fields"]');
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
              (await readNativeVideoProject(page))?.compositionJoins?.find(
                ({ id }) => id === cutBoundary.id
              )?.transition?.type
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
        const seek = joinGroup
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
      const viewportAnnotation = native.clips.find(
        (clip) => clip.type === 'EFFECT' && clip.attachment?.kind === 'viewport'
      )!;
      expect(content).toBeTruthy();
      expect(viewportAnnotation).toBeTruthy();
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
      await expect
        .poll(async () =>
          Math.max(
            ...(await readDormantPixel()).map((channel, channelIndex) =>
              Math.abs(channel - [224, 32, 176][channelIndex]!)
            )
          )
        )
        .toBeGreaterThan(32);

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
      if (activeIntro) {
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
          .click();
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneEdges'), exact: true })
          .click();
        const fields = page.locator('[data-ui="video-editor.scene-bookends.outro"]');
        await fields
          .getByRole('button', { name: label('videoEditor.sidebar.bookendPreset'), exact: true })
          .click();
        const preset = fields.locator('[data-ui="video-editor.scene-bookends.preset"]');
        const advanced = preset
          .locator('details')
          .filter({
            has: page
              .locator('summary')
              .filter({ hasText: label('gallery.videoReview.presentationAdvanced') }),
          })
          .last();
        await advanced.locator('summary').click();
        const fade = advanced.locator('[data-ui="shared.ui.presentation-fade-fields"]');
        const beforeRecipe = (await readNativeVideoProject(page))!;
        const enabled = fade.getByRole('switch', {
          name: label('gallery.videoReview.presentationFadeOut'),
          exact: true,
        });
        if ((await enabled.getAttribute('aria-checked')) === 'false') await enabled.click();
        const duration = fade.getByRole('textbox', {
          name: label('gallery.videoReview.presentationDuration'),
          exact: true,
        });
        await duration.fill('0.4');
        await duration.press('Enter');
        const audio = fade.getByRole('switch', {
          name: label('gallery.videoReview.presentationAudioFade'),
          exact: true,
        });
        if ((await audio.getAttribute('aria-checked')) === 'false') await audio.click();
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))?.bookendPresets?.outro.edgeControl?.media
          )
          .toMatchObject({ enabled: true, duration: 0.4, audioFade: true });
        const recipe = (await readNativeVideoProject(page))!;
        expect(recipe.clips).toEqual(beforeRecipe.clips);
        expect(recipe.sceneEdges).toEqual(beforeRecipe.sceneEdges);
        expect(recipe.bookendPresets?.outro.edgeControl?.plain).toEqual(
          beforeRecipe.bookendPresets?.outro.edgeControl?.plain
        );
        await checkInspectorLabels(preset);
        await checkInspectorPaintedFont(page, fade, 'native-bookend-media-fade');
        const recipeGeometry = await preset.evaluate((node) => {
          const body = node.closest('[data-ui="video-editor.inspector.categories"] > div');
          return {
            preset: { width: node.clientWidth, scrollWidth: node.scrollWidth },
            scrollOwner:
              body instanceof HTMLElement
                ? { width: body.clientWidth, scrollWidth: body.scrollWidth }
                : null,
          };
        });
        await writeFile(
          info.outputPath('native-bookend-fade-geometry.json'),
          JSON.stringify(recipeGeometry)
        );
        expect(recipeGeometry.scrollOwner).not.toBeNull();
        expect(recipeGeometry.scrollOwner!.scrollWidth).toBeLessThanOrEqual(
          recipeGeometry.scrollOwner!.width + 1
        );
        await page.screenshot({
          path: info.outputPath('native-bookend-fade-recipe.png'),
          fullPage: false,
        });
        await fields
          .getByRole('button', {
            name: label('videoEditor.sidebar.bookendInsertOutro'),
            exact: true,
          })
          .click();
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.duration)
          .toBeCloseTo(recipe.duration + 1, 6);
        const placed = (await readNativeVideoProject(page))!;
        expect(placed.sceneEdges?.outro).toMatchObject({
          enabled: true,
          duration: 0.4,
          audioFade: true,
        });
        expect(
          placed.clips.filter(({ id }) => recipe.clips.some((clip) => clip.id === id))
        ).toEqual(recipe.clips);
        await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.clips)
          .toEqual(recipe.clips);
        expect((await readNativeVideoProject(page))?.sceneEdges).toEqual(recipe.sceneEdges);
        await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.clips)
          .toEqual(placed.clips);
        expect((await readNativeVideoProject(page))?.sceneEdges).toEqual(placed.sceneEdges);
      }
      const final = (await readNativeVideoProject(page))!;
      if (resultVoice) {
        expect(final.clips.find((clip) => clip.id === resultTake?.id)).toEqual(canonicalResultTake);
        expect(
          final.clips.filter((clip) => clip.type === 'VIDEO' && clip.assetId !== asset.id)
        ).toEqual(hydrateVideoProject(native).clips.filter((clip) => clip.type === 'VIDEO'));
        await writeFile(
          info.outputPath('result-voice-native-before-reopen.json'),
          JSON.stringify(final)
        );
      }

      const otherVideo = final.clips.find(
        (clip) => clip.type === 'VIDEO' && clip.assetId === asset.id
      )!;
      const otherVideoSampleTime =
        Math.round(
          (Math.ceil((otherVideo.startTime + Math.min(0.2, otherVideo.duration / 2)) * final.fps) /
            final.fps) *
            1_000_000
        ) /
          1_000_000 +
        0.001;
      if (activeIntro) {
        expect(final.watermarkSource).toBeUndefined();
        expect(final.watermark?.image?.size).toBe(0.25);
      }
      if (activeIntro) {
        expect(final.bookendPresets?.outro.edgeControl?.plain.duration).toBe(0.9);
        expect(final.bookendPresets?.outro.edgeControl?.media.duration).toBe(0.4);
      }
      if (spatialDetails) {
        await writeFile(
          info.outputPath('native-resource-spatial-final.json'),
          JSON.stringify(final)
        );
        await writeFile(
          info.outputPath('native-resource-exposure-probe.json'),
          JSON.stringify(
            [0.025, 0.1, 0.2].map((time) => {
              const passes = resolveVideoCompositionRenderPasses(final, time);
              return {
                time,
                camera: passes.overlayFrame.camera,
                passes: passes.visualPasses.map((pass) => ({
                  time: pass.time,
                  camera: pass.frame.camera,
                })),
              };
            })
          )
        );
        const detail = final.motionRegions!.find(
          (region) => region.depthOfField?.strength === 0.6
        )!;
        expect(detail.depthOfField).toMatchObject({ mode: 'area', strength: 0.6, softness: 0.35 });
        expect(detail.motionBlur?.enter).toEqual({ enabled: true, strength: 0.65 });
        expect(detail.motionBlur?.exit).toEqual({ enabled: true, strength: 0.75 });
        expect(resolveVideoCompositionRenderPasses(final, 1.1).visualPasses.length).toBeGreaterThan(
          1
        );
        expect(
          final.motionRegions!.find((region) => region.id === spatialDetailIds?.blurRegionId)
            ?.motionBlur?.enter
        ).toEqual({ enabled: true, strength: 0.75 });
        expect(
          resolveVideoCompositionFrame(final, 0.6).camera.spatial?.focus.some(
            (focus) => focus.weight > 0 && focus.settings.strength === 0.6
          )
        ).toBe(true);
        expect(
          resolveVideoCompositionRenderPasses(final, 0.025).visualPasses.length
        ).toBeGreaterThan(1);
        expect(resolveVideoCompositionFrame(final, 0.1).camera.motionBlurAmount).toBe(0);
      }
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
      expect(await readNativeVideoProject(page, final.id)).toEqual(final);
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
        expect(await readNativeVideoProject(page, final.id)).toEqual(final);
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
        expect(await readNativeVideoProject(page, final.id)).toEqual(final);
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
      const bookendMedia = bookends
        ? final.clips.find(({ id }) => id === `${final.id}:bookend:outro:media`)
        : undefined;
      if (bookends) expect(bookendMedia).toBeTruthy();
      const output = await encodedNativeVideoSamples(
        page,
        host.origin,
        final,
        format,
        [
          ...(selectedOnly
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
                            {
                              time: 0.6,
                              x: Math.round(final.width / 2),
                              y: 2,
                              expected: [0, 0, 0],
                            },
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
                ...(spatialDetails
                  ? [
                      {
                        time: 1.1,
                        x: Math.round(final.width / 2),
                        y: Math.round(final.height / 2),
                        expected: [224, 32, 176],
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
                  x: Math.round(
                    viewportAnnotation.transform.x + viewportAnnotation.transform.width / 2
                  ),
                  y: Math.round(
                    viewportAnnotation.transform.y + viewportAnnotation.transform.height / 2
                  ),
                  expected: [224, 32, 176],
                },
              ]),
          ...(activeIntro
            ? [
                { time: otherVideoSampleTime, x: 10, y: 70, expected: [255, 255, 0] },
                { time: 2, x: 10, y: 70, expected: [255, 255, 0] },
                { time: 0.001, x: 10, y: 70, expected: [255, 255, 0] },
                {
                  time: Math.round((final.duration - 0.8) * 1_000_000) / 1_000_000 + 0.001,
                  x: 10,
                  y: 70,
                  expected: [255, 255, 0],
                },
              ]
            : []),
          ...(activeIntro
            ? [
                {
                  time: 0.001,
                  x: Math.round(final.width / 2),
                  y: Math.round(final.height / 2),
                  expected: [255, 0, 0],
                },
              ]
            : []),
          ...(activeIntro
            ? [
                {
                  time:
                    Math.round(
                      ((Math.ceil(final.duration * start.settings.fps) - 1) / start.settings.fps) *
                        1_000_000
                    ) /
                      1_000_000 +
                    0.001,
                  x: Math.round(final.width / 2),
                  y: Math.round(final.height / 2),
                  expected: [0, 0, 0],
                },
                {
                  time: Math.round((final.duration - 0.8) * 1_000_000) / 1_000_000 + 0.001,
                  x: Math.round(final.width / 2),
                  y: Math.round(final.height / 2),
                  expected: [255, 0, 0],
                },
                {
                  time:
                    Math.round(
                      ((Math.ceil(final.duration * start.settings.fps) - 1) / start.settings.fps -
                        0.2) *
                        1_000_000
                    ) /
                      1_000_000 +
                    0.001,
                  x: Math.round(final.width / 2),
                  y: Math.round(final.height / 2),
                  expected: [128, 0, 0],
                },
              ]
            : []),
          ...(bookendMedia
            ? [
                {
                  time: Math.round((bookendMedia.startTime + 0.5) * 1_000_000) / 1_000_000 + 0.001,
                  x: Math.round(final.width / 2),
                  y: Math.round(final.height / 2),
                  expected: [255, 0, 0],
                },
              ]
            : []),
        ],
        undefined,
        start.input,
        selectedOnly || activeIntro ? start.settings : undefined
      );
      if (resultVoice) {
        const audio = await readEncodedAudioWindows(page, [2.2, 4.2], 0.1);
        await writeFile(
          info.outputPath('result-voice-real-encode.json'),
          JSON.stringify(
            {
              format,
              audio,
              output,
              take: resultTake,
            },
            null,
            2
          )
        );
        expect(audio).toHaveLength(2);
        // The 880 Hz replacement is audible if it is scheduled; codec silence stays below 0.001 RMS.
        expect(audio[0]).toBeLessThan(0.001);
        expect(audio[1]).toBeGreaterThan(0.02);
      }
      if (bookends)
        await writeFile(
          info.outputPath('bookend-encoded-pixels.json'),
          JSON.stringify(
            {
              format,
              activeIntro,
              ...(activeIntro ? { exportSettings: start.settings } : {}),
              ...output,
            },
            null,
            2
          )
        );
      if (fractionalVideo) {
        const offsets = [0.025, 0.075, 0.125];
        const windowDuration = 0.005;
        const sourceAudio = await page.evaluate(
          async ({ encoded, offsets, windowDuration }) => {
            const decoder = new AudioContext({ sampleRate: 48000 });
            try {
              const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
              const audio = await decoder.decodeAudioData(bytes.buffer);
              const pcm = audio.getChannelData(0);
              return offsets.map((time) => {
                const first = Math.round(time * audio.sampleRate),
                  last = Math.round((time + windowDuration) * audio.sampleRate);
                let squares = 0;
                for (let i = first; i < last; i++) squares += pcm[i]! ** 2;
                return Math.sqrt(squares / (last - first));
              });
            } finally {
              await decoder.close();
            }
          },
          {
            encoded: (await readFile(`tooling/test/e2e/fixtures/${outroFixture}`)).toString(
              'base64'
            ),
            offsets,
            windowDuration,
          }
        );
        const document = replayReviewHistory(
          gallery.history,
          gallery.cursor,
          gallery.source,
          reviewDocumentBaseline(gallery)
        );
        const mainDuration = buildReviewTimeMap(gallery.source.duration, document.edits).at(
          -1
        )!.resultEnd;
        const sequence = planReviewPresentationSequence({
          settings: document.advancedContent.presentation!,
          mainDuration,
          fragmentOffset: 0,
          includeBookends: true,
          rate: { numerator: final.fps, denominator: 1 },
        });
        if (!sequence.ok) throw new Error('Missing Gallery audio sequence');
        const decoded = await readEncodedAudioWindows(page, [...offsets, 0.16], windowDuration);
        const ratios = offsets.map((_, i) => decoded[i]! / sourceAudio[i]!);
        const expected = offsets.map(
          (time) =>
            presentationAudioGain(sequence.plan, Math.round((time + windowDuration / 2) * 48000)) *
            document.advancedContent.presentation!.intro.video!.audio.gain
        );
        await writeFile(
          info.outputPath('fractional-bookend-encoded-audio.json'),
          JSON.stringify(
            { offsets, windowDuration, sourceAudio, decoded, ratios, expected },
            null,
            2
          )
        );
        for (let i = 0; i < offsets.length; i++) {
          expect(sourceAudio[i]!).toBeGreaterThan(0.001);
          expect(Math.abs(ratios[i]! - expected[i]!)).toBeLessThan(0.08);
        }
        expect(decoded.at(-1)! / Math.max(...sourceAudio)).toBeLessThan(0.12);
      }
      if (activeIntro) {
        const offsets = [0.25, 0.65, 0.85, 0.95];
        const sourceAudio = await page.evaluate(
          async ({ encoded, times }) => {
            const decoder = new AudioContext({ sampleRate: 48000 });
            try {
              const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
              const buffer = await decoder.decodeAudioData(bytes.buffer);
              const pcm = buffer.getChannelData(0);
              return times.map((time) => {
                const first = Math.round(time * buffer.sampleRate),
                  last = Math.round((time + 0.02) * buffer.sampleRate);
                let squares = 0;
                for (let frame = first; frame < last; frame++) squares += pcm[frame]! ** 2;
                return Math.sqrt(squares / (last - first));
              });
            } finally {
              await decoder.close();
            }
          },
          {
            encoded: (await readFile(`tooling/test/e2e/fixtures/${outroFixture}`)).toString(
              'base64'
            ),
            times: offsets,
          }
        );
        const decoded = await readEncodedAudioWindows(
          page,
          offsets.map((offset) => final.duration - 1 + offset)
        );
        const ratios = decoded.map((value, index) => value / sourceAudio[index]!);
        await writeFile(
          info.outputPath('bookend-encoded-audio.json'),
          JSON.stringify({ format, offsets, sourceAudio, decoded, ratios }, null, 2)
        );
        for (const [index, offset] of offsets.entries()) {
          expect(sourceAudio[index]!).toBeGreaterThan(0.001);
          expect(decoded[index]!).toBeGreaterThan(0.001);
          const expected = 0.7 * Math.min(1, (1 - offset - 0.01) / 0.4);
          expect(Math.abs(ratios[index]! - expected)).toBeLessThan(0.06);
        }
      }
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
      expect(await readNativeVideoProject(page, final.id)).toEqual(final);
      if (spatialDetails && spatialDetailIds) {
        await checkTransferredRotatedArea({
          page,
          origin: host.origin,
          theme,
          project: final,
          regionId: spatialDetailIds.depthRegionId,
          format,
          label,
          outputPath: (name) => info.outputPath(name),
        });
        expect(await readNativeReviewWorkspace(page, aggregate)).toEqual(gallery);
      }
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
