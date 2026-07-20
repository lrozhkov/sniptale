import { createLogger } from '@sniptale/platform/observability/logger';
import {
  getFirstSupportedMediaRecorderMimeType,
  RECORDING_MIME_TYPE_CANDIDATES,
} from './recorder-mime';

const logger = createLogger({ namespace: 'OffscreenPreview' });

interface DesktopPreviewController {
  attachDesktopPreview: (stream: MediaStream) => HTMLVideoElement;
  detachDesktopPreview: (video: HTMLVideoElement | null) => null;
}

export function createDesktopPreviewController(): DesktopPreviewController {
  return {
    attachDesktopPreview(stream: MediaStream): HTMLVideoElement {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = stream;

      video.play().catch((error) => {
        logger.warn('Desktop preview play() rejected', error);
      });

      return video;
    },

    detachDesktopPreview(video: HTMLVideoElement | null): null {
      if (!video) {
        return null;
      }

      video.pause();
      video.srcObject = null;
      video.remove();
      return null;
    },
  };
}

export function getSupportedMimeType(): string {
  return getFirstSupportedMediaRecorderMimeType(RECORDING_MIME_TYPE_CANDIDATES);
}
