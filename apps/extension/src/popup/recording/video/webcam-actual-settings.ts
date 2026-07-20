import { translate } from '../../../platform/i18n';
import type { WebcamActualSettings } from '@sniptale/runtime-contracts/video/types/types';

export function formatKnownWebcamActualSettings(
  settings: WebcamActualSettings | null
): string | null {
  if (!settings?.width || !settings.height) {
    return null;
  }

  const frameRate =
    typeof settings.frameRate === 'number'
      ? translate('popup.video.webcamQualityActualFps').replace(
          '{fps}',
          String(Math.round(settings.frameRate))
        )
      : translate('popup.video.webcamQualityActualFpsUnknown');

  return translate('popup.video.webcamQualityActual')
    .replace('{resolution}', `${settings.width}x${settings.height}`)
    .replace('{frameRate}', frameRate);
}
