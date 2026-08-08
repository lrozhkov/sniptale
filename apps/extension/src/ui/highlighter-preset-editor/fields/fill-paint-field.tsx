import type { Paint } from '@sniptale/foundation/paint';
import { useGradientPresetCatalog } from '../../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import { CompactPaintSelector } from '../../paint-selector';

export function HighlighterFillPaintField(props: {
  label: string;
  onChange: (paint: Paint) => void;
  onOpenChange?: (open: boolean) => void;
  value: Paint;
}) {
  const resources = useGradientPresetCatalog('highlighter-frame-fill');
  return (
    <CompactPaintSelector
      label={props.label}
      title={props.label}
      value={props.value}
      onChange={props.onChange}
      {...(props.onOpenChange ? { onOpenChange: props.onOpenChange } : {})}
      presets={resources.presets}
      presetActions={resources.actions}
    />
  );
}
