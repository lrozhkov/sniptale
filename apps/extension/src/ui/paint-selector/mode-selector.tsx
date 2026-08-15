import { Aperture, CircleDot, MoveUpRight, Square } from 'lucide-react';
import type { GradientType } from '@sniptale/foundation/paint';
import {
  ProductGlassChip,
  ProductGlassChipIcon,
  ProductGlassOptionGrid,
} from '@sniptale/ui/product-glass-controls';
import { translate } from '../../platform/i18n';

const MODES = [
  { icon: Square, mode: 'solid' },
  { icon: MoveUpRight, mode: 'linear' },
  { icon: CircleDot, mode: 'radial' },
  { icon: Aperture, mode: 'conic' },
] as const;

function getModeLabel(mode: 'solid' | GradientType) {
  if (mode === 'solid') return translate('highlighter.paintPicker.solid');
  if (mode === 'linear') return translate('highlighter.paintPicker.linear');
  if (mode === 'radial') return translate('highlighter.paintPicker.radial');
  return translate('highlighter.paintPicker.conic');
}

export function PaintModeSelector(props: {
  allowedModes?: readonly ('solid' | GradientType)[];
  mode: 'solid' | GradientType;
  onChange: (mode: 'solid' | GradientType) => void;
}) {
  return (
    <ProductGlassOptionGrid
      aria-label={translate('highlighter.paintPicker.mode')}
      className="grid-cols-4"
      role="group"
    >
      {MODES.filter(({ mode }) => props.allowedModes?.includes(mode) ?? true).map(
        ({ icon: Icon, mode }) => {
          const label = getModeLabel(mode);
          return (
            <ProductGlassChip
              active={props.mode === mode}
              aria-label={label}
              className="min-w-0 gap-1.5 px-2 py-1.5"
              key={mode}
              onClick={() => props.onChange(mode)}
              title={label}
            >
              <ProductGlassChipIcon className="shrink-0">
                <Icon aria-hidden="true" size={14} />
              </ProductGlassChipIcon>
              <span className="truncate text-[11px] font-medium">{label}</span>
            </ProductGlassChip>
          );
        }
      )}
    </ProductGlassOptionGrid>
  );
}
