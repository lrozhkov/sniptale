import type { LucideIcon } from 'lucide-react';

export function CameraWindowButton({
  icon: Icon,
  label,
  disabled = false,
  onClick,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  tone?: 'danger' | 'default';
}) {
  return (
    <button
      className={[
        'inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] px-3 text-sm font-semibold',
        'disabled:pointer-events-none disabled:opacity-40',
        tone === 'danger'
          ? 'text-[var(--sniptale-color-danger)] hover:bg-[var(--sniptale-color-danger-soft)]'
          : 'hover:bg-[var(--sniptale-color-surface-hover)]',
      ].join(' ')}
      title={label}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </button>
  );
}
