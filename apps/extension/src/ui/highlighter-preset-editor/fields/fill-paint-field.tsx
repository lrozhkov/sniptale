import { getRepresentativeColor, type Paint } from '@sniptale/foundation/paint';
import { CompactPaintSelector } from '../../paint-selector';
import { SurfaceStyleSelector } from '../../surface-style-selector';
import { useSurfaceStylePresetCatalog } from '../../../composition/surface-style-preset-resources/use-surface-style-preset-catalog';

const HIGHLIGHTER_FILL_PALETTE = [
  '#f97316',
  '#2563eb',
  '#16a34a',
  '#ef4444',
  '#8b5cf6',
  '#facc15',
  '#111827',
  '#f8fafc',
] as const;

export function HighlighterFillPaintField(props: {
  label: string;
  onChange: (paint: Paint) => void;
  onOpenChange?: (open: boolean) => void;
  value: Paint;
}) {
  return (
    <CompactPaintSelector
      label={props.label}
      title={props.label}
      value={props.value}
      onChange={props.onChange}
      palette={HIGHLIGHTER_FILL_PALETTE}
      recentColors={[getRepresentativeColor(props.value)]}
      {...(props.onOpenChange ? { onOpenChange: props.onOpenChange } : {})}
    />
  );
}

export function HighlighterFillSurfaceField(props: {
  customCss: string;
  inheritCustomCss: boolean;
  label: string;
  onChange: (value: { customCss: string; fillPaint: Paint; inheritCustomCss: boolean }) => void;
  onOpenChange?: (open: boolean) => void;
  value: Paint;
}) {
  const resources = useSurfaceStylePresetCatalog();
  return (
    <SurfaceStyleSelector
      actions={resources.actions}
      fieldLabel={props.label}
      onChange={(style) =>
        props.onChange({
          customCss: style.surfaceCss,
          fillPaint: style.fillPaint,
          inheritCustomCss: style.surfaceCss.trim().length > 0,
        })
      }
      {...(props.onOpenChange ? { onOpenChange: props.onOpenChange } : {})}
      palette={HIGHLIGHTER_FILL_PALETTE}
      presentation="selection"
      presets={resources.presets.filter((preset) => preset.enabled)}
      value={{
        fillPaint: props.value,
        surfaceCss: props.inheritCustomCss ? props.customCss : '',
      }}
    />
  );
}
