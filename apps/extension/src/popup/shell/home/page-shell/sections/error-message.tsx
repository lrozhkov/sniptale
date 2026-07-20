export function PopupHomeErrorMessage({ message }: { message: string }) {
  return (
    <div
      className={
        'rounded-[16px] border ' +
        'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_14%,var(--sniptale-color-border-soft)_86%)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_5%,var(--sniptale-color-surface-hover)_95%)] ' +
        'px-3 py-2 text-xs ' +
        'text-[var(--sniptale-color-text-primary-strong)]'
      }
    >
      {message}
    </div>
  );
}
