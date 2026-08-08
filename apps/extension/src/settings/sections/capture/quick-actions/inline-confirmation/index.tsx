import { CheckCircle2 } from 'lucide-react';

export function SettingsInlineConfirmation({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <span
      className={[
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-success)_24%,var(--sniptale-color-border-soft)_76%)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-success-soft)_72%,var(--sniptale-color-surface-panel)_28%)]',
        'text-[var(--sniptale-color-success)]',
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      <CheckCircle2 size={14} strokeWidth={2} />
      {message}
    </span>
  );
}
