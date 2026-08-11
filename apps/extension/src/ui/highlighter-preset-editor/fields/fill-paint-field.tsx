import { getRepresentativeColor, type Paint } from '@sniptale/foundation/paint';
import { CompactPaintSelector } from '../../paint-selector';

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
