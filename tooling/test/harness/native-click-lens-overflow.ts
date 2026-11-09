import { DEFAULT_WINDOW_HEADER } from '../../../packages/runtime-contracts/src/window-header';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../apps/extension/src/features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../apps/extension/src/features/video/project/types';
import { createVideoProjectMotionRegion } from '../../../apps/extension/src/features/video/project/motion';
import { DEFAULT_CAMERA_PERSPECTIVE } from '../../../apps/extension/src/features/video/project/motion/spatial';
import { resolveVideoCompositionRenderPasses } from '../../../apps/extension/src/features/video/composition/timeline/render';
import { motionCameraProjection } from '../../../apps/extension/src/features/video/composition/motion/spatial';
import {
  projectQuickEditPoint,
  invertQuickEditProjection,
} from '../../../apps/extension/src/features/video/composition/motion/spatial-geometry';
import {
  getFittedMediaContentFrame,
  getFittedMediaWindowFrame,
} from '../../../apps/extension/src/features/video/composition/draw/fitted-media';
import {
  admittedVisualWindowHeader,
  projectWindowHeaderImages,
} from '../../../apps/extension/src/features/video/composition/draw/window-header';
import { createNativeGpuPreviewRenderer } from '../../../apps/extension/src/video-editor/preview/stage/scene/gpu-preview';
import { drawPreviewVisualPasses } from '../../../apps/extension/src/video-editor/preview/stage/scene/render-visual';
import { createReviewSpatialRenderer } from '../../../apps/extension/src/features/video/composition/canvas/spatial-renderer';
import type { VideoCompositionActionState } from '../../../apps/extension/src/features/video/composition/types';
import type { VideoCompositionFrameSource } from '../../../apps/extension/src/features/video/composition/draw/media-source';
import type { PreviewSceneRenderInput } from '../../../apps/extension/src/video-editor/preview/stage/scene/types';
import type { RenderResources } from '../../../apps/extension/src/features/video/composition/canvas/render-resources';

type Variant = 'edge' | 'projected-overflow' | 'cropped-header';
export interface NativeClickLensOverflowRow {
  editor: 'Native';
  backend: 'gpu' | 'legacy';
  variant: Variant;
  probe: 'magnified-source' | 'outline';
  samples: number;
  changedOutside: number;
  maxDifference: number;
  width: number;
  height: number;
}
const output = { width: 1100, height: 720 };
const sourceSize = { width: 400, height: 225 };
const background = '#ff00ff';
function canvas(size = output) {
  return Object.assign(document.createElement('canvas'), size);
}
function context(target: HTMLCanvasElement) {
  const value = target.getContext('2d');
  if (!value) throw new Error('E_NATIVE_LENS_CONTEXT');
  return value;
}
const resources: RenderResources = {
  canvas(_role, size) {
    const target = canvas(size);
    return {
      canvas: target,
      context: context(target),
      release() {
        target.width = target.height = 0;
      },
    };
  },
  bytes() {
    return { release() {} };
  },
};
async function fixture(variant: Variant) {
  const project = createEmptyVideoProject('Lens viewport', output.width, output.height);
  const asset = createVideoProjectAsset(
    'Source',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'lens-source' },
    {
      ...sourceSize,
      duration: 4,
      mimeType: 'video/webm',
      size: 1,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const track = project.tracks[0];
  if (!track) throw new Error('E_NATIVE_LENS_TRACK');
  const clip = createVideoClipFromAsset(track.id, asset, output.width, output.height, 0);
  clip.transform = {
    x: 600,
    y: variant === 'projected-overflow' ? 20 : 160,
    ...sourceSize,
    rotation: 0,
    opacity: 1,
  };
  clip.windowCornerRadius = 16;
  clip.shadowIntensity = 0;
  const images: Record<string, HTMLImageElement> = {};
  project.assets = [asset];
  project.clips = [clip];
  project.duration = 4;
  project.backgroundColor = background;
  project.sceneBackground = { kind: 'solid', color: background, zoomBehavior: 'fixed' };
  if (variant === 'cropped-header') {
    clip.sourceCrop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
    clip.windowHeader = { ...DEFAULT_WINDOW_HEADER, title: 'Source window', url: '' };
    for (const request of projectWindowHeaderImages(project)) {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('E_NATIVE_LENS_HEADER'));
        image.src = request.src;
      });
      images[request.key] = image;
    }
  }
  if (variant === 'projected-overflow')
    project.motionRegions = [
      {
        ...createVideoProjectMotionRegion(project, 0),
        duration: 4,
        zoomInDuration: 0,
        zoomOutDuration: 0,
        scale: 1,
        focusPoint: { x: output.width / 2, y: output.height / 2 },
        perspective: {
          ...DEFAULT_CAMERA_PERSPECTIVE,
          enabled: true,
          rotateX: 7,
          rotateY: -5,
          rotateZ: 25,
          strength: 0.6,
        },
      },
    ];
  const source = canvas(sourceSize),
    paint = context(source);
  paint.fillStyle = variant === 'cropped-header' ? '#ff0000' : '#0033cc';
  paint.fillRect(0, 0, source.width, source.height);
  if (clip.sourceCrop) {
    paint.fillStyle = '#0033cc';
    paint.fillRect(
      source.width * 0.1,
      source.height * 0.1,
      source.width * 0.8,
      source.height * 0.8
    );
  }
  const media: VideoCompositionFrameSource = {
    sourceWidth: source.width,
    sourceHeight: source.height,
    toVideoFrame: () => new VideoFrame(source, { timestamp: 1_000_000 }),
    draw: (target, x, y, width, height) => target.drawImage(source, x, y, width, height),
  };
  const point = variant === 'cropped-header' ? { x: 0.15, y: 0.4 } : { x: 0.5, y: 0.1 };
  const event: VideoCompositionActionState['event'] = {
    id: 'click-lens',
    kind: 'CLICK',
    label: '',
    anchor: { kind: 'project', time: 1 },
    point,
    data: {},
  };
  const action: VideoCompositionActionState = {
    event,
    clipId: clip.id,
    duration: 1,
    start: 0.5,
    progress: 0.5,
    preset: 'CLICK_RIPPLE',
    renderKind: 'accent',
    point,
    occurrence: {
      event,
      eventId: event.id,
      clipId: clip.id,
      time: 1,
      sourceInstanceId: null,
      playbackRun: null,
    },
    gestureFeedback: {
      effect: 'magnify',
      point,
      radius: variant === 'projected-overflow' ? 200 : 80,
      stroke: variant === 'projected-overflow' ? 12 : 1,
      opacity: 1,
      color: '#ffffff',
      lens: { scale: 4, shape: 'circle', shadow: 0, optics: 'flat' },
    },
  };
  return { project, clip, images, source, media, action };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function passesFor(input: Fixture, active: boolean) {
  const passes = resolveVideoCompositionRenderPasses(input.project, 1);
  for (const frame of [passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)])
    for (const layer of frame.visualLayers)
      if (layer.kind === 'video' && layer.clipId === input.clip.id)
        layer.actions = active ? [input.action] : [];
  return passes;
}
async function render(
  input: Fixture,
  backend: NativeClickLensOverflowRow['backend'],
  active: boolean,
  owners: {
    gpu: ReturnType<typeof createNativeGpuPreviewRenderer>;
    spatial: ReturnType<typeof createReviewSpatialRenderer>;
  }
) {
  const target = canvas();
  Object.defineProperties(target, {
    clientWidth: { value: output.width },
    clientHeight: { value: output.height },
  });
  const passes = passesFor(input, active);
  try {
    if (backend === 'gpu') {
      const request: PreviewSceneRenderInput = {
        project: input.project,
        canvas: target,
        stage: null,
        currentTime: 1,
        imageBank: input.images,
        videoRefs: { current: {} },
        decodedVideoFrames: new Map([[input.clip.id, input.media]]),
      };
      if (
        (await owners.gpu.render(
          request,
          passes,
          () => {},
          () => false,
          undefined,
          false
        )) !== true
      )
        throw new Error('E_NATIVE_LENS_GPU');
    } else {
      if (
        !(await drawPreviewVisualPasses({
          project: input.project,
          canvas: target,
          stage: null,
          currentTime: 1,
          imageBank: input.images,
          clipMediaElements: new Map([[input.clip.id, input.media]]),
          overlayFrame: passes.overlayFrame,
          passes: passes.visualPasses,
          spatialRenderer: () => owners.spatial,
        }))
      )
        throw new Error('E_NATIVE_LENS_LEGACY');
    }
    return context(target).getImageData(0, 0, target.width, target.height).data;
  } finally {
    target.width = target.height = 0;
  }
}
function measure(
  input: Fixture,
  variant: Variant,
  baseline: Uint8ClampedArray,
  active: Uint8ClampedArray
) {
  const passes = passesFor(input, true),
    layer = passes.overlayFrame.visualLayers.find((layer) => layer.kind === 'video');
  if (!layer || layer.kind !== 'video') throw new Error('E_NATIVE_LENS_LAYER');
  const fitted = {
    frame: layer,
    fitMode: layer.clip.fitMode,
    sourceWidth: sourceSize.width,
    sourceHeight: sourceSize.height,
    displayScale: 1,
    ...(layer.clip.sourceCrop ? { sourceCrop: layer.clip.sourceCrop } : {}),
    ...admittedVisualWindowHeader(layer.clip, input.images, false),
  };
  const content = getFittedMediaContentFrame(fitted),
    window = getFittedMediaWindowFrame(fitted);
  const crop = layer.clip.sourceCrop;
  const visible = {
    x: content.x + content.width * (crop?.x ?? 0),
    y: content.y + content.height * (crop?.y ?? 0),
    width: content.width * (crop?.width ?? 1),
    height: content.height * (crop?.height ?? 1),
  };
  const point = input.action.point;
  if (!point) throw new Error('E_NATIVE_LENS_POINT');
  const center = {
    x: content.x + point.x * content.width,
    y: content.y + point.y * content.height,
  };
  const feedback = input.action.gestureFeedback;
  if (!feedback?.lens) throw new Error('E_NATIVE_LENS_FEEDBACK');
  const scale = (content.width / sourceSize.width + content.height / sourceSize.height) / 2;
  const radius = feedback.radius * scale;
  const stroke = feedback.stroke * Math.max(0.2, scale);
  const projection = motionCameraProjection(passes.overlayFrame.camera) ?? [
    1, 0, 0, 0, 1, 0, 0, 0, 1,
  ];
  const inverse = invertQuickEditProjection(projection);
  if (!inverse) throw new Error('E_NATIVE_LENS_PROJECTION');
  let samples = 0,
    changedOutside = 0,
    maxDifference = 0;
  for (let y = 2; y < output.height - 2; y += 2)
    for (let x = 2; x < output.width - 2; x += 2) {
      const p = projectQuickEditPoint(inverse, { x: x + 0.5, y: y + 0.5 });
      if (!p || (variant === 'projected-overflow' && p.y >= -132)) continue;
      const outside =
        p.x < window.x - 4 ||
        p.y < window.y - 4 ||
        p.x > window.x + window.width + 4 ||
        p.y > window.y + window.height + 4;
      if (!outside) continue;
      const distance = Math.hypot(p.x - center.x, p.y - center.y);
      if (variant === 'projected-overflow') {
        if (Math.abs(distance - radius) > stroke / 2 - 1) continue;
      } else {
        if (distance > radius * 0.7) continue;
        const sample = {
          x: center.x + (p.x - center.x) / feedback.lens.scale,
          y: center.y + (p.y - center.y) / feedback.lens.scale,
        };
        if (
          sample.x < visible.x + 8 ||
          sample.y < visible.y + 8 ||
          sample.x > visible.x + visible.width - 8 ||
          sample.y > visible.y + visible.height - 8
        )
          continue;
      }
      samples++;
      const index = (y * output.width + x) * 4;
      const difference = Math.max(
        ...[0, 1, 2].map((channel) =>
          Math.abs(active[index + channel]! - baseline[index + channel]!)
        )
      );
      maxDifference = Math.max(maxDifference, difference);
      const expected =
        variant === 'projected-overflow'
          ? [0, 1, 2].every((channel) => active[index + channel]! > 220)
          : active[index]! < 50 && active[index + 2]! > 150;
      if (difference > 40 && expected) changedOutside++;
    }
  return { samples, changedOutside, maxDifference };
}
/** Production Native GPU and Canvas scene draws, with numeric exterior-pixel witnesses only. */
export async function runNativeClickLensOverflow(): Promise<NativeClickLensOverflowRow[]> {
  const rows: NativeClickLensOverflowRow[] = [];
  const owners = {
    gpu: createNativeGpuPreviewRenderer(),
    spatial: createReviewSpatialRenderer(undefined, resources),
  };
  try {
    for (const variant of ['edge', 'projected-overflow', 'cropped-header'] as const) {
      const input = await fixture(variant);
      try {
        for (const backend of ['gpu', 'legacy'] as const) {
          const baseline = await render(input, backend, false, owners),
            active = await render(input, backend, true, owners);
          rows.push({
            editor: 'Native',
            backend,
            variant,
            probe: variant === 'projected-overflow' ? 'outline' : 'magnified-source',
            ...measure(input, variant, baseline, active),
            ...output,
          });
        }
      } finally {
        input.source.width = input.source.height = 0;
      }
    }
    return rows;
  } finally {
    owners.gpu.dispose();
    owners.spatial.dispose();
  }
}
