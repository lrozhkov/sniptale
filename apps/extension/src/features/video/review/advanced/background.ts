import type { Gradient, Paint } from '@sniptale/foundation/paint';
import { createGradientPaint } from '@sniptale/foundation/paint';
import type { QuickEditBackgroundLayout, QuickEditBackgroundSettings } from './types';

/** Persisted layout bounds, matching the workspace validation. */
const MAX_BACKGROUND_SIZE = 4096;
const DEFAULT_LAYOUT: QuickEditBackgroundLayout = { padding: 40, cornerRadius: 12 };
const DEFAULT_COLOR = '#000000ff';

const clampLayout = (layout: QuickEditBackgroundLayout): QuickEditBackgroundLayout => ({
  ...(layout.shadow
    ? {
        shadow: {
          ...layout.shadow,
          intensity: Math.max(0, Math.min(100, layout.shadow.intensity)),
        },
      }
    : {}),
  ...(layout.blur === undefined ? {} : { blur: Math.max(0, Math.min(25, layout.blur)) }),
  padding: Math.max(0, Math.min(MAX_BACKGROUND_SIZE, layout.padding)),
  cornerRadius: Math.max(0, Math.min(MAX_BACKGROUND_SIZE, layout.cornerRadius)),
});

export interface QuickEditBackgroundPatch {
  zoomBehavior?: QuickEditBackgroundSettings['zoomBehavior'];
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
 * disabled backgrounds retain their layout and paint, and layout edits clamp into the contract.
 */
export function updateQuickEditBackground(
  background: QuickEditBackgroundSettings,
  patch: QuickEditBackgroundPatch
): QuickEditBackgroundSettings {
  const zoomBehavior = patch.zoomBehavior ?? background.zoomBehavior;
  const motion = zoomBehavior ? { zoomBehavior } : {};
  const image =
    background.enabled && background.type === 'image'
      ? { assetId: background.assetId, imageFit: background.imageFit }
      : background.rememberedImage;
  const retained = image ? { rememberedImage: image } : {};
  const paint: Paint | undefined =
    background.enabled && background.type === 'solid'
      ? { kind: 'solid', color: background.color }
      : background.enabled && background.type === 'gradient'
        ? { kind: 'gradient', gradient: background.gradient }
        : background.rememberedPaint;
  const remembered = paint ? { rememberedPaint: paint } : {};
  if (patch.enabled === false)
    return {
      enabled: false,
      ...motion,
      ...retained,
      ...remembered,
      ...(background.enabled
        ? { rememberedLayout: background.layout }
        : background.rememberedLayout
          ? { rememberedLayout: background.rememberedLayout }
          : {}),
    };
  const layout = patch.layout
    ? clampLayout(patch.layout)
    : background.enabled
      ? background.layout
      : (background.rememberedLayout ?? { ...DEFAULT_LAYOUT });
  const type = patch.type ?? (background.enabled ? background.type : (paint?.kind ?? 'solid'));
  if (type === 'solid')
    return {
      ...motion,
      ...retained,
      enabled: true,
      type,
      color: patch.color ?? (paint?.kind === 'solid' ? paint.color : DEFAULT_COLOR),
      layout,
    };
  if (type === 'gradient') {
    const gradient = patch.gradient ?? (paint?.kind === 'gradient' ? paint.gradient : null);
    if (gradient) return { enabled: true, type, gradient, layout, ...motion, ...retained };
    // A paint switch must turn the background on even without stored gradient
    // data: derive a ready two-stop default from the previous paint color.
    const fallbackColor = patch.color ?? (paint?.kind === 'solid' ? paint.color : DEFAULT_COLOR);
    const fallback = createGradientPaint(fallbackColor, () => crypto.randomUUID(), 'linear');
    if (fallback.kind !== 'gradient') return { enabled: false };
    return { enabled: true, type, gradient: fallback.gradient, layout, ...motion, ...retained };
  }
  return {
    enabled: true,
    ...motion,
    ...remembered,
    type: 'image',
    assetId: patch.assetId ?? image?.assetId ?? '',
    imageFit: patch.imageFit ?? image?.imageFit ?? 'cover',
    layout,
  };
}
