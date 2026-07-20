import type { InputHTMLAttributes, ReactNode } from 'react';
import { ProductGlassColorOption, ProductGlassColorTrigger } from './primitives';

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

export interface ProductGlassColorPaletteProps {
  colors: string[];
  value: string;
  disabled?: boolean;
  onSelect?: (color: string) => void;
}

export interface ProductGlassColorFieldProps {
  label: ReactNode;
  value: string;
  colors: string[];
  disabled?: boolean;
  onValueChange?: (value: string) => void;
  onPresetSelect?: (color: string) => void;
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'disabled'>;
}

export function ProductGlassColorPalette({
  colors,
  value,
  disabled = false,
  onSelect,
}: ProductGlassColorPaletteProps) {
  return (
    <div
      className={joinClassNames(
        'sniptale-glass-color-palette',
        disabled && 'sniptale-glass-color-palette--disabled'
      )}
    >
      {colors.map((color) => {
        const isActive = value.toLowerCase() === color.toLowerCase();

        return (
          <ProductGlassColorOption
            key={color}
            disabled={disabled}
            onClick={() => onSelect?.(color)}
            active={isActive}
            style={{ backgroundColor: color }}
            title={color}
          />
        );
      })}
    </div>
  );
}

export function ProductGlassColorField({
  label,
  value,
  colors,
  disabled = false,
  onValueChange,
  onPresetSelect,
  inputProps,
}: ProductGlassColorFieldProps) {
  return (
    <div className="sniptale-glass-color-control">
      <div className="sniptale-glass-color-line">
        <span className="sniptale-glass-color-label sniptale-glass-color-label--inline">
          {label}
        </span>
        <div className="sniptale-glass-color-line-main">
          <ProductGlassColorTrigger
            active={!disabled}
            disabled={disabled}
            className="sniptale-glass-hidden-color"
          >
            <span className="sniptale-glass-color-swatch" style={{ backgroundColor: value }} />
            <input
              {...inputProps}
              className={joinClassNames('sniptale-glass-color-native', inputProps?.className)}
              type="color"
              value={value}
              disabled={disabled}
              onChange={(event) => {
                inputProps?.onChange?.(event);
                onValueChange?.(event.target.value);
              }}
            />
          </ProductGlassColorTrigger>
          <ProductGlassColorPalette
            colors={colors}
            value={value}
            disabled={disabled}
            {...(onPresetSelect === undefined ? {} : { onSelect: onPresetSelect })}
          />
        </div>
      </div>
    </div>
  );
}
