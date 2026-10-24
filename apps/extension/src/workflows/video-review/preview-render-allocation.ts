import type { PreviewScene, PreviewSceneDimensions } from './preview-scene';
import { hasCameraPerspective as hasQuickEditPerspective } from '../../features/video/project/motion/spatial';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSceneCamera,
  computeQuickEditWindowTransform,
  computeQuickEditSpatialWindow,
  evaluateQuickEditCameraAtTime,
} from '../../features/video/review/advanced/scene';
import { quickEditMotionBlurCameras } from '../../features/video/review/advanced/motion-blur';
import { evaluateQuickEditSpotlightsAtTime } from '../../features/video/review/advanced/focus';
import { evaluateQuickEditBordersAtTime } from '../../features/video/review/advanced/border';
import {
  canvasCommentBubble,
  isCanvasCommentVisibleAt,
} from '../../features/video/review/comments';
import { sceneSpotlightNeedsClip } from '../../features/video/composition/draw/spotlight';
import type { QuickEditCameraTransform } from '../../features/video/review/advanced/types';
import { evaluateReviewClicks } from '../../features/video/review/click-animation';
import { reviewWindowRasterBacking } from './window-header';
import { reviewSpatialSourceRect } from './scene-shadow';

interface Size {
  width: number;
  height: number;
}
type Capture = { kind: 'canvas'; size: Size } | { kind: 'video-frame'; allocationBytes: number };
interface Cost {
  bytes: number;
  canvases: number;
}
interface Allocation extends Cost {
  role: string;
}

/** Concrete dimensions come from preparation/admission, never from a quality multiplier. */
export interface PreviewRenderAllocationInput {
  publication: { backing: Size; previousFront: Size | null };
  admission: {
    source: Capture | null;
    camera: { retained: Capture | null; active: Capture | null };
    transition: readonly [Capture, Capture] | null;
  };
  assets: {
    headerBitmap: Size | null;
    backgroundBitmap: Size | null;
    watermark: null | {
      cache: Size;
      preparation: { kind: 'text' } | { kind: 'image'; source: Size };
    };
    previousWatermarkCache: Size | null;
    annotationSourceBytes?: number;
  };
  background: null | {
    cache: Size;
    previousCache: Size | null;
    blurRadius: number;
    denseGradient: boolean;
  };
  scene: {
    transitionRaster: Size | null;
    splitRaster?: Size | null;
    windowRaster: Size | null;
    clickLens?: boolean;
    motionPass: Size | null;
    spatial: null | { output: Size; plane: Size; halfFloat: boolean };
    spotlight: null | { backing: Size; frameCount: number; blurRadius: number; fastPath: boolean };
    border: Size | null;
    denseCommentGradient: Size | null;
    denseBackgroundGradient: Size | null;
    annotationBitmaps?: readonly Size[];
  };
}

function integer(value: number, allowZero = false): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1))
    throw new Error('Invalid preview allocation graph');
  return value;
}
function sum(values: readonly number[]): number {
  return integer(
    values.reduce((total, value) => total + value, 0),
    true
  );
}
function pixels(size: Size): number {
  return integer(integer(size.width) * integer(size.height));
}
function bytes(role: string, count: number): Allocation {
  return { role, bytes: integer(count), canvases: 0 };
}
function canvas(role: string, size: Size): Allocation {
  return { role, bytes: integer(pixels(size) * 4), canvases: 1 };
}
function bitmap(role: string, size: Size | null): Allocation[] {
  return size ? [bytes(role, pixels(size) * 4)] : [];
}
function annotationSources(count = 0): Allocation[] {
  integer(count, true);
  return count ? [bytes('annotation-immutable-sources', count)] : [];
}
function optionalCanvas(role: string, size: Size | null): Allocation[] {
  return size ? [canvas(role, size)] : [];
}
function capture(role: string, value: Capture): Allocation {
  return value.kind === 'canvas' ? canvas(role, value.size) : bytes(role, value.allocationBytes);
}
function radius(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid preview allocation blur');
  return value;
}
function padded(role: string, size: Size, blur: number): Allocation {
  const pad = integer(Math.ceil(radius(blur) * 3) + 2);
  return canvas(role, {
    width: integer(size.width + 2 * pad),
    height: integer(size.height + 2 * pad),
  });
}
function gradient(size: Size | null): Allocation[] {
  return size
    ? [
        canvas('gradient-dense', size),
        bytes('gradient-pixels', pixels(size) * 4),
        bytes('gradient-colors', 4097 * 4),
      ]
    : [];
}
function spatial(value: PreviewRenderAllocationInput['scene']['spatial']): Allocation[] {
  if (!value) return [];
  const { output, plane, halfFloat } = value;
  const result = [
    canvas('spatial-plane', plane),
    ...['exposure', 'overlay'].map((role) => canvas(`spatial-${role}`, output)),
  ];
  result.push(
    bytes('spatial-drawing-buffer', pixels(output) * 4),
    bytes('spatial-vertex-and-matrices', 132),
    bytes('spatial-level-sizes', 64)
  );
  let { width, height } = plane;
  for (let level = 0; level < 8; level++) {
    result.push(
      bytes(
        `spatial-texture-${level}`,
        pixels({ width, height }) * (level > 0 && halfFloat ? 8 : 4)
      )
    );
    width = Math.max(1, Math.ceil(width / 2));
    height = Math.max(1, Math.ceil(height / 2));
  }
  return result;
}
function phase(name: string, allocations: Allocation[]) {
  return {
    name,
    allocations,
    bytes: sum(allocations.map((value) => value.bytes)),
    canvases: sum(allocations.map((value) => value.canvases)),
  };
}

function spotlight(value: PreviewRenderAllocationInput['scene']['spotlight']): {
  coverage: Allocation[];
  composite: Allocation[];
} {
  if (!value) return { coverage: [], composite: [] };
  const { backing, frameCount, blurRadius, fastPath } = value;
  integer(frameCount);
  radius(blurRadius);
  if (fastPath) {
    if (frameCount !== 1) throw new Error('Invalid spotlight fast-path graph');
    return {
      coverage: [],
      composite: blurRadius > 0 ? [padded('spotlight.paddedBlur', backing, blurRadius)] : [],
    };
  }
  const budget = Math.max(1, Math.floor(pixels(backing) / integer(2 * frameCount + 3)));
  const width = Math.min(backing.width, budget);
  const height = Math.max(1, Math.min(backing.height, Math.floor(budget / width)));
  const tile = { width, height };
  const masks = [canvas('spotlight.dim', backing), canvas('spotlight.blur', backing)];
  return {
    coverage: [
      ...masks,
      canvas('spotlight.hole', backing),
      bytes(
        'spotlight.coverage',
        frameCount === 1
          ? integer(3 * pixels(tile) * 4)
          : sum([integer((2 * frameCount + 2) * pixels(tile) * 4), integer((frameCount + 1) * 8)])
      ),
    ],
    composite:
      blurRadius > 0
        ? [
            ...masks,
            canvas('spotlight.layer', backing),
            padded('spotlight.paddedBlur', backing, blurRadius),
          ]
        : masks,
  };
}

function preparation(input: PreviewRenderAllocationInput, front: Allocation[]) {
  const { assets } = input;
  const sources = annotationSources(assets.annotationSourceBytes);
  const background = bitmap('background-bitmap', assets.backgroundBitmap);
  const header = bitmap('header-bitmap', assets.headerBitmap);
  const previous = optionalCanvas('previous-watermark-cache', assets.previousWatermarkCache);
  const retainedCamera = input.admission.camera.retained
    ? [capture('camera-retained', input.admission.camera.retained)]
    : [];
  const retainedTransition =
    input.admission.transition?.map((value, index) => capture(`transition-${index}`, value)) ?? [];
  const ready = [
    ...front,
    ...retainedCamera,
    ...retainedTransition,
    ...background,
    ...header,
    ...sources,
  ];
  const phases = [
    phase('prepare-background', [
      ...front,
      ...retainedCamera,
      ...retainedTransition,
      ...background,
      ...sources,
    ]),
    phase('prepare-header', ready),
  ];
  if (assets.watermark) {
    const { cache, preparation: prepare } = assets.watermark;
    if (prepare.kind === 'text') {
      phases.push(
        phase('measure-watermark', [
          ...ready,
          ...previous,
          canvas('watermark-measurement', { width: 1, height: 1 }),
        ])
      );
    }
    phases.push(
      phase('prepare-watermark', [
        ...ready,
        ...previous,
        canvas('watermark-cache', cache),
        ...bitmap('watermark-source-bitmap', prepare.kind === 'image' ? prepare.source : null),
      ])
    );
  }
  return phases;
}

/** Managed graph limits exclude decoder queues, driver storage and opaque browser overhead. */
export function calculatePreviewRenderAllocation(input: PreviewRenderAllocationInput) {
  const front = [
    canvas('publication-front', input.publication.previousFront ?? input.publication.backing),
  ];
  const admitted = [
    ...(input.admission.source ? [capture('source', input.admission.source)] : []),
    ...Object.entries(input.admission.camera).flatMap(([role, value]) =>
      value ? [capture(`camera-${role}`, value)] : []
    ),
    ...(input.admission.transition?.map((value, index) => capture(`transition-${index}`, value)) ??
      []),
  ];
  const assets = [
    ...bitmap('header-bitmap', input.assets.headerBitmap),
    ...bitmap('background-bitmap', input.assets.backgroundBitmap),
    ...optionalCanvas('watermark-cache', input.assets.watermark?.cache ?? null),
    ...annotationSources(input.assets.annotationSourceBytes),
  ];
  const retained = [
    ...front,
    canvas('publication-staging', input.publication.backing),
    ...admitted,
    ...assets,
    ...optionalCanvas('preview-transition-source', input.scene.transitionRaster),
    ...spatial(input.scene.spatial),
    ...(input.scene.annotationBitmaps?.flatMap((size) =>
      bitmap('annotation-output-bitmap', size)
    ) ?? []),
  ];
  const cached = optionalCanvas('background-cache', input.background?.cache ?? null);
  const normal = [...retained, ...cached];
  const window = optionalCanvas('decorated-window', input.scene.windowRaster);
  const motion = input.scene.motionPass
    ? [
        canvas('motion-accumulator', input.scene.motionPass),
        canvas('motion-sample', input.scene.motionPass),
      ]
    : [];
  const masks = spotlight(input.scene.spotlight);
  const phases = [
    ...preparation(input, front),
    phase('scene', [...normal, ...window, ...motion]),
    phase('camera-split', [
      ...normal,
      ...optionalCanvas('camera-split-source', input.scene.splitRaster ?? null),
    ]),
    phase('spotlight-coverage', [...normal, ...window, ...masks.coverage]),
    phase('spotlight-composite', [...normal, ...window, ...masks.composite]),
    phase('border', [
      ...normal,
      ...window,
      ...optionalCanvas('border-layer', input.scene.border),
      ...optionalCanvas('border-mask', input.scene.border),
    ]),
    phase('comment-gradient', [
      ...normal,
      ...window,
      ...gradient(input.scene.denseCommentGradient),
    ]),
    phase('background-gradient', [
      ...normal,
      ...window,
      ...motion,
      ...gradient(input.scene.denseBackgroundGradient),
    ]),
  ];
  if (input.scene.clickLens) phases.push(phase('click-lens', [...normal, ...window]));
  if (input.background) {
    const background = input.background;
    const rebuilding = [
      ...retained,
      ...window,
      ...motion,
      ...optionalCanvas('previous-background-cache', background.previousCache),
      canvas('background-source', background.cache),
      canvas('background-cache', background.cache),
    ];
    phases.push(
      phase('background-rebuild-paint', [
        ...rebuilding,
        ...gradient(background.denseGradient ? background.cache : null),
      ]),
      phase('background-rebuild-blur', [
        ...rebuilding,
        padded('background.paddedBlur', background.cache, background.blurRadius),
      ])
    );
  }
  return {
    maximumManagedBytes: Math.max(...phases.map((value) => value.bytes)),
    maximumCanvases: Math.max(...phases.map((value) => value.canvases)),
    phases,
  };
}

/** Discovery describes only resources whose dimensions or storage size are already known. */
export interface PreviewPreparationAllocationInput {
  previousFront: Size | null;
  retainedCamera: Capture | null;
  retainedTransition?: readonly [Capture, Capture] | null;
  backgroundBitmap: Size | null;
  headerBitmap: Size | null;
  measurement: boolean;
  watermark: PreviewRenderAllocationInput['assets']['watermark'];
  annotationSourceBytes?: number;
}

/** Positive empty-ledger limits are constructor control values, not allocated storage. */
export function calculatePreviewPreparationAllocation(input: PreviewPreparationAllocationInput) {
  const allocations = [
    ...optionalCanvas('publication-front', input.previousFront),
    ...(input.retainedCamera ? [capture('camera-retained', input.retainedCamera)] : []),
    ...(input.retainedTransition?.map((value, index) => capture(`transition-${index}`, value)) ??
      []),
    ...bitmap('background-bitmap', input.backgroundBitmap),
    ...bitmap('header-bitmap', input.headerBitmap),
    ...(input.measurement ? [canvas('watermark-measurement', { width: 1, height: 1 })] : []),
    ...annotationSources(input.annotationSourceBytes),
  ];
  if (input.watermark) {
    allocations.push(canvas('watermark-cache', input.watermark.cache));
    const preparation = input.watermark.preparation;
    if (preparation.kind === 'image')
      allocations.push(...bitmap('watermark-source-bitmap', preparation.source));
  }
  const current = phase('preparation', allocations);
  return {
    maximumManagedBytes: Math.max(1, current.bytes),
    maximumCanvases: Math.max(1, current.canvases),
    phases: [current],
  };
}

/** Admission metadata remains separate from authored scene geometry. */
export interface PreviewRuntimeAllocationInput {
  scene: PreviewScene;
  dimensions: PreviewSceneDimensions;
  resultTime: number;
  sourceTime: number;
  cameraTransform?: QuickEditCameraTransform;
  sourceAllocationBytes: number | null;
  sourceBacking: Size;
  camera: { retainedBytes: number | null; activeBytes: number | null };
  transitionBytes: readonly [number, number] | null;
  previousFront: Size | null;
  assets: PreviewRenderAllocationInput['assets'];
  spatialHalfFloat?: boolean;
  previousBackgroundCache?: Size | null;
}

function frameCapture(count: number | null): Capture | null {
  return count === null ? null : { kind: 'video-frame', allocationBytes: integer(count) };
}
function commentGradientUpperBound(
  input: PreviewRuntimeAllocationInput,
  cameraScale: number,
  spatialActive: boolean
): Size | null {
  let width = 0;
  let height = 0;
  for (const comment of input.scene.comments) {
    if (
      !comment.renderToVideo ||
      !comment.resolvedText.trim() ||
      comment.style.fillPaint.kind !== 'gradient' ||
      !isCanvasCommentVisibleAt(comment, input.sourceTime)
    )
      continue;
    const scale = comment.attachment === 'viewport' || spatialActive ? 1 : cameraScale;
    const canonical = input.dimensions.canonical;
    const bubble = canvasCommentBubble(comment.style, {
      width: canonical.width / scale,
      height: canonical.height / scale,
    });
    width = Math.max(
      width,
      Math.ceil((bubble.maxWidth * scale * input.dimensions.backing.width) / canonical.width)
    );
    height = Math.max(
      height,
      Math.ceil((bubble.maxHeight * scale * input.dimensions.backing.height) / canonical.height)
    );
  }
  return width && height ? { width, height } : null;
}

function runtimeSceneGeometry(input: PreviewRuntimeAllocationInput) {
  const { scene, dimensions } = input;
  const backing = dimensions.backing;
  const camera =
    input.cameraTransform ??
    evaluateQuickEditCameraAtTime(scene.zoomRegions, input.resultTime, {
      source: scene.source,
      canvas: scene.canvas,
      background: scene.background,
      windowHeader: scene.windowHeader,
      output: backing,
    });
  const layout = computeQuickEditSceneLayout({
    source: scene.source,
    canvas: scene.canvas,
    background: scene.background,
    windowHeader: scene.windowHeader,
    camera,
    output: backing,
  });
  const sceneScale = backing.width / (scene.canvas?.width ?? scene.source.width);
  const background = scene.background.enabled
    ? {
        ...scene.background,
        layout: {
          ...scene.background.layout,
          cornerRadius: scene.background.layout.cornerRadius * sceneScale,
          ...(scene.background.layout.blur === undefined
            ? {}
            : { blur: scene.background.layout.blur * sceneScale }),
        },
      }
    : scene.background;
  return { scene, backing, camera, layout, sceneScale, background };
}

/** Focus evaluation determines retained spatial storage and sharp annotation scratch. */
function focusAllocation(
  input: PreviewRuntimeAllocationInput,
  geometry: ReturnType<typeof runtimeSceneGeometry>
) {
  const { scene, backing, camera, layout, sceneScale, background } = geometry;
  const motion = computeQuickEditSceneCamera(layout, background);
  const spatialWindow = computeQuickEditSpatialWindow(layout, background);
  const spotlights = evaluateQuickEditSpotlightsAtTime({
    regions: scene.zoomRegions,
    time: input.resultTime,
    output: backing,
    video: computeQuickEditWindowTransform(layout),
    scale: sceneScale * camera.scale,
  });
  const borders = evaluateQuickEditBordersAtTime({
    regions: scene.zoomRegions,
    time: input.resultTime,
    output: backing,
    video: computeQuickEditWindowTransform(layout),
    scale: sceneScale * camera.scale,
  });
  const clip = {
    rect: layout.spatial ? spatialWindow : motion.windowClip,
    radius: background.enabled
      ? background.layout.cornerRadius *
        (layout.spatial ? spatialWindow.width / layout.windowRect.width : motion.scale)
      : 0,
  };
  const spatialRetained = scene.zoomRegions.some(
    (region) =>
      !region.dormant &&
      !region.border &&
      !region.spotlight &&
      (hasQuickEditPerspective(region.perspective) || region.depthOfField?.enabled)
  );
  return {
    spatial: spatialRetained
      ? {
          output: backing,
          plane: reviewSpatialSourceRect({
            output: backing,
            window: layout.windowRect,
            background,
            sceneScale,
          }),
          halfFloat: input.spatialHalfFloat ?? true,
        }
      : null,
    spatialFormatPending: spatialRetained && input.spatialHalfFloat === undefined,
    spotlight: spotlights.length
      ? {
          backing,
          frameCount: spotlights.length,
          blurRadius: Math.max(...spotlights.map((value) => value.blur)),
          fastPath:
            !layout.spatial &&
            spotlights.length === 1 &&
            !sceneSpotlightNeedsClip(spotlights[0]!, clip),
        }
      : null,
    border: borders.length ? backing : null,
  };
}

/** Background blur owns a downscaled retained cache; unblurred gradients draw directly. */
function backgroundAllocation(
  input: PreviewRuntimeAllocationInput,
  geometry: ReturnType<typeof runtimeSceneGeometry>
) {
  const { background, backing } = geometry;
  const dense = background.enabled && background.type === 'gradient';
  const blur =
    background.enabled && background.type !== 'solid' ? (background.layout.blur ?? 0) : 0;
  const cacheScale = Math.min(1, 2048 / Math.max(backing.width, backing.height));
  return {
    dense,
    gradient: dense && blur <= 0 ? backing : null,
    cache:
      blur > 0
        ? {
            cache: {
              width: Math.max(1, Math.round(backing.width * cacheScale)),
              height: Math.max(1, Math.round(backing.height * cacheScale)),
            },
            previousCache: input.previousBackgroundCache ?? null,
            blurRadius: blur * cacheScale,
            denseGradient: dense,
          }
        : null,
  };
}

/** Map canonical evaluators to resource phases; gradient entries are declared upper bounds. */
export function resolvePreviewRenderAllocation(
  input: PreviewRuntimeAllocationInput
): PreviewRenderAllocationInput & {
  upperBounds: {
    gradientFallback: boolean;
    commentGradient: Size | null;
    spatialFormatPending: boolean;
  };
} {
  const geometry = runtimeSceneGeometry(input);
  const { scene, backing, camera, layout } = geometry;
  const focus = focusAllocation(input, geometry);
  const background = backgroundAllocation(input, geometry);
  const commentUpperBound = commentGradientUpperBound(input, camera.scale, !!layout.spatial);
  const transition = input.transitionBytes;
  const clickLens = evaluateReviewClicks(scene.clicks, input.resultTime).some(
    (click) => (click.lens?.scale ?? 1) > 1
  );
  return {
    publication: { backing, previousFront: input.previousFront },
    admission: {
      source: frameCapture(input.sourceAllocationBytes),
      camera: {
        retained: frameCapture(input.camera.retainedBytes),
        active: frameCapture(input.camera.activeBytes),
      },
      transition: transition
        ? [
            { kind: 'video-frame', allocationBytes: integer(transition[0]) },
            { kind: 'video-frame', allocationBytes: integer(transition[1]) },
          ]
        : null,
    },
    assets: input.assets,
    background: background.cache,
    scene: {
      transitionRaster: transition ? input.sourceBacking : null,
      windowRaster:
        input.assets.headerBitmap || layout.sourceCrop
          ? reviewWindowRasterBacking({
              windowRect: layout.windowRect,
              sourceWidth: scene.source.width * (layout.sourceCrop?.width ?? 1),
              magnify: clickLens,
            })
          : null,
      clickLens,
      motionPass:
        !layout.spatial &&
        !input.cameraTransform &&
        quickEditMotionBlurCameras(scene.zoomRegions, input.resultTime, scene).length > 1
          ? backing
          : null,
      spatial: focus.spatial,
      spotlight: focus.spotlight,
      border: focus.border,
      denseCommentGradient: commentUpperBound,
      denseBackgroundGradient: background.gradient,
    },
    upperBounds: {
      gradientFallback: background.dense || !!commentUpperBound,
      commentGradient: commentUpperBound,
      spatialFormatPending: focus.spatialFormatPending,
    },
  };
}
