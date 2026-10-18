import type { LucideIcon } from 'lucide-react';
import type { Ref } from 'react';
import { useCommandPress } from '@sniptale/ui/control-language/press';

export function CameraWindowButton({
  icon: Icon,
  label,
  disabled = false,
  onClick,
  ref,
  tone = 'default',
}: {
  icon?: LucideIcon;
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
      className="inline-flex min-w-0 w-full items-center justify-center gap-1.5 disabled:opacity-40"
      data-command-press=""
      data-command-tone={tone === 'danger' ? 'danger' : 'secondary'}
      data-pressing={press.pressed ? 'true' : undefined}
      title={label}
      aria-label={label}
      type="button"
      disabled={disabled}
    >
      <span className="sniptale-command-content">
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
        <span className="truncate">{label}</span>
      </span>
    </button>
  );
}
