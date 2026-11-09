import { VideoSample } from 'mediabunny';
import type { PreviewSourceBinding } from '../../workflows/video/preview-source';
import {
  prepareDecodedVideoFrame,
  prepareDecodedVideoSample,
} from '../../features/video/composition/draw/decoded-sample';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import type { ReviewWebcamFrameLease } from './webcam-preview';
import type { useReviewCutTransitionProvider } from './cut-transition-preview';
import type { Description, RenderFrame } from './preview-presentation-state';

function cameraDescription(camera: ReviewWebcamFrameLease): NonNullable<RenderFrame['camera']> {
  return {
    representedMediaTime: camera.representedMediaTime,
    generation: camera.generation,
    source: camera.source,
    placement: camera.placement,
    drawable: camera.drawable,
    ...(camera.crop ? { crop: camera.crop } : {}),
  };
}

/** Joins an already frozen primary image and camera lease without transferring native ownership to UI. */
export function attachReviewPreviewCamera(
  captured: { value: RenderFrame; release(): void },
  camera: ReviewWebcamFrameLease | undefined
) {
  if (!camera) return captured;
  let released = false;
  try {
    return {
      value: { ...captured.value, camera: cameraDescription(camera) },
      release() {
        if (released) return;
        released = true;
        try {
          camera.release();
        } finally {
          captured.release();
        }
      },
    };
  } catch (error) {
    try {
      camera.release();
    } finally {
      captured.release();
    }
    throw error;
  }
}

/** Admission includes the overlapping raw frame, native plane copy and packed frame. */
function previewSourceFrameBytes(source: VideoFrame) {
  const bytes = source.allocationSize();
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || !Number.isFinite(source.timestamp))
    throw new Error('Invalid source frame allocation');
  const visible = source.visibleRect;
  const packsPlanes =
    source.format === 'NV12' &&
    visible &&
    (visible.x !== 0 ||
      visible.y !== 0 ||
      visible.width !== source.codedWidth ||
      visible.height !== source.codedHeight);
  return bytes * (packsPlanes ? 3 : 1);
}

/** Capture and release one immutable source/camera transaction; partial admission rolls back here. */
export function captureReviewPreviewFrame(args: {
  video: HTMLVideoElement;
  description: Description;
  sequence: number;
  time: number;
  transition: ReturnType<ReturnType<typeof useReviewCutTransitionProvider>['read']>;
  sourceTime(): number;
  reserveSource(bytes: number): { release(): void };
  captureCamera(): ReviewWebcamFrameLease | undefined;
}) {
  let source: VideoFrame | undefined;
  let rgb: HTMLCanvasElement | undefined;
  try {
    if (typeof VideoFrame !== 'undefined') source = new VideoFrame(args.video);
    else {
      if (args.video.seeking || args.video.readyState < 2) return null;
      const { videoWidth: width, videoHeight: height } = args.video;
      if (
        !Number.isSafeInteger(width) ||
        width <= 0 ||
        !Number.isSafeInteger(height) ||
        height <= 0
      )
        return null;
      rgb = document.createElement('canvas');
      rgb.width = width;
      rgb.height = height;
    }
  } catch (error) {
    // Metadata readiness can precede the first capturable native frame in Chrome.
    // Only that constructor state is transient; decoding/admission errors remain failures.
    if (error instanceof DOMException && error.name === 'InvalidStateError') return null;
    throw error;
  }
  let reservation: { release(): void } | undefined;
  let camera: ReviewWebcamFrameLease | undefined;
  let sourceClosed = false;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    camera?.release();
    if (!sourceClosed) {
      source?.close();
      if (rgb) rgb.width = rgb.height = 0;
      sourceClosed = true;
    }
    reservation?.release();
  };
  try {
    reservation = args.reserveSource(
      source ? previewSourceFrameBytes(source) : rgb!.width * rgb!.height * 4
    );
    if (rgb) {
      const context = rgb.getContext('2d');
      if (!context) throw new Error('Preview source canvas is unavailable.');
      context.drawImage(args.video, 0, 0, rgb.width, rgb.height);
    }
    camera = args.captureCamera();
    const frame: RenderFrame = {
      generation: args.sequence,
      fps: args.description.fps ?? 30,
      sourceTime: args.sourceTime(),
      resultTime: args.time,
      source: {
        ...(source
          ? {
              videoFrame: () => source!,
              prepare: async (signal: AbortSignal) => {
                try {
                  source = await prepareDecodedVideoFrame(source!, signal);
                } catch (error) {
                  sourceClosed = true;
                  throw error;
                }
              },
              timestamp: source.timestamp / 1e6,
            }
          : {}),
        backing: previewTransitionBacking(args.description, args.time),
        draw: (context, x, y, width, height) =>
          context.drawImage(source ?? rgb!, x, y, width, height),
      },
      ...(camera
        ? {
            camera: cameraDescription(camera),
          }
        : {}),
      ...(args.description.cameraTransform
        ? { cameraTransform: args.description.cameraTransform }
        : {}),
      ...(args.transition?.frames
        ? { transition: { blend: args.transition.blend, frames: args.transition.frames } }
        : {}),
    };
    return { value: frame, release };
  } catch (error) {
    release();
    throw error;
  }
}

/** Takes ownership of a decoded source lease, including every failed capture attempt. */
export function captureDecodedReviewPreviewFrame(args: {
  binding: Pick<PreviewSourceBinding, 'source' | 'target' | 'timestamp'>;
  releaseSource(): void;
  description: Description;
  sequence: number;
  time: number;
  transition: ReturnType<ReturnType<typeof useReviewCutTransitionProvider>['read']>;
  reserveSource(bytes: number): { release(): void };
  captureCamera(): ReviewWebcamFrameLease | undefined;
}) {
  let raw: VideoFrame | undefined;
  let sample: VideoSample | undefined;
  let gpu: VideoFrame | undefined;
  let reservation: { release(): void } | undefined;
  let camera: ReviewWebcamFrameLease | undefined;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    camera?.release();
    gpu?.close();
    sample?.close();
    raw?.close();
    args.releaseSource();
    reservation?.release();
  };
  try {
    raw = args.binding.source.toVideoFrame?.();
    if (!raw) throw new Error('Decoded source is unavailable.');
    reservation = args.reserveSource(previewSourceFrameBytes(raw));
    sample = new VideoSample(raw, {
      timestamp: args.binding.timestamp,
      rotation: args.binding.source.orientation?.rotation ?? 0,
      flip: args.binding.source.orientation?.flip ?? false,
    });
    raw = undefined;
    camera = args.captureCamera();
    const currentSample = () => {
      if (released || !sample) throw new Error('Preview source frame is unavailable.');
      return sample;
    };
    const frame: RenderFrame = {
      generation: args.sequence,
      fps: args.description.fps ?? 30,
      sourceTime: args.binding.target,
      resultTime: args.time,
      source: {
        timestamp: args.binding.timestamp,
        ...(args.binding.source.orientation
          ? { orientation: args.binding.source.orientation }
          : {}),
        backing: previewTransitionBacking(args.description, args.time),
        videoFrame: () => (gpu ??= currentSample().toVideoFrame()),
        prepare: async (signal) => {
          const previous = currentSample();
          gpu?.close();
          gpu = undefined;
          // The normalization owner consumes the sample, including cancellation failure.
          sample = undefined;
          const prepared = await prepareDecodedVideoSample(previous, signal);
          if (released) {
            prepared.close();
            throw new Error('Preview source frame is unavailable.');
          }
          sample = prepared;
        },
        draw: (context, x, y, width, height) => currentSample().draw(context, x, y, width, height),
      },
      ...(camera
        ? {
            camera: cameraDescription(camera),
          }
        : {}),
      ...(args.description.cameraTransform
        ? { cameraTransform: args.description.cameraTransform }
        : {}),
      ...(args.transition?.frames
        ? { transition: { blend: args.transition.blend, frames: args.transition.frames } }
        : {}),
    };
    return { value: frame, release };
  } catch {
    release();
    throw new Error('Preview source frame is unavailable.');
  }
}

export function previewTransitionBacking(
  description: Description,
  time: number
): { width: number; height: number } {
  const { source } = description.scene;
  const backing = description.dimensions.backing;
  const zoom = (
    description.cameraTransform ??
    evaluateQuickEditCameraAtTime(description.scene.zoomRegions, time, {
      source,
      canvas: description.scene.canvas,
      background: description.scene.background,
      windowHeader: description.scene.windowHeader,
      output: backing,
    })
  ).scale;
  const scale = Math.min(
    1,
    Math.max(backing.width / source.width, backing.height / source.height) * zoom
  );
  return {
    width: Math.max(1, Math.ceil(source.width * scale)),
    height: Math.max(1, Math.ceil(source.height * scale)),
  };
}
