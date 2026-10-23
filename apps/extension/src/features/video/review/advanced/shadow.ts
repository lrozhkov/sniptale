import { resolveVideoMediaShadowParams } from '../../composition/canvas/media-shadow';
import type { QuickEditBackgroundSettings } from './types';

/** Source-image style glow: centered, intensity controls opacity and spread. */
export function resolveQuickEditShadow(background: QuickEditBackgroundSettings, scale = 1) {
  const shadow = background.enabled ? background.layout.shadow : undefined;
  if (!shadow || shadow.intensity <= 0) return null;
  return {
    color: shadow.color,
    opacity: shadow.intensity / 100,
    blur: resolveVideoMediaShadowParams(shadow.intensity, scale)!.blur,
  };
}
