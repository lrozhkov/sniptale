import type { Settings } from '../../../contracts/settings';
import { delay } from '@sniptale/foundation/utils/delay';
import { hideFixedElements, restoreFixedElements } from '../page-state/index';

type VisibleCaptureSettings = Pick<Settings, 'imageFormat' | 'imageQuality'>;

interface VisibleCaptureViewport {
  width: number;
  height: number;
}

interface FixedElementMaskingAdapter {
  hideFixedElements(tabId: number): Promise<number>;
  restoreFixedElements(tabId: number): Promise<void>;
  waitForDomSettle(ms: number): Promise<void>;
}

const FIXED_ELEMENT_CAPTURE_DELAY_MS = 300;

const defaultFixedElementMaskingAdapter: FixedElementMaskingAdapter = {
  hideFixedElements,
  restoreFixedElements,
  waitForDomSettle: delay,
};

/**
 * Chrome's visible capture APIs cannot emit WebP directly, so WebP requests first capture PNG
 * and convert it in-process.
 */
export function resolveVisibleCaptureApiFormat(
  imageFormat: VisibleCaptureSettings['imageFormat']
): 'png' | 'jpeg' {
  return imageFormat === 'webp' ? 'png' : imageFormat;
}

/**
 * Builds the debugger screenshot payload for a fixed viewport capture.
 */
export function buildViewportCaptureScreenshotOptions(
  viewport: VisibleCaptureViewport,
  settings: VisibleCaptureSettings
) {
  return {
    format: resolveVisibleCaptureApiFormat(settings.imageFormat),
    quality: settings.imageQuality,
    clip: {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
      scale: 1,
    },
    fromSurface: true,
  };
}

/**
 * Converts the debugger screenshot payload into a data URL that matches the captured wire format.
 */
export function createDebuggerCaptureDataUrl(
  data: string,
  imageFormat: VisibleCaptureSettings['imageFormat']
): string {
  const wireFormat = resolveVisibleCaptureApiFormat(imageFormat);
  return `data:image/${wireFormat};base64,${data}`;
}

/**
 * Post-processes visible captures so requested WebP output still respects the user's settings.
 */
export async function finalizeCapturedDataUrl(props: {
  dataUrl: string;
  settings: VisibleCaptureSettings;
  convertPngToWebp: (pngDataUrl: string, quality: number) => Promise<string>;
}): Promise<string> {
  if (props.settings.imageFormat !== 'webp') {
    return props.dataUrl;
  }

  return props.convertPngToWebp(props.dataUrl, props.settings.imageQuality);
}

/**
 * Runs a capture with fixed-position page elements hidden long enough for the DOM to settle, then
 * always restores the page state.
 */
export async function withHiddenFixedElements<T>(
  tabId: number,
  runCapture: () => Promise<T>,
  adapter: FixedElementMaskingAdapter = defaultFixedElementMaskingAdapter
): Promise<{ hiddenCount: number; result: T }> {
  const hiddenCount = await adapter.hideFixedElements(tabId);
  await adapter.waitForDomSettle(FIXED_ELEMENT_CAPTURE_DELAY_MS);

  try {
    const result = await runCapture();
    return { hiddenCount, result };
  } finally {
    await adapter.restoreFixedElements(tabId);
  }
}
