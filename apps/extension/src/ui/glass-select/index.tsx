import { GLASS_SELECT_ANIMATION_CSS } from '@sniptale/ui/glass-select/styles';
import { GlassSelectContent } from './content';
import type { GlassSelectProps } from '@sniptale/ui/glass-select/types';
import { useGlassSelectController } from './controller';

export type { GlassSelectOption, GlassSelectProps } from '@sniptale/ui/glass-select/types';

export function GlassSelect<T extends string = string>({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className = '',
  menuClassName = '',
  size = 'md',
  portal = false,
  variant = 'default',
  dataUi,
  'aria-label': ariaLabel,
}: GlassSelectProps<T>) {
  const controller = useGlassSelectController({
    value,
    onChange,
    options,
    disabled,
    size,
    portal,
    variant,
    ...(placeholder === undefined ? {} : { placeholder }),
  });

  return (
    <div
      ref={controller.containerRef}
      className={`relative ${className}`}
      data-ui={dataUi ?? 'shared.ui.glass-select'}
      aria-label={ariaLabel}
    >
      <GlassSelectContent
        controller={controller}
        disabled={disabled}
        portal={portal}
        options={options}
        value={value}
        size={size}
        menuClassName={menuClassName}
      />

      <style>{GLASS_SELECT_ANIMATION_CSS}</style>
    </div>
  );
}
