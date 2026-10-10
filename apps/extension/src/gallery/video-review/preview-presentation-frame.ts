import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import type { ReviewWebcamFrameLease } from './webcam-preview';
import type { useReviewCutTransitionProvider } from './cut-transition-preview';
import type { Description, RenderFrame } from './preview-presentation-state';

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
  let source: VideoFrame;
  try {
    source = new VideoFrame(args.video);
  } catch (error) {
    // Metadata readiness can precede the first capturable native frame in Chrome.
    // Only that constructor state is transient; decoding/admission errors remain failures.
    if (error instanceof DOMException && error.name === 'InvalidStateError') return null;
    throw error;
  }
  let reservation: { release(): void } | undefined;
  let camera: ReviewWebcamFrameLease | undefined;
  const release = () => {
    camera?.release();
    source.close();
    reservation?.release();
  };
  try {
    const bytes = source.allocationSize();
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || !Number.isFinite(source.timestamp))
      throw new Error('Invalid source frame allocation');
    reservation = args.reserveSource(bytes);
    camera = args.captureCamera();
    const frame: RenderFrame = {
      generation: args.sequence,
      sourceTime: args.sourceTime(),
      resultTime: args.time,
      source: {
        timestamp: source.timestamp / 1e6,
        backing: previewTransitionBacking(args.description, args.time),
        draw: (context, x, y, width, height) => context.drawImage(source, x, y, width, height),
      },
      ...(camera
        ? {
            camera: {
              representedMediaTime: camera.representedMediaTime,
              generation: camera.generation,
              source: camera.source,
              placement: camera.placement,
              drawable: camera.drawable,
              ...(camera.crop ? { crop: camera.crop } : {}),
            },
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

export function previewTransitionBacking(
  description: Description,
  time: number
): { width: number; height: number } {
  const { source } = description.scene;
  const backing = description.dimensions.backing;
  const zoom = (
    description.cameraTransform ??
    evaluateQuickEditCameraAtTime(description.scene.zoomRegions, time)
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
