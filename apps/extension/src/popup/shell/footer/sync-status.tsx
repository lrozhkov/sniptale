import { Cloud, LockKeyhole, Pause, RefreshCw } from 'lucide-react';
import type { SyncPopupRuntimeStatus } from '../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { translate, useAppLocale, type TranslationKey } from '../../../platform/i18n/popup';

interface Props {
  status: SyncPopupRuntimeStatus | null;
  pending: boolean;
  failed?: boolean;
  onSync(): void;
  onUnlock(): void;
  onDetails(): void;
  onRepair(): void;
}
type SyncStatusTranslationKey = Extract<TranslationKey, `popup.common.sync${string}`>;
type SyncStatusAction = 'sync' | 'unlock' | 'details' | 'repair' | 'uploads';
interface Presentation {
  translationKey: SyncStatusTranslationKey;
  action: SyncStatusAction;
  icon: typeof Cloud;
}
function presentation(status: SyncPopupRuntimeStatus): Presentation {
  if (status.configuration === 'unknown')
    return { translationKey: 'popup.common.syncUnknown', action: 'details', icon: Cloud };
  if (status.issue === 'permission-required')
    return { translationKey: 'popup.common.syncAttention', action: 'repair', icon: Cloud };
  if (status.connection === 'paused')
    return { translationKey: 'popup.common.syncPaused', action: 'details', icon: Pause };
  if (status.connection === 'credentials-required' || status.connection === 'updating-auth')
    return { translationKey: 'popup.common.syncAttention', action: 'repair', icon: Cloud };
  if (status.protection === 'locked')
    return { translationKey: 'popup.common.syncLocked', action: 'unlock', icon: LockKeyhole };
  if (status.activity === 'running' || status.activity === 'stopping')
    return {
      translationKey:
        status.activity === 'running' ? 'popup.common.syncRunning' : 'popup.common.syncStopping',
      action: 'details',
      icon: RefreshCw,
    };
  if (status.issue === 'queue-problem')
    return {
      translationKey: 'popup.common.syncUploadsInterrupted',
      action: 'uploads',
      icon: Cloud,
    };
  if (status.issue)
    return { translationKey: 'popup.common.syncAttention', action: 'repair', icon: Cloud };
  if (
    status.protection === 'unknown' ||
    status.activity === 'unknown' ||
    status.localPublication === 'unknown'
  )
    return { translationKey: 'popup.common.syncUnknown', action: 'details', icon: Cloud };
  if (status.localPublication === 'discovering')
    return { translationKey: 'popup.common.syncDiscovering', action: 'details', icon: Cloud };
  if (status.localPublication === 'waiting')
    return { translationKey: 'popup.common.syncWaiting', action: 'sync', icon: Cloud };
  return {
    translationKey:
      status.remote.knowledge === 'observed-pass' && status.remote.outcome === 'complete'
        ? 'popup.common.syncComplete'
        : 'popup.common.syncPublished',
    action: 'sync',
    icon: Cloud,
  };
}

/** Renders safe runtime state. The product controller owns every command and navigation action. */
export function PopupSyncStatus({
  status,
  pending,
  failed = false,
  onSync,
  onUnlock,
  onDetails,
  onRepair,
}: Props) {
  const locale = useAppLocale();
  if (!status || status.configuration === 'unconfigured') return null;
  const view = presentation(status);
  const Icon = view.icon;
  const actions: Record<
    SyncStatusAction,
    { translationKey: SyncStatusTranslationKey; run(): void }
  > = {
    sync: { translationKey: 'popup.common.syncNow', run: onSync },
    unlock: { translationKey: 'popup.common.syncUnlock', run: onUnlock },
    details: { translationKey: 'popup.common.syncDetails', run: onDetails },
    repair: { translationKey: 'popup.common.syncRepair', run: onRepair },
    uploads: { translationKey: 'popup.common.syncViewUploads', run: onRepair },
  };
  const action = actions[view.action];
  return (
    <div className="flex min-h-8 items-center gap-2" data-ui="popup.footer.sync-status">
      <div className="flex min-w-0 flex-1 items-center gap-2" role="status" aria-live="polite">
        <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[11px] leading-4">
          {translate(failed ? 'popup.common.syncActionFailed' : view.translationKey, locale)}
        </span>
      </div>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={action.run}
        className={[
          'inline-flex min-h-8 shrink-0 items-center justify-center rounded-[6px]',
          'border-none bg-transparent px-2 text-[11px] text-[var(--sniptale-color-text-secondary)]',
          'hover:bg-[var(--sniptale-color-surface-hover)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-[var(--sniptale-color-accent)] disabled:opacity-50',
        ].join(' ')}
      >
        {translate(action.translationKey, locale)}
      </button>
    </div>
  );
}
