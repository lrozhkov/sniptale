import type { FullPageCaptureOptions } from './types';

export function resolveCaptureBlobOptions(props: {
  imageFormat: 'png' | 'jpeg' | 'webp';
  imageQuality: number;
  options: FullPageCaptureOptions;
}) {
  const format = props.options.format ?? props.imageFormat;
  const quality = props.options.quality ?? props.imageQuality / 100;

  return {
    format: format as 'png' | 'jpeg' | 'webp',
    quality,
    type: `image/${format}`,
  };
}
