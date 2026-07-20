import type { FrameData } from '../../../features/highlighter/contracts';
import { cropImage } from '@sniptale/platform/browser/media/image-crop';
import type { ScreenshotCaptureAdapter } from '../../../content/public/preparation-surface';
import { composeViewerCaptureOverlays } from './overlays';
import { renderViewerFrameToDataUrl } from './render';
import { requestViewerSelectionArea } from './selection';
import type { ViewerCaptureMode } from './types';

type ViewerScreenshotCaptureAdapterArgs = {
  getFrames?: () => FrameData[];
  iframe: HTMLIFrameElement | null;
};

function resolveViewerIframe(iframe: HTMLIFrameElement | null): HTMLIFrameElement {
  if (!iframe?.contentDocument) {
    throw new Error('Web snapshot viewer frame is not ready for screenshot capture.');
  }

  return iframe;
}

async function captureViewport(
  iframe: HTMLIFrameElement | null,
  mode: ViewerCaptureMode,
  getFrames: (() => FrameData[]) | undefined
): Promise<string> {
  const resolvedIframe = resolveViewerIframe(iframe);
  const baseDataUrl = await renderViewerFrameToDataUrl(resolvedIframe, mode);
  return composeViewerCaptureOverlays({
    baseDataUrl,
    frames: getFrames?.() ?? [],
    iframe: resolvedIframe,
    mode,
  });
}

async function captureSelection(
  iframe: HTMLIFrameElement | null,
  getFrames: (() => FrameData[]) | undefined
): Promise<string> {
  const resolvedIframe = resolveViewerIframe(iframe);
  const area = await requestViewerSelectionArea(resolvedIframe);
  const frameDataUrl = await captureViewport(resolvedIframe, 'visible', getFrames);
  return cropImage(frameDataUrl, area);
}

export function createViewerScreenshotCaptureAdapter(
  args: ViewerScreenshotCaptureAdapterArgs
): ScreenshotCaptureAdapter {
  return {
    captureSelection: () => captureSelection(args.iframe, args.getFrames),
    captureViewport: (mode) => captureViewport(args.iframe, mode, args.getFrames),
  };
}
