import type { LucideIcon } from 'lucide-react';
import type { Ref } from 'react';
import { useCommandPress } from '@sniptale/ui/control-language/press';

export function CameraWindowButton({
  icon: Icon,
  iconOnly = false,
  pressed,
  responsiveLabel = false,
  ariaExpanded,
  ariaControls,
  label,
  disabled = false,
  onClick,
  ref,
  tone = 'default',
}: {
  icon?: LucideIcon;
  iconOnly?: boolean;
  pressed?: boolean;
  responsiveLabel?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
  tone?: 'danger' | 'default';
}) {
  const press = useCommandPress({ disabled, onClick });
  return (
    <button
      {...press.props}
      ref={ref}
      className={[
        'inline-flex min-w-0 items-center justify-center gap-1.5 disabled:opacity-40',
        iconOnly ? 'size-8 shrink-0' : 'w-full',
        responsiveLabel ? 'camera-recording-command' : '',
      ].join(' ')}
      data-command-press=""
      data-command-tone={
        pressed === undefined ? (tone === 'danger' ? 'danger' : 'secondary') : 'toggle'
      }
      data-command-property={pressed === undefined ? undefined : 'true'}
      data-active={pressed === undefined ? undefined : String(pressed)}
      aria-pressed={pressed}
      data-pressing={press.pressed ? 'true' : undefined}
      title={label}
      aria-label={label}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      type="button"
      disabled={disabled}
    >
      <span className="sniptale-command-content">
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
        <span
          className={
            iconOnly
              ? 'sr-only'
              : responsiveLabel
                ? 'camera-recording-command-label truncate'
                : 'truncate'
          }
        >
          {label}
        </span>
      </span>
    </button>
  );
}
