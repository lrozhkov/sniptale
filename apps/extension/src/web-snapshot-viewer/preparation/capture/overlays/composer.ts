import type { FrameData } from '../../../../features/highlighter/contracts';
import { createFrameAnnotationSnapshot } from '../../../../features/highlighter/frame-annotation';
import { rasterizeFrameAnnotations } from '../../../../composition/frame-annotation-raster-client';
import { blobToDataUrl, dataUrlToBlob } from '../../../../platform/media-utils/data-url';
import type { ViewerCaptureMode } from '../types';
import { createRuntimeMessagingTransport } from '../../../../platform/runtime-messaging';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../platform/i18n';

const frameAnnotationRasterTransport = createRuntimeMessagingTransport();

function loadDataUrlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Web snapshot viewer overlay image could not load.'));
    image.src = dataUrl;
  });
}

export async function composeViewerCaptureOverlays(args: {
  baseDataUrl: string;
  frames: FrameData[];
  iframe: HTMLIFrameElement;
  mode: ViewerCaptureMode;
}): Promise<string> {
  if (args.frames.length === 0) return args.baseDataUrl;
  const image = await loadDataUrlImage(args.baseDataUrl);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (imageWidth <= 0 || imageHeight <= 0) return args.baseDataUrl;

  const scale = window.devicePixelRatio || 1;
  const width = imageWidth / scale;
  const height = imageHeight / scale;
  const iframeRect = args.iframe.getBoundingClientRect();
  const scrollX = args.mode === 'full' ? (args.iframe.contentWindow?.scrollX ?? 0) : 0;
  const scrollY = args.mode === 'full' ? (args.iframe.contentWindow?.scrollY ?? 0) : 0;
  const snapshots = args.frames.map((frame, ordering) =>
    createFrameAnnotationSnapshot(
      {
        ...frame,
        x: frame.x - iframeRect.left + scrollX,
        y: frame.y - iframeRect.top + scrollY,
      },
      ordering
    )
  );
  const output = await rasterizeFrameAnnotations({
    transport: frameAnnotationRasterTransport,
    input: {
      baseImage: await dataUrlToBlob(args.baseDataUrl),
      width,
      height,
      requestedWidth: imageWidth,
      requestedHeight: imageHeight,
      snapshots,
    },
  });
  const result = await blobToDataUrl(output.blob);
  if (output.metadata.downscaled) {
    showToast(translate('highlighter.exportOptimizedSize'), 'warning');
  }
  return result;
}
