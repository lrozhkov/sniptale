import { useEffect, useState } from 'react';
import { createSolidPaint, serializePaintToCss, type Paint } from '@sniptale/foundation/paint';
import {
  getDrawingPaletteSnapshot,
  loadDrawingPaletteState,
  subscribeToDrawingPaletteState,
} from '../../composition/persistence/drawing-palette';
import { useGradientPresetCatalog } from '../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import { BackgroundThumbnails } from '../../ui/background-thumbnails';
import { CompactPaintSelector } from '../../ui/paint-selector';
import { translate } from '../../platform/i18n';

/** Read-only palette subscription; settings remains the sole owner of colors and their order. */
function useBackgroundPalette() {
  const [colors, setColors] = useState(() => getDrawingPaletteSnapshot().colors);
  useEffect(() => {
    let active = true;
    let observed = false;
    const unsubscribe = subscribeToDrawingPaletteState((state) => {
      observed = true;
      if (active) setColors(state.colors);
    });
    void loadDrawingPaletteState()
      .then((state) => {
        if (active && !observed) setColors(state.colors);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return colors;
}

/** Existing color palette followed by enabled gradients, with stable typed choice identities. */
export function ReviewBackgroundPaints(props: {
  value: Paint;
  onChange(paint: Paint): void;
  onPreview(paint: Paint | null): void;
}) {
  const colors = useBackgroundPalette();
  const { presets } = useGradientPresetCatalog('highlighter-frame-fill');
  const choices = [
    ...colors.map((color, index) => ({
      id: `color:${index}`,
      groupLabel: index === 0 ? translate('gallery.videoReview.backgroundColors') : undefined,
      name: `${translate('gallery.videoReview.backgroundSolid')} ${color}`,
      paint: createSolidPaint(color),
    })),
    ...presets
      .filter((preset) => preset.enabled)
      .toSorted((a, b) => a.order - b.order)
      .map((preset, index) => ({
        id: `gradient:${preset.id}`,
        groupLabel: index === 0 ? translate('gallery.videoReview.backgroundGradients') : undefined,
        name: preset.name,
        paint: { kind: 'gradient' as const, gradient: preset.gradient },
      })),
  ];
  return (
    <>
      <div className="review-background-swatches">
        <BackgroundThumbnails
          label={translate('gallery.videoReview.backgroundPaintPresets')}
          dataUi="gallery.videoReview.gradientPresets"
          items={choices.map((choice) => ({
            id: choice.id,
            name: choice.name,
            groupLabel: choice.groupLabel,
            active: serializePaintToCss(choice.paint) === serializePaintToCss(props.value),
            style: { background: serializePaintToCss(choice.paint) },
          }))}
          onSelect={(id) => {
            const choice = choices.find((item) => item.id === id);
            if (choice) props.onChange(choice.paint);
          }}
        />
      </div>
      <CompactPaintSelector
        triggerVariant="swatch"
        className="review-background-paint relative w-full min-w-0"
        label={translate('gallery.videoReview.background')}
        title={translate('gallery.videoReview.background')}
        value={props.value}
        palette={colors}
        onChange={props.onChange}
        onPreviewChange={props.onPreview}
        onPreviewReset={() => props.onPreview(null)}
      />
    </>
  );
}
