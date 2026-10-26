import type { CameraScreenPanel } from '../../features/video/project/camera/split';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import {
  quickEditWebcamScreenPlacementAt,
  type QuickEditWebcam,
} from '../../features/video/review/advanced/webcam';
import {
  presentationMainColor,
  presentationMainColorOpacity,
  type PresentationSequencePlan,
} from '../../features/video/review/presentation-sequence';

export function reviewSplitScreenAt(
  webcam: QuickEditWebcam | undefined,
  sourceTime: number,
  hasCamera: boolean
): CameraScreenPanel | null {
  return webcam && hasCamera ? quickEditWebcamScreenPlacementAt(webcam, sourceTime) : null;
}

export function reviewSplitRasterAt(
  webcam: QuickEditWebcam | undefined,
  sourceTime: number,
  hasCamera: boolean,
  backing: { width: number; height: number }
) {
  const screen = reviewSplitScreenAt(webcam, sourceTime, hasCamera);
  return screen && (screen.width < 1 || screen.height < 1 || screen.clip) ? backing : null;
}

export function reviewSplitCameraStyle(
  webcam: QuickEditWebcam,
  screen: CameraScreenPanel | null
): QuickEditWebcam {
  if (
    !screen ||
    (screen.width === 1 && screen.height === 1 && !screen.clip && !screen.cameraOverlay)
  )
    return webcam;
  return {
    ...webcam,
    appearance: { ...webcam.appearance, shape: 'rounded', roundness: 0 },
    shadow: { intensity: 0, color: '#000000' },
  };
}

/** Compose the existing scene raster into its screen pane; camera painting follows this step. */
export function paintReviewCameraSplitScreen(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  backing: { width: number; height: number },
  screen: CameraScreenPanel | null,
  resources: RenderResources
): void {
  if (!screen || (screen.width === 1 && screen.height === 1 && !screen.clip)) return;
  const scratch = resources.canvas('camera-split-source', backing);
  try {
    scratch.context.drawImage(canvas, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#101014';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    try {
      if (screen.clip) {
        context.beginPath();
        context.rect(
          screen.clip.x * canvas.width,
          screen.clip.y * canvas.height,
          screen.clip.width * canvas.width,
          screen.clip.height * canvas.height
        );
        context.clip();
      }
      context.drawImage(
        scratch.canvas,
        screen.x * canvas.width,
        screen.y * canvas.height,
        screen.width * canvas.width,
        screen.height * canvas.height
      );
    } finally {
      context.restore();
    }
  } finally {
    scratch.release();
  }
}

/** Final backing-space fill, outside camera, watermark and transition transforms. */
export function paintPreviewOuterFade(
  context: CanvasRenderingContext2D,
  backing: { width: number; height: number },
  plan: PresentationSequencePlan | undefined,
  resultTime: number
): void {
  if (!plan) return;
  context.save();
  try {
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = presentationMainColorOpacity(plan, resultTime);
    context.fillStyle = presentationMainColor(plan, resultTime);
    context.fillRect(0, 0, backing.width, backing.height);
  } finally {
    context.restore();
  }
}
