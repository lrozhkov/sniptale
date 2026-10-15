import {
  createReviewAnnotationGeometry,
  convertReviewAnnotationAttachment,
} from '../../../../apps/extension/src/gallery/video-review/annotation-effects-geometry';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';
import {
  DEFAULT_QUICK_EDIT_PERSPECTIVE,
  quickEditSpatialTargetCamera,
} from '../../../../apps/extension/src/features/video/review/advanced/spatial';
import {
  sha256EffectV1Bytes,
  resolveEffectV1ControlDefault,
  validateEffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import type { ReviewAnnotationEffectSnapshot } from '../../../../apps/extension/src/features/video/review/annotation-effects/types';
import { initializeReviewAnnotationEffectAnchors } from '../../../../apps/extension/src/features/video/review/annotation-effects/layout';
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
import { createReviewSpatialRenderer } from '../../../../apps/extension/src/workflows/video-review/spatial-renderer';
import { drawReviewSceneFrame } from '../../../../apps/extension/src/workflows/video-review/scene-frame';
import { drawReviewSceneOverlays } from '../../../../apps/extension/src/workflows/video-review/render-scene-overlays';
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
import { buildReviewTimeMap } from '../../../../apps/extension/src/features/video/review/timeline';
import type { ReviewEdit } from '../../../../apps/extension/src/features/video/review/types';

type Size = { width: number; height: number };
type Scene = Parameters<ReturnType<typeof createReviewPreviewRenderer>['prepare']>[0];
const sourceSize = { width: 1920, height: 1080 };
const names = ['lower-third', 'title', 'chapters', 'callout', 'frame', 'corners'];

async function definitions() {
  return Promise.all(
    names.map(async (name) => {
      const response = await fetch(
        `/video-effects/effects/annotations/sniptale-${name}/effect.sniptale-effect.json`
      );
      if (!response.ok) throw new Error('Builtin source unavailable');
      const source = await response.text();
      const raw: unknown = JSON.parse(source);
      const result = validateEffectV1Document(raw);
      if (!result.ok || !result.document) throw new Error('Builtin source invalid');
      const bytes = new TextEncoder().encode(source);
      const sha256 = await sha256EffectV1Bytes(bytes);
      const snapshot: ReviewAnnotationEffectSnapshot = {
        id: `effect:${sha256}`,
        sha256,
        schemaVersion: 'sniptale.effect.v1',
        kind: 'standalone',
        documentId: result.document.id,
        source,
        retainedByteLength: bytes.byteLength,
        assets: [],
      };
      return { document: result.document, snapshot };
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
              resolveEffectV1ControlDefault(control, 'en'),
            ])
          );
          const bounds = plane === 'content' ? sourceSize : size;
          const layout = document.objectLayout;
          if (!layout) throw new Error('Builtin object layout unavailable');
          const transform = {
            x: 0.12,
            y: 0.1 + index * 0.08,
            width: layout.width / sourceSize.width,
            height: layout.height / sourceSize.height,
            rotation: 0,
          };
          const anchors = initializeReviewAnnotationEffectAnchors(
            document,
            transform,
            controls,
            bounds
          );
          if (document.id === 'sniptale-callout' && anchors)
            for (const anchor of Object.values(anchors)) {
              anchor.x = 0.9;
              anchor.y = 0.05;
            }
          return {
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
                  !layout.handles?.some(
                    (handle) => handle.xControl === id || handle.yControl === id
                  )
              )
            ),
            ...(anchors ? { anchors } : {}),
          };
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

/** Compare prepared preview with the existing export scene/overlay painters and a plain-frame witness. */
export async function parityProbe() {
  const defs = await definitions();
  const sample = source();
  const size = { width: 960, height: 540 };
  const results = [];
  const cases = (['content', 'viewport'] as const).flatMap((plane) =>
    (['flat', 'zoom', 'spatial'] as const).flatMap((camera) =>
      (['keep', 'cut-speed'] as const).map((clock) => ({ plane, camera, clock }))
    )
  );
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
    const owner = managed(scene, size);
    const renderer = createReviewPreviewRenderer({
      resources: owner.resources,
      allocation: owner.allocation,
    });
    let annotations: Awaited<ReturnType<typeof createReviewAnnotationRenderer>> | undefined;
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
      drawReviewSceneFrame(expected.getContext('2d')!, { ...frame, spatialRenderer: spatial });
      drawReviewSceneFrame(plain.getContext('2d')!, {
        ...frame,
        canvas: plain,
        spatialRenderer: spatial,
      });
      annotations = await createReviewAnnotationRenderer(
        { ...scene.annotationEffects!, planes: { content: sourceSize, viewport: size } },
        {
          resources: owner.resources,
          readAsset: async () => null,
          signal,
        }
      );
      const batch = await annotations.render(
        resultTime,
        {
          content: {
            width: layout.videoTransform.width / sourceSize.width,
            height: layout.videoTransform.height / sourceSize.height,
          },
          viewport: { width: 1, height: 1 },
        },
        30,
        signal
      );
      try {
        drawReviewSceneOverlays({
          scene: frame,
          renderer: spatial,
          context: expected.getContext('2d')!,
          canvas: expected,
          spotlightScratch: null,
          regions: scene.zoomRegions,
          globalResultTime: resultTime,
          cameraScale: camera.scale,
          sourceWidth: sourceSize.width,
          annotationFrames: batch.entries,
        });
      } finally {
        batch.release();
      }
      const parity = compare(actualCopy, expected),
        witness = compare(expected, plain);
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:repeat(3,320px);gap:8px;margin:8px 0';
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
      annotations?.dispose();
      spatial?.dispose();
      renderer.dispose();
      owner.resources.dispose();
    }
  }
  return results;
}

async function encodedSource() {
  const target = new BufferTarget();
  const output = new Output({ target, format: new WebMOutputFormat() });
  const video = new VideoSampleSource({ codec: 'vp8', bitrate: 1_000_000 });
  output.addVideoTrack(video, { frameRate: 30 });
  const canvas = surface({ width: 160, height: 90 });
  canvas.getContext('2d')!.fillStyle = '#12394a';
  canvas.getContext('2d')!.fillRect(0, 0, 160, 90);
  await output.start();
  for (let frame = 0; frame < 120; frame++) {
    const sample = new VideoSample(canvas, { timestamp: frame / 30, duration: 1 / 30 });
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

/** Actual frame exporter, probed codecs, muxed files and decoded witnesses for full and fragment clocks. */
export async function exportProbe(converted = false) {
  const defs = await definitions();
  const file = await encodedSource();
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
  const fragments: ReviewEdit[] = [
    { id: 'before', kind: 'cut', start: 0, end: 2.5, requestedStart: 0, requestedEnd: 2.5 },
    {
      id: 'speed',
      kind: 'speed',
      start: 2.5,
      end: 3.5,
      requestedStart: 2.5,
      requestedEnd: 3.5,
      rate: 2,
      audio: 'mute',
    },
    { id: 'after', kind: 'cut', start: 3.5, end: 4, requestedStart: 3.5, requestedEnd: 4 },
  ];
  const results = [];
  for (const format of ['mp4', 'webm'] as const) {
    const codec = index.outputCodecs?.[format][0];
    if (!codec) throw new Error(`Required native ${format} encoder unavailable`);
    for (const variant of ['full', 'fragment', 'presentation'] as const) {
      const fragment = variant === 'fragment';
      const presentation = variant === 'presentation';
      const { scene, advanced } = annotationExportScene(defs, size, converted);
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
        fragmentOffset: fragment ? 1.25 : 0,
        effectSnapshots: scene.annotationEffects!.snapshots,
        readProjectAsset: async (id: string) => (id === 'native-bookend' ? bookend : null),
        renderSettings: { format, codec, frameRate: 30 as const, quality: 'HIGH' as const },
        signal,
      };
      const expected = surface(size);
      let capturedTime: number | undefined;
      const targetTime = fragment ? 0.2 : presentation ? 1.7 : 1.2;
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
            if (capturedTime === undefined && sample.timestamp >= targetTime - 1e-8) {
              sample.draw(expected.getContext('2d')!, 0, 0, size.width, size.height);
              capturedTime = sample.timestamp;
            }
          },
        },
      });
      if (capturedTime === undefined) throw new Error('Export witness frame absent');
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
        const actual = surface(size);
        let decodedTime: number | undefined;
        let decodedFrames = 0,
          lastDecodedTime = 0;
        for await (const sample of new VideoSampleSink(track).samples()) {
          try {
            decodedFrames++;
            lastDecodedTime = sample.timestamp;
            if (decodedTime === undefined && sample.timestamp >= capturedTime - 1e-5) {
              decodedTime = sample.timestamp;
              sample.draw(actual.getContext('2d')!, 0, 0, size.width, size.height);
            }
          } finally {
            sample.close();
          }
        }
        if (decodedTime === undefined) throw new Error('Encoded witness timestamp absent');
        const reference = expected
          .getContext('2d')!
          .getImageData(0, 0, size.width, size.height).data;
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
        results.push({
          format,
          codec,
          fragment,
          presentation,
          bytes: bytes.byteLength,
          capturedTime,
          decodedTime,
          meanRgbDifference: absoluteDifference / (size.width * size.height * 3),
          witnessPixels,
          duration: await input.computeDuration(),
          metadataDuration: await input.getDurationFromMetadata(),
          decodedFrames,
          lastDecodedTime,
        });
      } finally {
        input.dispose();
      }
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
