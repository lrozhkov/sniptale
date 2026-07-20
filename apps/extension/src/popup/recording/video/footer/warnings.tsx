const VIDEO_SETUP_WARNING_CLASS_NAME =
  'mt-2.5 mr-1 rounded-[12px] border px-3 py-2 text-xs text-[var(--sniptale-color-text-primary)]';

const START_ERROR_CLASS_NAME = [
  VIDEO_SETUP_WARNING_CLASS_NAME,
  'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_28%,var(--sniptale-color-border-soft)_72%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_74%,var(--sniptale-color-surface-panel)_26%)]',
].join(' ');

export function VideoSetupWarnings({ startError }: { startError: string | null }) {
  return <>{startError && <div className={START_ERROR_CLASS_NAME}>{startError}</div>}</>;
}
