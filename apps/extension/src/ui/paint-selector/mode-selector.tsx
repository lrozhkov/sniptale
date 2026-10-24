import type { GradientType } from '@sniptale/foundation/paint';
import { translate } from '../../platform/i18n';

const TYPES = ['linear', 'radial', 'conic'] as const;
const buttonClass = [
  'h-8 min-w-0 flex-1 cursor-pointer rounded-[3px] px-2 text-xs',
  'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'aria-pressed:bg-[var(--sniptale-picker-selected)]',
  'aria-pressed:text-[var(--sniptale-color-text-primary)] focus-visible:outline-1',
  'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

export function PaintModeSelector(props: {
  activeSection: 'paint' | 'templates';
  allowedModes?: readonly ('solid' | GradientType)[];
  mode: 'solid' | GradientType;
  onChange: (mode: 'solid' | GradientType) => void;
  onShowTemplates: () => void;
}) {
  const types = TYPES.filter((type) => props.allowedModes?.includes(type) ?? true);
  const solid = props.allowedModes?.includes('solid') ?? true;
  return (
    <div className="min-w-0" data-ui="shared.ui.paint-selector.modes">
      <div
        role="group"
        aria-label={translate('highlighter.paintPicker.mode')}
        className="flex gap-0.5"
      >
        {solid && (
          <button
            type="button"
            className={buttonClass}
            aria-label={translate('highlighter.paintPicker.solid')}
            aria-pressed={props.activeSection === 'paint' && props.mode === 'solid'}
            onClick={() => props.onChange('solid')}
          >
            {translate('highlighter.paintPicker.solid')}
          </button>
        )}
        {types.length > 0 && (
          <button
            type="button"
            className={buttonClass}
            aria-label={translate('highlighter.paintPicker.gradient')}
            aria-pressed={props.activeSection === 'paint' && props.mode !== 'solid'}
            onClick={() => props.onChange(props.mode === 'solid' ? types[0]! : props.mode)}
          >
            {translate('highlighter.paintPicker.gradient')}
          </button>
        )}
        {types.length > 0 && (
          <button
            type="button"
            className={buttonClass}
            aria-label={translate('highlighter.paintPicker.presets')}
            aria-pressed={props.activeSection === 'templates'}
            onClick={props.onShowTemplates}
          >
            {translate('highlighter.paintPicker.presets')}
          </button>
        )}
      </div>
    </div>
  );
}

export function GradientTypeSelector(props: {
  allowedModes?: readonly ('solid' | GradientType)[];
  mode: GradientType;
  onChange: (mode: GradientType) => void;
}) {
  const types = TYPES.filter((type) => props.allowedModes?.includes(type) ?? true);
  if (types.length <= 1) return null;
  return (
    <div
      className="flex h-7 min-w-0 gap-0.5"
      role="group"
      aria-label={translate('highlighter.paintPicker.gradient')}
    >
      {types.map((type) => (
        <button
          key={type}
          type="button"
          className={`${buttonClass} h-7! px-1.5!`}
          aria-label={translate(`highlighter.paintPicker.${type}`)}
          aria-pressed={props.mode === type}
          onClick={() => props.onChange(type)}
        >
          {translate(`highlighter.paintPicker.${type}`)}
        </button>
      ))}
    </div>
  );
}
