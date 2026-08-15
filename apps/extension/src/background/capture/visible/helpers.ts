import type { Settings } from '../../../contracts/settings';

type VisibleCaptureSettings = Pick<Settings, 'imageFormat' | 'imageQuality'>;

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
