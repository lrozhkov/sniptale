import { drawReviewAnnotationText } from '../../../../apps/extension/src/workflows/video-review/draw-annotation-text';
import {
  prepareReviewAnnotationTextFonts,
  reviewAnnotationTextFont,
} from '../../../../apps/extension/src/workflows/video-review/annotation-text-fonts';
import {
  applyReviewTextTemplate,
  REVIEW_TEXT_TEMPLATE_IDS,
  reviewBuiltinTextTemplates,
} from '../../../../apps/extension/src/features/video/review/annotation-effects/text-templates';
import { createReviewAnnotationTextClip } from '../../../../apps/extension/src/features/video/review/annotation-effects/text-animation';
import { createReviewPresentationMain } from '../../../../apps/extension/src/workflows/video-review/presentation-main';
import { reviewCutTransitionAt } from '../../../../apps/extension/src/features/video/review/cuts';
import { createGlTransitionSelection } from '../../../../apps/extension/src/features/video/project/transition/gl-catalog';
import {
  createQuickEditWebcam,
  quickEditWebcamPlacementAt,
} from '../../../../apps/extension/src/features/video/review/advanced/webcam';
import { resolveQuickEditEffectiveState } from '../../../../apps/extension/src/features/video/review/advanced/effective';
import retainedCalloutSource from '../../../../apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json?raw';
import { createQuickEditBorder } from '../../../../apps/extension/src/features/video/project/scene/focus-appearance';
import {
  createReviewAnnotationGeometry,
  convertReviewAnnotationAttachment,
} from '../../../../apps/extension/src/gallery/video-review/annotation-effects-geometry';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';
import { quickEditSpatialTargetCamera } from '../../../../apps/extension/src/features/video/review/advanced/spatial';
import { DEFAULT_CAMERA_PERSPECTIVE as DEFAULT_QUICK_EDIT_PERSPECTIVE } from '../../../../apps/extension/src/features/video/project/motion/spatial';
import { validateAnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import {
  parseEffectControlValues,
  resolveEffectControlDefault,
} from '@sniptale/runtime-contracts/effect-controls';
import { sha256 as hashSha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { ReviewAnnotationEffectSnapshot } from '../../../../apps/extension/src/features/video/review/annotation-effects/types';
import {
  initializeReviewAnnotationEffectAnchors,
  resolveReviewAnnotationEffectControls,
} from '../../../../apps/extension/src/features/video/review/annotation-effects/layout';
import { createReviewPreviewRenderer } from '../../../../apps/extension/src/workflows/video-review/render-preview';
import { createPreviewRenderResources } from '../../../../apps/extension/src/workflows/video-review/preview-render-resources';
import {
  calculatePreviewRenderAllocation,
  resolvePreviewRenderAllocation,
  type PreviewRenderAllocationInput,
} from '../../../../apps/extension/src/workflows/video-review/preview-render-allocation';
import {
  createReviewAnnotationRenderer,
  planReviewAnnotationFrame,
  reviewAnnotationPreparationBytes,
} from '../../../../apps/extension/src/workflows/video-review/annotation-renderer';
import {
  computeQuickEditSceneLayout,
  evaluateQuickEditCameraAtTime,
} from '../../../../apps/extension/src/features/video/review/advanced/scene';
import { createReviewSpatialRenderer } from '../../../../apps/extension/src/features/video/composition/canvas/spatial-renderer';
import { drawReviewSceneFrame } from '../../../../apps/extension/src/workflows/video-review/scene-frame';
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Input,
  Output,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  WebMOutputFormat,
} from 'mediabunny';
import { inspectReviewMedia } from '../../../../apps/extension/src/workflows/video-review/media-index';
import { writeReviewFrames } from '../../../../apps/extension/src/workflows/video-review/render-export';
import { createNeutralPresentationSettings } from '../../../../apps/extension/src/features/video/review/advanced/presentation';
import { createQuickEditAdvancedState } from '../../../../apps/extension/src/features/video/review/advanced/defaults';
import {
  buildReviewTimeMap,
  createReviewTimeMap,
} from '../../../../apps/extension/src/features/video/review/timeline';
import type { ReviewEdit } from '../../../../apps/extension/src/features/video/review/types';

type Size = { width: number; height: number };
type Scene = Parameters<ReturnType<typeof createReviewPreviewRenderer>['prepare']>[0];
const sourceSize = { width: 1920, height: 1080 };
const names = ['lower-third', 'title', 'chapters', 'callout', 'frame', 'corners'];

async function definitions() {
  return Promise.all(
    names.map(async (name) => {
      const response =
        name === 'callout'
          ? new Response(retainedCalloutSource)
          : await fetch(`/video-effects/animations/${name}.sniptale-animation.json`);
      if (!response.ok) throw new Error('Builtin source unavailable');
      const source = await response.text();
      const raw: unknown = JSON.parse(source);
      const result = validateAnimationTemplate(raw);
      if (!result.ok || !result.template) throw new Error('Builtin source invalid');
      const bytes = new TextEncoder().encode(source);
      const sha256 = bytesToHex(hashSha256(bytes));
      const snapshot: ReviewAnnotationEffectSnapshot = {
        id: `effect:${sha256}`,
        sha256,
        schemaVersion: 'sniptale.animation.v1',
        kind: 'standalone',
        documentId: result.template.id,
        source,
        retainedByteLength: bytes.byteLength,
        assets: [],
      };
      return { document: result.template, snapshot };
    })
  );
}

function surface(size: Size) {
  return Object.assign(document.createElement('canvas'), size);
}

function fixture(
  defs: Awaited<ReturnType<typeof definitions>>,
  count: number,
  size: Size,
  plane: 'content' | 'viewport'
): Scene {
  return {
    source: sourceSize,
    canvas: size,
    background: { enabled: false },
    zoomRegions: [],
    comments: [],
    clicks: [],
    keys: [],
    annotationEffects: {
      snapshots: defs.slice(0, count).map((entry) => entry.snapshot),
      segments: [
        { sourceStart: 0, sourceEnd: 12, resultStart: 0, resultEnd: 12, kind: 'keep', rate: 1 },
      ],
      lane: {
        enabled: true,
        instances: defs.slice(0, count).map(({ document, snapshot }, index) => {
          const controls = Object.fromEntries(
            document.controls.map((control) => [
              control.id,
              resolveEffectControlDefault(control, 'en'),
            ])
          );
          const bounds = plane === 'content' ? sourceSize : size;
          const layout = document.objectLayout;
          const transform = {
            x: 0.12,
            y: 0.1 + index * 0.08,
            width: document.animation.w / sourceSize.width,
            height: document.animation.h / sourceSize.height,
            rotation: 0,
          };
          // The retained package bounds tipX to1000; a0.9 plane anchor mapped to1497.6.
          // Keep a far external tip one authored increment inside that declared bound.
          const handleControls =
            document.id === 'sniptale-callout' ? { ...controls, tipX: 999, tipY: -300 } : controls;
          const anchors = initializeReviewAnnotationEffectAnchors(
            document,
            transform,
            handleControls,
            bounds
          );
          const instance = {
            id: `native-${index}`,
            snapshotId: snapshot.id,
            enabled: true,
            start: 0,
            end: 12,
            attachment: plane,
            order: index,
            transform,
            controls: Object.fromEntries(
              Object.entries(controls).filter(
                ([id]) =>
                  !layout?.handles?.some(
                    (handle) => handle.xControl === id || handle.yControl === id
                  )
              )
            ),
            ...(anchors ? { anchors } : {}),
          };
          if (
            !parseEffectControlValues(
              document,
              resolveReviewAnnotationEffectControls(document, instance, bounds)
            )
          )
            throw new Error(`Annotation probe controls are invalid: ${document.id}`);
          return instance;
        }),
      },
    },
  };
}

function managed(scene: Scene, size: Size) {
  const resources = createPreviewRenderResources({ maximumManagedBytes: 1, maximumCanvases: 1 });
  let assets: PreviewRenderAllocationInput['assets'] = {
    backgroundBitmap: null,
    headerBitmap: null,
    watermark: null,
    previousWatermarkCache: null,
  };
  const budgets: { maximumManagedBytes: number; maximumCanvases: number }[] = [];
  const describe = () =>
    resolvePreviewRenderAllocation({
      scene,
      dimensions: { canonical: size, backing: size },
      sourceTime: 2,
      resultTime: 2,
      sourceAllocationBytes: null,
      sourceBacking: sourceSize,
      camera: { retainedBytes: null, activeBytes: null },
      transitionBytes: null,
      previousFront: null,
      assets,
    });
  const replaceLimits = (limits: { maximumManagedBytes: number; maximumCanvases: number }) => {
    resources.replaceLimits(limits);
    budgets.push(limits);
  };
  return {
    resources,
    budgets,
    allocation: { describe, replaceLimits },
    admit(prepared: { allocationAssets: PreviewRenderAllocationInput['assets'] }) {
      assets = prepared.allocationAssets;
      replaceLimits(calculatePreviewRenderAllocation(describe()));
    },
  };
}

function compare(left: HTMLCanvasElement, right: HTMLCanvasElement) {
  const a = left.getContext('2d')!.getImageData(0, 0, left.width, left.height).data;
  const b = right.getContext('2d')!.getImageData(0, 0, right.width, right.height).data;
  let pixels = 0,
    maxDifference = 0;
  for (let i = 0; i < a.length; i += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const difference = Math.abs(a[i + channel]! - b[i + channel]!);
      maxDifference = Math.max(maxDifference, difference);
      changed ||= difference !== 0;
    }
    if (changed) pixels++;
  }
  return { pixels, maxDifference };
}

function source() {
  const canvas = surface(sourceSize);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#12394a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#236b72';
  context.fillRect(0, 0, canvas.width / 2, canvas.height / 2);
  return {
    timestamp: 2,
    backing: sourceSize,
    draw(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
      context.drawImage(canvas, x, y, width, height);
    },
  };
}

/** Actual SDK sandbox, immutable source verification and product preview budgets; no interpreter override. */
export async function performanceProbe() {
  const defs = await definitions();
  const sample = source();
  const results = [];
  for (const width of [1920, 3840]) {
    const size = { width, height: (width * 9) / 16 };
    for (const count of [0, 1, 3, 6]) {
      const scene = fixture(defs, count, size, 'viewport');
      const before = JSON.stringify(scene.annotationEffects);
      const owner = managed(scene, size);
      const renderer = createReviewPreviewRenderer({
        resources: owner.resources,
        allocation: owner.allocation,
      });
      const durations = [];
      let preparationMs = 0;
      try {
        const started = performance.now();
        const prepared = await renderer.prepare(
          scene,
          { canonical: size, backing: size },
          new AbortController().signal
        );
        preparationMs = performance.now() - started;
        owner.admit(prepared);
        for (let tick = 0; tick < 4; tick++) {
          const started = performance.now();
          const frame = await renderer.render(prepared, {
            generation: 1,
            source: sample,
            sourceTime: 2 + tick / 30,
            resultTime: 2 + tick / 30,
            fps: 30,
          });
          durations.push(performance.now() - started);
          frame.release();
        }
      } finally {
        renderer.dispose();
        owner.resources.dispose();
      }
      results.push({
        width,
        count,
        preparationMs,
        durations,
        budgets: owner.budgets,
        resources: owner.resources.counters,
        authoredUnchanged: before === JSON.stringify(scene.annotationEffects),
      });
    }
  }
  return results;
}

/** Compare preview with the production offline export consumer and an independent plain-frame witness. */
export async function parityProbe(combinedBorders = false) {
  const defs = await definitions();
  const signal = new AbortController().signal;
  const file = await encodedSource({ size: sourceSize, duration: 12, fps: 2, pattern: true });
  const index = await inspectReviewMedia(file, signal);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) {
    input.dispose();
    throw new Error('Parity source video unavailable');
  }
  const sink = new VideoSampleSink(track);
  const size = { width: 960, height: 540 };
  const results = [];
  const cases = (['content', 'viewport'] as const).flatMap((plane) =>
    (['flat', 'zoom', 'spatial'] as const).flatMap((camera) =>
      (['keep', 'cut-speed'] as const).map((clock) => ({ plane, camera, clock }))
    )
  );
  try {
    for (const { plane, camera: cameraKind, clock } of cases) {
      const scene = fixture(defs, 6, size, plane);
      if (cameraKind !== 'flat')
        scene.zoomRegions = [
          {
            id: 'native-camera',
            start: 0,
            end: 8,
            transform: { scale: 1.35, centerX: 0.58, centerY: 0.43 },
            enter: { type: 'none', duration: 0 },
            exit: { type: 'none', duration: 0 },
            ...(cameraKind === 'spatial'
              ? {
                  perspective: {
                    enabled: true,
                    rotateX: 12,
                    rotateY: -18,
                    rotateZ: 5,
                    strength: 0.7,
                  },
                }
              : {}),
          },
        ];
      if (combinedBorders) {
        scene.zoomRegions = [
          ...scene.zoomRegions,
          ...(['solid', 'dashed', 'dotted'] as const).map((style, index) => ({
            ...createQuickEditZoomRegion({
              id: `combined-${style}`,
              at: 0,
              duration: 8,
              endMax: 8,
            }),
            enter: {
              type: style === 'solid' ? ('linear' as const) : ('none' as const),
              duration: style === 'solid' ? 4 : 0,
            },
            exit: { type: 'none' as const, duration: 0 },
            border: {
              ...createQuickEditBorder(),
              style,
              reveal: 'draw' as const,
              loop: true,
              segmentPercent: 35,
              color: '#ff880080',
              area: { x: 0.2 + index * 0.06, y: 0.15 + index * 0.06, width: 0.4, height: 0.4 },
            },
          })),
        ];
      }
      if (clock === 'cut-speed')
        scene.annotationEffects!.segments = [
          { sourceStart: 0, sourceEnd: 2, resultStart: 0, resultEnd: 2, kind: 'keep', rate: 1 },
          { sourceStart: 2, sourceEnd: 4, resultStart: 2, resultEnd: 2, kind: 'cut', rate: 1 },
          { sourceStart: 4, sourceEnd: 8, resultStart: 2, resultEnd: 4, kind: 'speed', rate: 2 },
          { sourceStart: 8, sourceEnd: 12, resultStart: 4, resultEnd: 8, kind: 'keep', rate: 1 },
        ];
      const resultTime = 2.5,
        sourceTime = clock === 'keep' ? resultTime : 5;
      const camera = evaluateQuickEditCameraAtTime(scene.zoomRegions, resultTime);
      const decoded = await sink.getSample(sourceTime);
      if (!decoded) throw new Error('Parity decoded frame unavailable');
      const sample = {
        timestamp: decoded.timestamp,
        backing: sourceSize,
        draw: decoded.draw.bind(decoded),
      };
      const owner = managed(scene, size);
      const renderer = createReviewPreviewRenderer({
        resources: owner.resources,
        allocation: owner.allocation,
      });
      let exportedMain: Awaited<ReturnType<typeof createReviewPresentationMain>> | undefined;
      let spatial: ReturnType<typeof createReviewSpatialRenderer> | undefined;
      try {
        const signal = new AbortController().signal;
        const prepared = await renderer.prepare(scene, { canonical: size, backing: size }, signal);
        owner.admit(prepared);
        const actual = await renderer.render(prepared, {
          generation: 1,
          source: sample,
          sourceTime,
          resultTime,
          fps: 30,
        });
        const actualCopy = surface(size);
        actualCopy.getContext('2d')!.drawImage(actual.canvas, 0, 0);
        actual.release();
        renderer.dispose();
        const expected = surface(size),
          plain = surface(size);
        const layout = computeQuickEditSceneLayout({
          source: sourceSize,
          canvas: size,
          output: size,
          background: scene.background,
          camera,
        });
        if (layout.spatial) spatial = createReviewSpatialRenderer(undefined, owner.resources);
        const frame = {
          canvas: expected,
          layout,
          background: scene.background,
          image: null,
          headerImage: null,
          sample,
          sourceTime,
          resultTime,
          cameraScale: camera.scale,
          sceneScale: 1,
          deferComments: true,
          comments: [],
          resources: owner.resources,
        };
        drawReviewSceneFrame(plain.getContext('2d')!, {
          ...frame,
          canvas: plain,
          spatialRenderer: spatial,
        });
        const advanced = createQuickEditAdvancedState();
        advanced.ui.mode = 'advanced';
        advanced.ui.tracks.zoom = true;
        advanced.canvas = size;
        advanced.background = scene.background;
        advanced.zoom = {
          ...advanced.zoom,
          enabled: scene.zoomRegions.length > 0,
          regions: scene.zoomRegions,
        };
        advanced.annotationEffects = scene.annotationEffects!.lane;
        const edits: ReviewEdit[] =
          clock === 'keep'
            ? []
            : [
                { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
                {
                  id: 'speed',
                  kind: 'speed',
                  start: 4,
                  end: 8,
                  requestedStart: 4,
                  requestedEnd: 8,
                  rate: 2,
                  audio: 'speed',
                },
              ];
        const effective = resolveQuickEditEffectiveState(advanced);
        if (effective.zoomApplied !== scene.zoomRegions.length > 0)
          throw new Error('Parity camera gate does not match the scene.');
        exportedMain = await createReviewPresentationMain({
          file,
          index,
          edits,
          effective,
          fragmentOffset: 0,
          dimensions: { canonical: size, backing: size },
          captionTimeMap: scene.annotationEffects!.segments,
          effectSnapshots: scene.annotationEffects!.snapshots,
          fps: 30,
          readAsset: async () => null,
          signal,
        });
        const exported = await exportedMain.renderAtTime(resultTime);
        try {
          expected.getContext('2d')!.drawImage(exported.canvas, 0, 0);
        } finally {
          exported.release();
        }
        const parity = compare(actualCopy, expected),
          witness = compare(expected, plain);
        const row = document.createElement('div');
        row.style.cssText =
          'display:grid;grid-template-columns:repeat(3,320px);gap:8px;margin:8px 0';
        const caption = document.createElement('span');
        caption.style.gridColumn = '1 / -1';
        caption.textContent = `${plane} ${cameraKind} ${clock}: plain / export / preview`;
        row.append(caption);
        for (const canvas of [plain, expected, actualCopy]) {
          const copy = surface(size);
          copy.getContext('2d')!.drawImage(canvas, 0, 0);
          copy.style.width = '320px';
          row.append(copy);
        }
        document.body.append(row);
        results.push({ plane, camera: cameraKind, clock, parity, witness });
      } finally {
        decoded.close();
        exportedMain?.dispose();
        spatial?.dispose();
        renderer.dispose();
        owner.resources.dispose();
      }
    }
    return results;
  } finally {
    input.dispose();
  }
}

async function encodedSource(
  options: { size?: Size; duration?: number; fps?: number; pattern?: boolean } = {}
) {
  const target = new BufferTarget();
  const output = new Output({ target, format: new WebMOutputFormat() });
  const video = new VideoSampleSource({ codec: 'vp8', bitrate: 1_000_000 });
  const fps = options.fps ?? 30;
  const size = options.size ?? { width: 160, height: 90 };
  output.addVideoTrack(video, { frameRate: fps });
  const canvas = surface(size);
  canvas.getContext('2d')!.fillStyle = '#12394a';
  canvas.getContext('2d')!.fillRect(0, 0, size.width, size.height);
  if (options.pattern) source().draw(canvas.getContext('2d')!, 0, 0, size.width, size.height);
  await output.start();
  for (let frame = 0; frame < fps * (options.duration ?? 4); frame++) {
    const sample = new VideoSample(canvas, { timestamp: frame / fps, duration: 1 / fps });
    try {
      await video.add(sample);
    } finally {
      sample.close();
    }
  }
  video.close();
  await output.finalize();
  return new Blob([target.buffer!], { type: 'video/webm' });
}

function annotationExportScene(
  defs: Awaited<ReturnType<typeof definitions>>,
  size: Size,
  converted: boolean
) {
  const scene = fixture(defs, 2, size, 'viewport');
  for (const [i, instance] of scene.annotationEffects!.lane.instances.entries()) {
    instance.end = 4;
    instance.attachment = i === 0 ? 'content' : 'viewport';
  }
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.zoom = true;
  advanced.canvas = size;
  advanced.annotationEffects = scene.annotationEffects!.lane;

  if (converted) {
    const region = {
      ...createQuickEditZoomRegion({ id: 'conversion', at: 0, duration: 4, endMax: 4 }),
      enter: { type: 'none' as const, duration: 0 },
      exit: { type: 'none' as const, duration: 0 },
      perspective: {
        ...DEFAULT_QUICK_EDIT_PERSPECTIVE,
        enabled: true,
        rotateX: 15,
        rotateY: -30,
        rotateZ: 5,
      },
    };
    scene.zoomRegions = [region];
    advanced.zoom = { ...advanced.zoom, enabled: true, regions: scene.zoomRegions };
    const geometry = createReviewAnnotationGeometry({
      source: sourceSize,
      canvas: size,
      output: size,
      background: scene.background,
      camera: quickEditSpatialTargetCamera(region),
    });
    if (!geometry) throw new Error('Converted fixture geometry unavailable');
    scene.annotationEffects!.lane.instances = scene.annotationEffects!.lane.instances.map(
      (instance) => {
        const next = convertReviewAnnotationAttachment(
          instance,
          instance.attachment === 'content' ? 'viewport' : 'content',
          geometry
        );
        if (!next) throw new Error('Converted fixture attachment unavailable');
        return next;
      }
    );
  }
  return { scene, advanced };
}

function createExportWitness(size: Size, targetTime: number) {
  return {
    targetTime,
    expected: surface(size),
    actual: surface(size),
    capturedTime: undefined as number | undefined,
    decodedTime: undefined as number | undefined,
  };
}

async function styledPreviewMarkerRows(
  scene: Scene,
  source: { file: Blob; size: Size },
  edits: readonly ReviewEdit[],
  times: readonly number[],
  fps: number,
  signal: AbortSignal
) {
  const clock = createReviewTimeMap(4, edits);
  const size = scene.canvas;
  const preview = {
    ...scene,
    source: source.size,
    annotationEffects: {
      ...scene.annotationEffects!,
      segments: clock.getSegments(),
    },
  };
  const owner = managed(preview, size);
  const renderer = createReviewPreviewRenderer({
    resources: owner.resources,
    allocation: owner.allocation,
    renderer: 'gpu',
  });
  const input = new Input({ source: new BlobSource(source.file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Styled preview source video unavailable');
    const sink = new VideoSampleSink(track);
    const prepared = await renderer.prepare(preview, { canonical: size, backing: size }, signal);
    owner.admit(prepared);
    const frames = [];
    for (const [index, resultTime] of times.entries()) {
      const sourceTime = clock.timelineToSource(resultTime);
      const sample = sourceTime === null ? null : await sink.getSample(sourceTime);
      if (!sample || sourceTime === null)
        throw new Error('Styled preview source frame unavailable');
      try {
        const paint = {
          timestamp: sample.timestamp,
          backing: source.size,
          draw: sample.draw.bind(sample),
        };
        const request = { generation: index * 2, fps, sourceTime, resultTime };
        const canvas = await renderer.render(prepared, { ...request, source: paint }, signal);
        let canvasRows;
        try {
          canvasRows = styledMarkerRows(canvas.canvas);
        } finally {
          canvas.release();
        }

        const raw = sample.toVideoFrame();
        try {
          const gpu = await renderer.render(
            prepared,
            {
              ...request,
              generation: request.generation + 1,
              source: { ...paint, videoFrame: () => raw },
            },
            signal
          );
          try {
            const copy = surface(size);
            copy.getContext('2d')!.drawImage(gpu.canvas, 0, 0);
            frames.push({
              resultTime,
              backend: gpu.renderer.backend,
              canvas: canvasRows,
              gpu: styledMarkerRows(copy),
            });
          } finally {
            gpu.release();
          }
        } finally {
          raw.close();
        }
      } finally {
        sample.close();
      }
    }
    return frames;
  } finally {
    renderer.dispose();
    owner.resources.dispose();
    input.dispose();
  }
}

/** Actual frame exporter, probed codecs, muxed files and decoded witnesses for full and fragment clocks. */
export async function exportProbe(
  format: 'mp4' | 'webm',
  converted: boolean,
  nativeText: boolean | 'styles'
) {
  const defs = nativeText ? [] : await definitions();
  const inputSize = { width: 160, height: 90 };
  const file = await encodedSource({ size: inputSize });
  const signal = new AbortController().signal;
  const index = await inspectReviewMedia(file, signal);
  const size = { width: 640, height: 360 };
  const fullEdits: ReviewEdit[] = [
    { id: 'cut', kind: 'cut', start: 1, end: 2, requestedStart: 1, requestedEnd: 2 },
    {
      id: 'speed',
      kind: 'speed',
      start: 2,
      end: 4,
      requestedStart: 2,
      requestedEnd: 4,
      rate: 2,
      audio: 'mute',
    },
  ];
  // The styles fragment starts on the same 30 fps grid as the full export.
  const fragmentStart = nativeText === 'styles' ? 2.4 : 2.5;
  const fragmentEnd = fragmentStart + 1;
  const fragments: ReviewEdit[] = [
    {
      id: 'before',
      kind: 'cut',
      start: 0,
      end: fragmentStart,
      requestedStart: 0,
      requestedEnd: fragmentStart,
    },
    {
      id: 'speed',
      kind: 'speed',
      start: fragmentStart,
      end: fragmentEnd,
      requestedStart: fragmentStart,
      requestedEnd: fragmentEnd,
      rate: 2,
      audio: 'mute',
    },
    {
      id: 'after',
      kind: 'cut',
      start: fragmentEnd,
      end: 4,
      requestedStart: fragmentEnd,
      requestedEnd: 4,
    },
  ];
  if (nativeText === 'styles') prepareStyledTextWitness(2);
  const results = [];
  const variants =
    nativeText === 'styles'
      ? (['full', 'fragment'] as const)
      : (['full', 'fragment', 'presentation'] as const);
  const frameRate = 30;
  const styledTimes = { cascade: 42 / frameRate, hold: 49 / frameRate };
  const codec = index.outputCodecs?.[format][0];
  if (!codec) throw new Error(`Required native ${format} encoder unavailable`);
  for (const variant of variants) {
    const fragment = variant === 'fragment';
    const presentation = variant === 'presentation';
    const { scene, advanced } = annotationExportScene(defs, size, converted);
    if (nativeText === 'styles') {
      scene.annotationEffects!.lane.textClips = REVIEW_TEXT_TEMPLATE_IDS.map((style, order) => {
        const clip = applyReviewTextTemplate(
          createReviewAnnotationTextClip(
            style,
            style === 'marker' ? 'Новый кадр\nТитр' : 'Новый кадр\nSniptale',
            style === 'marker' ? 1.2 : 0.4,
            1.95,
            order
          ),
          reviewBuiltinTextTemplates[style]
        );
        const column = order % 3;
        const row = Math.floor(order / 3);
        clip.transform = {
          x: column / 3 + 0.035,
          y: row * 0.45 + 0.08,
          width: 0.262,
          height: 0.36,
          rotation: (order - 2) * 0.04,
        };
        clip.fontSize *= 0.7;
        if (style === 'marker' && clip.appearance) {
          clip.appearance.weight = 800;
          clip.appearance.outline = { enabled: true, color: '#fffafa', opacity: 1, width: 0.07 };
        }
        return clip;
      });
    } else if (nativeText) {
      const title = createReviewAnnotationTextClip('text', 'Новый титр 👩🏽‍💻', 0.95, 1.8, 0);
      title.entrance = { ...title.entrance, preset: 'cascade', duration: 0.4 };
      title.loop.preset = 'shine';
      title.exit = { ...title.exit, preset: 'fade', duration: 0.3 };
      scene.annotationEffects!.lane.textClips = [title];
    }
    let bookend: Blob | null = null;
    if (presentation) {
      const card = surface(size);
      card.getContext('2d')!.fillStyle = '#4261a3';
      card.getContext('2d')!.fillRect(0, 0, size.width, size.height);
      bookend = await new Promise<Blob>((resolve, reject) =>
        card.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Bookend PNG unavailable'))),
          'image/png'
        )
      );
      const settings = createNeutralPresentationSettings();
      const image = {
        assetId: 'native-bookend',
        width: size.width,
        height: size.height,
        duration: 0.5,
        fit: 'contain' as const,
        fillColor: '#000000ff',
        crop: { panX: 0, panY: 0 },
      };
      settings.intro = { mode: 'image', image };
      settings.outro = { mode: 'image', image };
      advanced.presentation = settings;
    }
    const args = {
      file,
      index,
      advanced,
      edits: fragment ? fragments : fullEdits,
      captionTimeMap: buildReviewTimeMap(4, fullEdits),
      fragmentOffset: fragment ? fragmentStart / 2 : 0,
      effectSnapshots: scene.annotationEffects!.snapshots,
      readProjectAsset: async (id: string) => (id === 'native-bookend' ? bookend : null),
      renderSettings: { format, codec, frameRate, quality: 'HIGH' as const },
      signal,
    };
    const holdTime = fragment ? 0.2 : presentation ? 1.7 : 1.2;
    const hold = createExportWitness(
      size,
      nativeText === 'styles' ? styledTimes.hold - args.fragmentOffset : holdTime
    );
    const cascade =
      nativeText === 'styles'
        ? createExportWitness(size, styledTimes.cascade - args.fragmentOffset)
        : undefined;
    const witnesses = cascade ? [cascade, hold] : [hold];
    const previews = cascade
      ? await styledPreviewMarkerRows(
          scene,
          { file, size: inputSize },
          fullEdits,
          [styledTimes.cascade, styledTimes.hold],
          frameRate,
          signal
        )
      : undefined;
    const forbidWrite = {
      writeAt: async () => {
        throw new Error('Frame probe must not mux');
      },
    };
    await writeReviewFrames({
      ...args,
      writer: forbidWrite,
      frameProbe: {
        add: async (sample) => {
          for (const witness of witnesses) {
            if (witness.capturedTime !== undefined || sample.timestamp < witness.targetTime - 1e-8)
              continue;
            sample.draw(witness.expected.getContext('2d')!, 0, 0, size.width, size.height);
            witness.capturedTime = sample.timestamp;
          }
        },
      },
    });
    if (witnesses.some((witness) => witness.capturedTime === undefined))
      throw new Error('Export witness frame absent');
    let bytes = new Uint8Array(0);
    const writer = {
      writeAt: async (position: number, chunk: Blob) => {
        const part = new Uint8Array(await chunk.arrayBuffer());
        if (position + part.length > bytes.length) {
          const next = new Uint8Array(position + part.length);
          next.set(bytes);
          bytes = next;
        }
        bytes.set(part, position);
      },
    };
    await writeReviewFrames({ ...args, writer });
    const input = new Input({ source: new BlobSource(new Blob([bytes])), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error('Encoded annotation video absent');
      let decodedFrames = 0,
        lastDecodedTime = 0;
      for await (const sample of new VideoSampleSink(track).samples()) {
        try {
          decodedFrames++;
          lastDecodedTime = sample.timestamp;
          for (const witness of witnesses) {
            if (
              witness.decodedTime !== undefined ||
              sample.timestamp < witness.capturedTime! - 1e-5
            )
              continue;
            sample.draw(witness.actual.getContext('2d')!, 0, 0, size.width, size.height);
            witness.decodedTime = sample.timestamp;
          }
        } finally {
          sample.close();
        }
      }
      if (witnesses.some((witness) => witness.decodedTime === undefined))
        throw new Error('Encoded witness timestamp absent');
      const { expected, actual, capturedTime, decodedTime } = hold;
      const reference = expected.getContext('2d')!.getImageData(0, 0, size.width, size.height).data;
      const decoded = actual.getContext('2d')!.getImageData(0, 0, size.width, size.height).data;
      let absoluteDifference = 0,
        witnessPixels = 0;
      for (let p = 0; p < reference.length; p += 4) {
        for (let c = 0; c < 3; c++)
          absoluteDifference += Math.abs(reference[p + c]! - decoded[p + c]!);
        if (
          Math.abs(reference[p]! - 18) +
            Math.abs(reference[p + 1]! - 57) +
            Math.abs(reference[p + 2]! - 74) >
          40
        )
          witnessPixels++;
      }
      if (nativeText === 'styles')
        appendStyledTextWitness(
          actual,
          `${format.toUpperCase()} · ${variant} · ${decodedTime!.toFixed(2)} s`
        );
      results.push({
        format,
        codec,
        frameRate,
        fragment,
        presentation,
        bytes: bytes.byteLength,
        capturedTime: capturedTime!,
        decodedTime: decodedTime!,
        meanRgbDifference: absoluteDifference / (size.width * size.height * 3),
        witnessPixels,
        visibleStyles: nativeText === 'styles' ? styledExportCells(actual) : undefined,
        marker: cascade
          ? {
              rendered: styledMarkerRows(expected),
              decoded: styledMarkerRows(actual),
              resultTime: capturedTime! + args.fragmentOffset,
              preview: previews![1]!,
              cascade: {
                rendered: styledMarkerRows(cascade.expected),
                decoded: styledMarkerRows(cascade.actual),
                capturedTime: cascade.capturedTime!,
                decodedTime: cascade.decodedTime!,
                resultTime: cascade.capturedTime! + args.fragmentOffset,
                preview: previews![0]!,
              },
            }
          : undefined,
        duration: await input.computeDuration(),
        metadataDuration: await input.getDurationFromMetadata(),
        decodedFrames,
        lastDecodedTime,
      });
    } finally {
      input.dispose();
    }
  }
  return results;
}

/** Native batch refuses overlap and an exhausted managed budget without losing authored state. */
export async function resourceFailureProbe() {
  const defs = await definitions();
  const size = { width: 960, height: 540 };
  const scene = fixture(defs, 6, size, 'viewport');
  const before = JSON.stringify(scene.annotationEffects);
  const annotations = {
    ...scene.annotationEffects!,
    planes: { content: sourceSize, viewport: size },
  };
  const density = { content: { width: 1, height: 1 }, viewport: { width: 1, height: 1 } };
  const sourceBytes = reviewAnnotationPreparationBytes(annotations);
  const outputBytes = annotations.lane.instances.reduce((sum, instance, index) => {
    const planned = planReviewAnnotationFrame({
      snapshot: defs[index]!.snapshot,
      document: defs[index]!.document,
      instance,
      segments: annotations.segments,
      time: 2,
      plane: size,
      density: density.viewport,
      fps: 30,
    });
    if (!planned) throw new Error('Native annotation plan absent');
    return sum + planned.plan.renderDimensions.width * planned.plan.renderDimensions.height * 4;
  }, 0);
  const exactBudget = sourceBytes + outputBytes;
  const resources = createPreviewRenderResources({
    maximumManagedBytes: exactBudget - 1,
    maximumCanvases: 1,
  });
  const signal = new AbortController().signal;
  const renderer = await createReviewAnnotationRenderer(annotations, {
    resources,
    readAsset: async () => null,
    signal,
  });
  let exhaustion = '',
    overlap = '',
    heldBatch = '';
  let afterFailure = 0,
    admittedPeak = 0;
  try {
    try {
      const unexpected = await renderer.render(2, density, 30, signal);
      unexpected.release();
    } catch (error) {
      exhaustion = error instanceof Error ? error.name : 'Unknown';
    }
    afterFailure = resources.counters.managedBytes;
    // The first budget deliberately removes one byte from the computed exact phase.
    // Recovery restores that phase, rather than raising the product resource ceiling.
    resources.replaceLimits({ maximumManagedBytes: exactBudget, maximumCanvases: 1 });
    const pending = renderer.render(2, density, 30, signal);
    try {
      const unexpected = await renderer.render(2, density, 30, signal);
      unexpected.release();
    } catch (error) {
      overlap = error instanceof Error ? error.message : 'Unknown';
    }
    const batch = await pending;
    try {
      admittedPeak = renderer.counters().liveDecodedRasterBytes;
      try {
        const unexpected = await renderer.render(2, density, 30, signal);
        unexpected.release();
      } catch (error) {
        heldBatch = error instanceof Error ? error.message : 'Unknown';
      }
    } finally {
      batch.release();
    }
    const recovered = await renderer.render(2.1, density, 30, signal);
    recovered.release();
  } finally {
    renderer.dispose();
    resources.dispose();
  }
  return {
    exhaustion,
    overlap,
    heldBatch,
    sourceBytes,
    outputBytes,
    exactBudget,
    afterFailure,
    admittedPeak,
    resources: resources.counters,
    authoredUnchanged: before === JSON.stringify(scene.annotationEffects),
  };
}

function brightTextBounds(canvas: HTMLCanvasElement, threshold = 140) {
  const { width, height } = canvas;
  const raster = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let pixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (
        raster[offset]! < threshold ||
        raster[offset + 1]! < threshold ||
        raster[offset + 2]! < threshold - 15
      )
        continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      pixels++;
    }
  }
  return { bounds: [left, top, right, bottom], pixels };
}

export async function textCutClockProbe() {
  const size = { width: 640, height: 360 };
  const signal = new AbortController().signal;
  const sourceCanvas = surface(size);
  const context = sourceCanvas.getContext('2d')!;
  context.fillStyle = '#000';
  context.fillRect(0, 0, size.width, size.height);
  const sample = (timestamp: number) => ({
    timestamp,
    draw: (target: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) =>
      target.drawImage(sourceCanvas, x, y, width, height),
    toVideoFrame: () => new VideoFrame(sourceCanvas, { timestamp: timestamp * 1e6 }),
    close: () => {},
  });
  const frames = { left: sample(1.9), right: sample(4) };
  const staticTitle = createReviewAnnotationTextClip('fixed', 'Title', 0.5, 3, 0);
  staticTitle.transform = { ...staticTitle.transform, x: 0.55, y: 0.2, width: 0.35 };
  const scenes = [
    {
      clip: createReviewAnnotationTextClip('end', 'Title', 0.5, 2, 0),
      visible: [true, false, false],
      mode: 'dissolve',
    },
    {
      clip: createReviewAnnotationTextClip('start', 'Title', 2, 3, 0),
      visible: [false, true, true],
      mode: 'dissolve',
    },
    { clip: staticTitle, visible: [true, true, true], mode: 'reference' },
    { clip: staticTitle, visible: [true, true, true], mode: 'gl' },
    { clip: staticTitle, visible: [true, true, true], mode: 'split' },
  ] as const;
  const results = [];
  for (const { clip, visible, mode } of scenes) {
    const scene = fixture([], 0, size, 'viewport');
    scene.source = size;
    scene.annotationEffects!.lane.textClips = [clip];
    if (mode === 'split') {
      scene.webcam = {
        ...createQuickEditWebcam('camera', size, size),
        split: 'left',
        screenBehavior: 'shrink',
      };
    }
    const owner = managed(scene, size);
    const renderer = createReviewPreviewRenderer({
      resources: owner.resources,
      allocation: owner.allocation,
      renderer: 'gpu',
    });
    const prepared = await renderer.prepare(scene, { canonical: size, backing: size }, signal);
    try {
      for (const [index, time] of [1.95, 2, 2.05].entries()) {
        const moving = sample(time < 2 ? time : time + 2);
        const source = { timestamp: moving.timestamp, backing: size, draw: moving.draw };
        const blend = reviewCutTransitionAt(time, [
          {
            id: 'cut',
            ...(mode === 'gl'
              ? {
                  type: 'gl',
                  selection: createGlTransitionSelection('DirectionalEased')!,
                  easing: 'LINEAR',
                }
              : { type: 'dissolve' }),
            seam: 2,
            before: 0.5,
            after: 0.5,
            left: { start: 0, end: 2 },
            right: { start: 4, end: 6 },
          },
        ])!;
        const request = { generation: index * 2, resultTime: time, sourceTime: moving.timestamp };
        const raw = moving.toVideoFrame();
        try {
          const transition = mode === 'dissolve' || mode === 'gl' ? { blend, frames } : undefined;
          const camera = scene.webcam
            ? {
                representedMediaTime: moving.timestamp,
                generation: index,
                source: size,
                placement: quickEditWebcamPlacementAt(scene.webcam, moving.timestamp),
                drawable: { draw: moving.draw, videoFrame: () => raw },
              }
            : undefined;
          const canvas = await renderer.render(
            prepared,
            {
              ...request,
              source,
              ...(transition ? { transition } : {}),
              ...(camera ? { camera } : {}),
            },
            signal
          );
          const canvasBounds = brightTextBounds(canvas.canvas, 45);
          canvas.release();
          const gpu = await renderer.render(
            prepared,
            {
              ...request,
              generation: request.generation + 1,
              source: { ...source, videoFrame: () => raw },
              ...(transition ? { transition } : {}),
              ...(camera ? { camera } : {}),
            },
            signal
          );
          try {
            results.push({
              time,
              clip: clip.id,
              mode,
              visible: visible[index],
              canvas: canvasBounds,
              gpu: brightTextBounds(gpu.canvas, 45),
              backend: gpu.renderer.backend,
            });
          } finally {
            gpu.release();
          }
        } finally {
          raw.close();
        }
      }
    } finally {
      prepared.release();
      renderer.dispose();
      owner.resources.dispose();
    }
  }
  return results;
}

function markerRows(
  canvas: HTMLCanvasElement,
  bounds = { left: 0, top: 0, right: canvas.width, bottom: canvas.height }
) {
  const { width, height } = canvas;
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  const bands: { left: number; right: number; top: number; bottom: number }[] = [];
  for (let y = bounds.top; y < bounds.bottom; y++) {
    let left = width;
    let right = -1;
    for (let x = bounds.left; x < bounds.right; x++) {
      const index = (y * width + x) * 4;
      if (pixels[index]! < 205 || pixels[index + 1]! < 172 || pixels[index + 2]! > 155) continue;
      left = Math.min(left, x);
      right = x;
    }
    if (right - left < 5) continue;
    const last = bands.at(-1);
    if (last && y === last.bottom + 1) {
      last.left = Math.min(last.left, left);
      last.right = Math.max(last.right, right);
      last.bottom = y;
    } else bands.push({ left, right, top: y, bottom: y });
  }
  return bands;
}

function styledMarkerRows(canvas: HTMLCanvasElement) {
  // The marker occupies the upper-right cell. Keep the other titles out of its color mask.
  return markerRows(canvas, {
    left: Math.floor((canvas.width * 2) / 3),
    top: 0,
    right: canvas.width,
    bottom: Math.floor(canvas.height / 2),
  });
}

function styledExportCells(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')!;
  return REVIEW_TEXT_TEMPLATE_IDS.map((_, index) => {
    const left = Math.floor(((index % 3) * canvas.width) / 3);
    const top = Math.floor((Math.floor(index / 3) * canvas.height) / 2);
    const data = context.getImageData(
      left,
      top,
      Math.floor(canvas.width / 3),
      canvas.height / 2
    ).data;
    let count = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      const difference =
        Math.abs(data[offset]! - 18) +
        Math.abs(data[offset + 1]! - 57) +
        Math.abs(data[offset + 2]! - 74);
      if (difference > 180) count++;
    }
    return count;
  });
}

function prepareStyledTextWitness(columns: number) {
  const witness = document.createElement('section');
  witness.dataset['styledTitleWitness'] = '';
  witness.style.cssText = [
    'position:fixed; inset:0; z-index:10000; padding:16px',
    'background:#191b20; color:white; display:grid',
    `grid-template-columns:repeat(${columns},minmax(0,1fr)); align-content:start; gap:12px`,
  ].join('; ');
  document.body.append(witness);
}

function appendStyledTextWitness(scene: HTMLCanvasElement, title: string) {
  const figure = document.createElement('figure');
  const caption = document.createElement('figcaption');
  caption.textContent = title;
  scene.style.width = '100%';
  figure.style.margin = '0';
  figure.append(scene, caption);
  document.querySelector('[data-styled-title-witness]')?.append(figure);
}

/** The same typography and composition with all built-ins over three kinds of footage. */
export async function textStyleContactSheet() {
  const size = { width: 640, height: 360 };
  const clips = REVIEW_TEXT_TEMPLATE_IDS.map((style, order) =>
    applyReviewTextTemplate(
      createReviewAnnotationTextClip(style, 'Новый кадр\nСделано в Gallery', 0, 3, order),
      reviewBuiltinTextTemplates[style]
    )
  );
  const signal = new AbortController().signal;
  await prepareReviewAnnotationTextFonts(clips, signal);
  prepareStyledTextWitness(6);
  const backgrounds = ['#f4ecdf', '#12394a', 'pattern'];
  for (const background of backgrounds) {
    for (const clip of clips) {
      const canvas = surface(size);
      const context = canvas.getContext('2d')!;
      if (background === 'pattern') source().draw(context, 0, 0, size.width, size.height);
      else {
        context.fillStyle = background;
        context.fillRect(0, 0, size.width, size.height);
      }
      drawReviewAnnotationText(context, clip, 1.25, size, size);
      appendStyledTextWitness(canvas, clip.id);
    }
  }
  return clips.map((clip) => reviewAnnotationTextFont(clip.appearance!, 24));
}

/** Sample reveal, hold and exit in actual Canvas, WebGPU and both export clocks. */
export async function textClockProbe(styled = false) {
  if (styled) prepareStyledTextWitness(3);
  const size = { width: 640, height: 360 };
  const inputSize = { width: 160, height: 90 };
  const signal = new AbortController().signal;
  const file = await encodedSource();
  const index = await inspectReviewMedia(file, signal);
  const fullEdits: ReviewEdit[] = [
    { id: 'head', kind: 'cut', start: 0, end: 0.5, requestedStart: 0, requestedEnd: 0.5 },
  ];
  const fragments: ReviewEdit[] = [
    { id: 'head', kind: 'cut', start: 0, end: 0.75, requestedStart: 0, requestedEnd: 0.75 },
  ];
  const segments = buildReviewTimeMap(4, fullEdits);
  const base = createReviewAnnotationTextClip(
    'text',
    styled ? 'Проверяем стиль\nКадр' : 'А Новый титр 👩🏽‍💻',
    0.25,
    1.9,
    0
  );
  const title = styled ? applyReviewTextTemplate(base, reviewBuiltinTextTemplates.marker) : base;
  title.entrance = { ...title.entrance, duration: 0.45, preset: 'cascade' };
  title.loop = { ...title.loop, preset: styled ? 'none' : 'shine', period: 1.2 };
  title.exit = { ...title.exit, duration: 0.45, preset: 'fade' };
  if (title.appearance) {
    title.appearance.weight = 800;
    title.appearance.outline = { enabled: true, color: '#fffafa', opacity: 1, width: 0.07 };
    title.fontSize = 0.105;
  }
  const scene: Scene = {
    ...fixture([], 0, size, 'viewport'),
    source: inputSize,
    annotationEffects: {
      lane: { enabled: true, instances: [], textClips: [title] },
      snapshots: [],
      segments,
    },
  };
  const owner = managed(scene, size);
  const renderer = createReviewPreviewRenderer({
    resources: owner.resources,
    allocation: owner.allocation,
    renderer: 'gpu',
  });
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.canvas = size;
  advanced.annotationEffects = scene.annotationEffects!.lane;
  const settings = {
    file,
    index,
    signal,
    fps: 30,
    effective: resolveQuickEditEffectiveState(advanced),
    dimensions: { canonical: size, backing: size },
    captionTimeMap: segments,
    readAsset: async () => null,
  };
  const full = await createReviewPresentationMain({
    ...settings,
    edits: fullEdits,
    fragmentOffset: 0,
  });
  const fragment = await createReviewPresentationMain({
    ...settings,
    edits: fragments,
    fragmentOffset: 0.25,
  });
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Text proof source is unavailable');
    const sink = new VideoSampleSink(track);
    const prepared = await renderer.prepare(scene, settings.dimensions, signal);
    owner.admit(prepared);
    const results = [];
    for (const [generation, time] of (styled ? [0.44, 1.3, 1.59] : [0.54, 1.3, 1.59]).entries()) {
      const sourceTime = time + 0.5;
      const sample = await sink.getSample(sourceTime);
      if (!sample) throw new Error('Text proof frame is unavailable');
      const raw = sample.toVideoFrame();
      const paint = {
        timestamp: sample.timestamp,
        backing: inputSize,
        draw: sample.draw.bind(sample),
      };
      const request = { generation: generation * 2, fps: 30, sourceTime, resultTime: time };
      try {
        const canvas = await renderer.render(prepared, { ...request, source: paint }, signal);
        const expected = surface(size);
        expected.getContext('2d')!.drawImage(canvas.canvas, 0, 0);
        canvas.release();
        const gpu = await renderer.render(
          prepared,
          {
            ...request,
            generation: request.generation + 1,
            source: { ...paint, videoFrame: () => raw },
          },
          signal
        );
        try {
          const gpuCopy = surface(size);
          gpuCopy.getContext('2d')!.drawImage(gpu.canvas, 0, 0);
          const fullFrame = await full.renderAtTime(time);
          const fragmentFrame = await fragment.renderAtTime(time - 0.25);
          try {
            if (styled && generation < 2) {
              const exported = surface(size);
              exported.getContext('2d')!.drawImage(fragmentFrame.canvas, 0, 0);
              appendStyledTextWitness(expected, `Canvas · ${time.toFixed(2)} s`);
              appendStyledTextWitness(gpuCopy, `WebGPU · ${time.toFixed(2)} s`);
              appendStyledTextWitness(exported, `Fragment output · ${time.toFixed(2)} s`);
            }
            results.push({
              time,
              backend: gpu.renderer.backend,
              marker: styled
                ? {
                    canvas: markerRows(expected),
                    gpu: markerRows(gpuCopy),
                  }
                : undefined,
              canvas: brightTextBounds(expected),
              gpu: brightTextBounds(gpuCopy),
              full: compare(expected, fullFrame.canvas),
              fragment: compare(expected, fragmentFrame.canvas),
            });
          } finally {
            fullFrame.release();
            fragmentFrame.release();
          }
        } finally {
          gpu.release();
        }
      } finally {
        raw.close();
        sample.close();
      }
    }
    return results;
  } finally {
    renderer.dispose();
    owner.resources.dispose();
    full.dispose();
    fragment.dispose();
    input.dispose();
  }
}
