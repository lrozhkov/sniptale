import type { Settings } from '../../../contracts/settings';
import type { ScreenshotViewport } from '../../routing-contracts/tab-mode-state';

export function resolveDefaultScreenshotViewport(
  settings: Pick<Settings, 'defaultViewportId' | 'viewportPresets'>
): ScreenshotViewport {
  const defaultViewportId = settings.defaultViewportId || 'native';
  if (defaultViewportId === 'native') {
    return null;
  }

  const preset = settings.viewportPresets?.find((item) => item.id === defaultViewportId);
  if (!preset) {
    return null;
  }

  return {
    width: preset.width,
    height: preset.height,
  };
}

export function createViewportStateSnapshot(
  width: number | undefined | null,
  height: number | undefined | null
): ScreenshotViewport {
  if (!width || !height) {
    return null;
  }

  return { width, height };
}
