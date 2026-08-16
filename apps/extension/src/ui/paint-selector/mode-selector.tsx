import { Aperture, CircleDot, LayoutTemplate, MoveUpRight, Palette } from 'lucide-react';
import type { GradientType } from '@sniptale/foundation/paint';
import { ProductGlassIconButton } from '@sniptale/ui/product-glass-controls';
import { Fragment } from 'react';
import { translate } from '../../platform/i18n';

const MODES = [
  { icon: Palette, mode: 'solid' },
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
  activeSection: 'paint' | 'templates';
  allowedModes?: readonly ('solid' | GradientType)[];
  mode: 'solid' | GradientType;
  onChange: (mode: 'solid' | GradientType) => void;
  onShowTemplates: () => void;
}) {
  return (
    <div
      aria-label={translate('highlighter.paintPicker.mode')}
      className="flex min-w-0 items-center gap-1"
      role="toolbar"
    >
      {MODES.filter(({ mode }) => props.allowedModes?.includes(mode) ?? true).map(
        ({ icon: Icon, mode }, index) => {
          const label = getModeLabel(mode);
          return (
            <Fragment key={mode}>
              <ProductGlassIconButton
                active={props.activeSection === 'paint' && props.mode === mode}
                aria-label={label}
                className="!h-8 !w-8 shrink-0"
                onClick={() => props.onChange(mode)}
                title={label}
              >
                <Icon aria-hidden="true" size={14} />
              </ProductGlassIconButton>
              {index === 0 ? (
                <ProductGlassIconButton
                  active={props.activeSection === 'templates'}
                  aria-label={translate('highlighter.paintPicker.presets')}
                  className="!h-8 !w-8 shrink-0"
                  onClick={props.onShowTemplates}
                  title={translate('highlighter.paintPicker.presets')}
                >
                  <LayoutTemplate aria-hidden="true" size={14} />
                </ProductGlassIconButton>
              ) : null}
            </Fragment>
          );
        }
      )}
    </div>
  );
}
