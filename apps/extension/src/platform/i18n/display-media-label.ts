import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from './index';

export function normalizeDisplayMediaLabel(label: string, captureMode: CaptureMode): string {
  const trimmed = label.trim();
  const match = trimmed.match(/^(window|screen):([^:]+)(?::|$)/i);
  if (match) {
    const kind = match[1]?.toLowerCase();
    const id = match[2] ?? '';
    if (kind === 'window') {
      const windowLabel = translate('shared.displayMedia.windowLabel');
      return id ? `${windowLabel} (${id})` : windowLabel;
    }
    if (kind === 'screen') {
      const screenLabel = translate('shared.displayMedia.screenLabel');
      return id ? `${screenLabel} (${id})` : screenLabel;
    }
  }

  return (
    trimmed ||
    (captureMode === CaptureMode.SCREEN
      ? translate('shared.displayMedia.screenLabel')
      : translate('shared.displayMedia.windowLabel'))
  );
}
