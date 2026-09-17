import type { Gradient } from '@sniptale/foundation/paint';
import type { QuickEditBackgroundLayout, QuickEditBackgroundSettings } from './types';

/** Persisted layout bounds, matching the workspace validation. */
const MAX_BACKGROUND_SIZE = 4096;
const DEFAULT_LAYOUT: QuickEditBackgroundLayout = { padding: 40, cornerRadius: 24 };
const DEFAULT_COLOR = '#000000ff';

const clampLayout = (layout: QuickEditBackgroundLayout): QuickEditBackgroundLayout => ({
  padding: Math.max(0, Math.min(MAX_BACKGROUND_SIZE, layout.padding)),
  cornerRadius: Math.max(0, Math.min(MAX_BACKGROUND_SIZE, layout.cornerRadius)),
});

export interface QuickEditBackgroundPatch {
  enabled?: boolean;
  type?: 'solid' | 'gradient' | 'image';
  color?: string;
  gradient?: Gradient;
  assetId?: string;
  imageFit?: 'cover' | 'contain';
  layout?: QuickEditBackgroundLayout;
}

/**
 * Background belongs to the whole canvas, not to a clip: paint switches keep the layout,
 * none/paint switches start from the default layout, and the layout clamps into the contract.
 */
export function updateQuickEditBackground(
  background: QuickEditBackgroundSettings,
  patch: QuickEditBackgroundPatch
): QuickEditBackgroundSettings {
  if (patch.enabled === false) return { enabled: false };
  const layout = patch.layout
    ? clampLayout(patch.layout)
    : background.enabled
      ? background.layout
      : { ...DEFAULT_LAYOUT };
  const type = patch.type ?? (background.enabled ? background.type : 'solid');
  const active = background.enabled ? background : null;
  if (type === 'solid')
    return {
      enabled: true,
      type,
      color: patch.color ?? (active && active.type === 'solid' ? active.color : DEFAULT_COLOR),
      layout,
    };
  if (type === 'gradient') {
    const gradient =
      patch.gradient ?? (active && active.type === 'gradient' ? active.gradient : null);
    if (!gradient) return background;
    return { enabled: true, type, gradient, layout };
  }
  return {
    enabled: true,
    type: 'image',
    assetId: patch.assetId ?? (active && active.type === 'image' ? active.assetId : ''),
    imageFit: patch.imageFit ?? (active && active.type === 'image' ? active.imageFit : 'cover'),
    layout,
  };
}
