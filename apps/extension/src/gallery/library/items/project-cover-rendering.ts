import type { ScenarioPreviewStep } from '../../../features/scenario/contracts/types/project';

const WIDTH = 640;
const HEIGHT = 360;
const DECODE_TIMEOUT_MS = 8000;

function createCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Gallery cover canvas unavailable');
  context.fillStyle = '#0f172a';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  return { canvas, context };
}

function toWebp(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new Error('Gallery cover encoding cancelled'));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Gallery cover encoding timed out'));
    }, DECODE_TIMEOUT_MS);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    canvas.toBlob(
      (blob) => {
        cleanup();
        if (blob) resolve(blob);
        else reject(new Error('Gallery cover encoding failed'));
      },
      'image/webp',
      0.88
    );
  });
}

function drawContained(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number
) {
  if (width <= 0 || height <= 0) throw new Error('Invalid cover dimensions');
  const scale = Math.min(WIDTH / width, HEIGHT / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  context.drawImage(
    source,
    (WIDTH - drawWidth) / 2,
    (HEIGHT - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
}

export async function renderImage(
  blob: Blob,
  signal: AbortSignal,
  framing?: ScenarioPreviewStep['images'][number]
): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        signal.removeEventListener('abort', abort);
      };
      const abort = () => {
        cleanup();
        reject(new Error('Image decode cancelled'));
      };
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error('Image decode timed out'));
      }, DECODE_TIMEOUT_MS);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      image.onload = () => {
        cleanup();
        resolve();
      };
      image.onerror = () => {
        cleanup();
        reject(new Error('Image decode failed'));
      };
      image.src = url;
    });
    if (signal.aborted) throw new Error('Image decode cancelled');
    const { canvas, context } = createCanvas();
    if (framing) {
      const frameWidth = framing.frame.width;
      const frameHeight = framing.frame.height;
      if (frameWidth <= 0 || frameHeight <= 0) throw new Error('Invalid scenario frame');
      const frameScale = Math.min(WIDTH / frameWidth, HEIGHT / frameHeight);
      const viewportWidth = frameWidth * frameScale;
      const viewportHeight = frameHeight * frameScale;
      const frameX = (WIDTH - viewportWidth) / 2;
      const frameY = (HEIGHT - viewportHeight) / 2;
      const fitScale =
        framing.fit === 'cover'
          ? Math.max(viewportWidth / image.naturalWidth, viewportHeight / image.naturalHeight)
          : Math.min(viewportWidth / image.naturalWidth, viewportHeight / image.naturalHeight);
      const drawWidth = image.naturalWidth * fitScale * framing.contentTransform.scale;
      const drawHeight = image.naturalHeight * fitScale * framing.contentTransform.scale;
      // ScenarioPreviewStepCard renders the image element at 100% of the frame;
      // its CSS translate percentages therefore resolve against the frame box.
      context.save();
      context.beginPath();
      context.rect(frameX, frameY, viewportWidth, viewportHeight);
      context.clip();
      context.drawImage(
        image,
        frameX + (viewportWidth - drawWidth) / 2 + framing.contentTransform.x * viewportWidth,
        frameY + (viewportHeight - drawHeight) / 2 + framing.contentTransform.y * viewportHeight,
        drawWidth,
        drawHeight
      );
      context.restore();
    } else drawContained(context, image, image.naturalWidth, image.naturalHeight);
    return toWebp(canvas, signal);
  } finally {
    image.src = '';
    URL.revokeObjectURL(url);
  }
}

export async function renderVideo(blob: Blob, signal: AbortSignal): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error('Video decode timed out'));
      }, DECODE_TIMEOUT_MS);
      const cleanup = () => {
        window.clearTimeout(timer);
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('error', fail);
        signal.removeEventListener('abort', abort);
      };
      const abort = () => {
        cleanup();
        reject(new Error('Video decode cancelled'));
      };
      const ready = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(new Error('Video decode failed'));
      };
      video.addEventListener('loadeddata', ready);
      video.addEventListener('error', fail);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      video.src = url;
    });
    if (signal.aborted) throw new Error('Video decode cancelled');
    const { canvas, context } = createCanvas();
    drawContained(context, video, video.videoWidth, video.videoHeight);
    return toWebp(canvas, signal);
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
