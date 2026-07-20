import { translate } from '../i18n';

function drawCoverFrame(
  context: CanvasRenderingContext2D,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  draw: () => void
) {
  context.fillStyle = '#0f172a';
  context.fillRect(0, 0, width, height);

  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;

  context.save();
  context.translate(offsetX, offsetY);
  context.scale(drawWidth / sourceWidth, drawHeight / sourceHeight);
  draw();
  context.restore();
}

async function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: 'loadeddata' | 'seeked'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleSuccess = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(translate('shared.runtime.readBlobFailed')));
    };
    const cleanup = () => {
      video.removeEventListener(eventName, handleSuccess);
      video.removeEventListener('error', handleError);
    };

    video.addEventListener(eventName, handleSuccess, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

async function seekVideoToThumbnailFrame(video: HTMLVideoElement): Promise<void> {
  await waitForVideoEvent(video, 'loadeddata');

  if (Number.isFinite(video.duration) && video.duration > 0.12) {
    video.currentTime = Math.min(0.12, video.duration / 4);
    await waitForVideoEvent(video, 'seeked');
  }
}

function drawVideoThumbnailFrame(video: HTMLVideoElement, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error(translate('shared.runtime.thumbnailContextFailed'));
  }

  drawCoverFrame(
    context,
    video.videoWidth || width,
    video.videoHeight || height,
    width,
    height,
    () => context.drawImage(video, 0, 0)
  );

  return canvas;
}

async function canvasToThumbnailBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (value) {
          resolve(value);
          return;
        }

        reject(new Error(translate('shared.runtime.thumbnailContextFailed')));
      },
      'image/webp',
      0.88
    );
  });
}

function createThumbnailVideoElement(objectUrl: string) {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;
  return video;
}

export async function createVideoThumbnailBlob(
  blob: Blob,
  width = 320,
  height = 180
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(blob);
  const video = createThumbnailVideoElement(objectUrl);

  try {
    await seekVideoToThumbnailFrame(video);
    return canvasToThumbnailBlob(drawVideoThumbnailFrame(video, width, height));
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.src = '';
  }
}
