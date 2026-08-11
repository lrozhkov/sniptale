import type { QuickAction, ViewportPreset } from '../../../../../contracts/settings';
import { DelayedLoadingFallback } from '@sniptale/ui/loading-delay';
import { Skeleton } from '@sniptale/ui/skeleton';
import { QuickActionsBlock } from '../../quick-actions/block';
import { PopupHomeQuickActionsEmptyState } from './empty-state';
import { isDesktopQuickAction } from '../../../../../features/quick-actions-presets/policy';

interface PopupHomeQuickActionsProps {
  shouldShowQuickActions: boolean;
  quickActionsReady: boolean;
  hasQuickActions: boolean;
  quickActions: QuickAction[];
  viewportPresets: ViewportPreset[];
  quickActionsDisabledTitle?: string | null;
  restrictionIndicatorTitle?: string | null;
  onTriggerAction: (actionId: string) => void;
}

function QuickActionsLoadingState() {
  return (
    <div
      data-ui="popup.home.quick-actions-loading"
      className="flex h-full min-h-[132px] flex-col justify-center gap-2.5 rounded-[12px]
        border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_56%,transparent)] p-3"
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton shape="block" className="h-12 w-full" />
      <Skeleton shape="block" className="h-12 w-full" />
    </div>
  );
}

export function PopupHomeQuickActions({
  shouldShowQuickActions,
  quickActionsReady,
  hasQuickActions,
  quickActions,
  viewportPresets,
  quickActionsDisabledTitle,
  onTriggerAction,
}: PopupHomeQuickActionsProps) {
  if (!shouldShowQuickActions) {
    return null;
  }

  return (
    <section
      className={[
        'flex min-h-0 flex-1 flex-col rounded-[16px] border',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)] p-3',
      ].join(' ')}
    >
      <div className="min-h-0 flex-1">
        {!quickActionsReady ? (
          <DelayedLoadingFallback fallback={<QuickActionsLoadingState />} />
        ) : hasQuickActions ? (
          <QuickActionsBlock
            actions={quickActions}
            presets={viewportPresets}
            onTriggerAction={onTriggerAction}
            isActionPageIndependent={isDesktopQuickAction}
            {...(quickActionsDisabledTitle === undefined
              ? {}
              : { disabledTitle: quickActionsDisabledTitle })}
          />
        ) : (
          <PopupHomeQuickActionsEmptyState />
        )}
      </div>
    </section>
  );
}
