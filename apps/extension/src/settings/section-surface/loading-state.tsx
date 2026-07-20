import {
  DelayedLoadingFallback,
  type DelayedLoadingFallbackProps,
} from '@sniptale/ui/loading-delay';
import { Skeleton } from '@sniptale/ui/skeleton';

const settingsCenteredLoadingCardClassName = [
  'w-full max-w-[22rem] space-y-3 rounded-[20px] border',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_86%,var(--sniptale-color-surface-canvas)_14%)] p-5',
].join(' ');

const settingsCardLoadingClassName = [
  'mb-6 rounded-[18px] border border-[var(--sniptale-color-border-soft)] p-5',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_82%,var(--sniptale-color-surface-canvas)_18%)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_34%,transparent)]',
].join(' ');

export function SettingsCenteredLoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className={settingsCenteredLoadingCardClassName}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[78%]" />
      </div>
    </div>
  );
}

export function DelayedSettingsCenteredLoadingState(
  props: Pick<DelayedLoadingFallbackProps, 'delayMs'> = {}
) {
  return <DelayedLoadingFallback fallback={<SettingsCenteredLoadingState />} {...props} />;
}

export function SettingsCardLoadingState() {
  return (
    <div className={settingsCardLoadingClassName}>
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full rounded-[12px]" />
        <Skeleton className="h-10 w-full rounded-[12px]" />
        <Skeleton className="h-3 w-[82%]" />
      </div>
    </div>
  );
}

export function DelayedSettingsCardLoadingState(
  props: Pick<DelayedLoadingFallbackProps, 'delayMs'> = {}
) {
  return <DelayedLoadingFallback fallback={<SettingsCardLoadingState />} {...props} />;
}
