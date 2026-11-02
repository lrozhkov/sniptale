import '@sniptale/ui/styles/content-popover';
import { useEffect, useId, useRef, useState } from 'react';
import {
  Cloud,
  CloudAlert,
  CloudCheck,
  CloudUpload,
  LockKeyhole,
  Pause,
  RefreshCw,
} from 'lucide-react';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import { useGlassSelectOverlay } from '@sniptale/ui/glass-select/overlay-state';
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
    return { translationKey: 'popup.common.syncAttention', action: 'repair', icon: CloudAlert };
  if (status.connection === 'paused')
    return { translationKey: 'popup.common.syncPaused', action: 'details', icon: Pause };
  if (status.connection === 'credentials-required' || status.connection === 'updating-auth')
    return { translationKey: 'popup.common.syncAttention', action: 'repair', icon: CloudAlert };
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
      icon: CloudAlert,
    };
  if (status.issue)
    return { translationKey: 'popup.common.syncAttention', action: 'repair', icon: CloudAlert };
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
    icon:
      status.remote.knowledge === 'observed-pass' && status.remote.outcome === 'complete'
        ? CloudCheck
        : CloudUpload,
  };
}

/** Renders safe runtime state. The product controller owns every command and navigation action. */
export function PopupSyncStatus(props: Props) {
  if (props.status?.configuration !== 'configured') return null;
  return <ConfiguredPopupSyncStatus {...props} status={props.status} />;
}

function ConfiguredPopupSyncStatus({
  status,
  pending,
  failed = false,
  onSync,
  onUnlock,
  onDetails,
  onRepair,
}: Props & { status: SyncPopupRuntimeStatus }) {
  const locale = useAppLocale();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const id = useId();
  const { portalStyle } = useGlassSelectOverlay({
    portal: true,
    isOpen: open,
    setIsOpen: (next) => {
      setOpen(next);
      if (next === false && layer.current?.contains(document.activeElement))
        trigger.current?.focus();
    },
    containerRef: anchor,
    menuRef: layer,
    menuWidth: 260,
  });
  useEffect(() => {
    if (open) layer.current?.querySelector<HTMLElement>('[role="dialog"]')?.focus();
  }, [open]);
  const view = presentation(status);
  const Icon = failed ? CloudAlert : view.icon;
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
  const label = translate(failed ? 'popup.common.syncActionFailed' : view.translationKey, locale);
  return (
    <div
      ref={anchor}
      className="inline-flex shrink-0 items-center"
      data-ui="popup.footer.sync-status"
    >
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        data-popup-hint={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        className={[
          'inline-flex h-8 w-8 items-center justify-center rounded-[6px] border-none',
          'bg-transparent text-[var(--sniptale-color-text-secondary)]',
          'hover:bg-[var(--sniptale-color-surface-hover)] hover:text-[var(--sniptale-color-text-primary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-[var(--sniptale-color-accent)]',
        ].join(' ')}
      >
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <ContentPopoverAdapter
        anchorEl={anchor.current}
        isOpen={open}
        popoverRef={layer}
        className="sniptale-content-popover--compact"
        style={portalStyle}
        dataUi="popup.footer.sync-popover"
      >
        <div
          id={id}
          role="dialog"
          tabIndex={-1}
          aria-labelledby={`${id}-status`}
          className="space-y-2 p-2 outline-none text-xs text-[var(--sniptale-color-text-secondary)]"
          onBlurCapture={(event) => {
            if (
              !layer.current?.contains(event.relatedTarget) &&
              !anchor.current?.contains(event.relatedTarget)
            )
              setOpen(false);
          }}
        >
          <p id={`${id}-status`} role="status" aria-live="polite" className="leading-4">
            {label}
          </p>
          <button
            type="button"
            data-ui="popup.footer.sync-action"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={action.run}
            className={[
              'inline-flex min-h-8 items-center justify-center rounded-[6px]',
              'border-none bg-transparent px-2 text-xs text-[var(--sniptale-color-text-secondary)]',
              'hover:bg-[var(--sniptale-color-surface-hover)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2',
              'focus-visible:outline-[var(--sniptale-color-accent)] disabled:opacity-50',
            ].join(' ')}
          >
            {translate(action.translationKey, locale)}
          </button>
        </div>
      </ContentPopoverAdapter>
    </div>
  );
}
