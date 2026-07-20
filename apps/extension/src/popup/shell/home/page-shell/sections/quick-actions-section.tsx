import { AlertTriangle } from 'lucide-react';
import type {
  QuickAction,
  QuickActionsDisplayMode,
  ViewportPreset,
} from '../../../../../contracts/settings';
import { translate } from '../../../../../platform/i18n';
import { DelayedLoadingFallback } from '@sniptale/ui/loading-delay';
import { Skeleton } from '@sniptale/ui/skeleton';
import { QuickActionsBlock } from '../../quick-actions/block';
import { PopupHomeQuickActionsEmptyState } from './empty-state';

interface PopupHomeQuickActionsProps {
  shouldShowQuickActions: boolean;
  quickActionsReady: boolean;
  hasQuickActions: boolean;
  quickActions: QuickAction[];
  displayMode: QuickActionsDisplayMode;
  viewportPresets: ViewportPreset[];
  quickActionsDisabledTitle?: string | null;
  restrictionIndicatorTitle?: string | null;
  onTriggerAction: (actionId: string) => void;
}

function QuickActionsSectionHeader(props: { restrictionIndicatorTitle?: string | null }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div
        className="text-xs font-medium uppercase tracking-[0.06em]
          text-[var(--sniptale-color-text-dim)]"
      >
        {translate('popup.home.quickActionsTitle')}
      </div>
      {props.restrictionIndicatorTitle ? (
        <span
          title={props.restrictionIndicatorTitle}
          aria-label={props.restrictionIndicatorTitle}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full
            bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_26%,transparent)]
            text-[var(--sniptale-color-danger)]"
          data-ui="popup.home.quick-actions-restriction-indicator"
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );
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
  displayMode,
  viewportPresets,
  quickActionsDisabledTitle,
  restrictionIndicatorTitle,
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
      <QuickActionsSectionHeader
        {...(restrictionIndicatorTitle === undefined ? {} : { restrictionIndicatorTitle })}
      />

      <div className="min-h-0 flex-1">
        {!quickActionsReady ? (
          <DelayedLoadingFallback fallback={<QuickActionsLoadingState />} />
        ) : hasQuickActions ? (
          <QuickActionsBlock
            actions={quickActions}
            displayMode={displayMode}
            presets={viewportPresets}
            onTriggerAction={onTriggerAction}
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
