import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../../../../composition/persistence/library-lifecycle';
import { translate } from '../../../../platform/i18n';
import { SettingsSectionHeaderActions, settingsSectionClassName } from '../../../section-surface';
import { StorageDraftsContent } from './content';
import { StorageDraftsDialogs, type StorageDraftsConfirmation } from './dialogs';
import { useStorageDraftsState } from './use-storage-drafts-state';

type StorageDraftsState = ReturnType<typeof useStorageDraftsState>;

function useStorageDraftsConfirmation(state: StorageDraftsState) {
  const [confirmation, setConfirmation] = useState<StorageDraftsConfirmation>(null);
  const close = () => setConfirmation(null);
  const deleteAll = async () => {
    await state.runCleanup(true);
    close();
  };
  const deleteExpired = async () => {
    await state.runCleanup(false);
    close();
  };
  const reset = async () => {
    await state.updatePolicy(DEFAULT_LOCAL_STORAGE_POLICY);
    close();
  };
  return { close, confirmation, deleteAll, deleteExpired, reset, request: setConfirmation };
}

function StorageDraftsResetAction(props: { busy: boolean; onRequest(): void }) {
  return (
    <SettingsSectionHeaderActions>
      <button
        type="button"
        className={getControlSecondaryButtonClassName({ density: 'compact' })}
        disabled={props.busy}
        title={translate('settings.storageDrafts.resetDefaults')}
        onClick={props.onRequest}
      >
        <RotateCcw aria-hidden="true" size={14} />
        {translate('settings.storageDrafts.resetDefaults')}
      </button>
    </SettingsSectionHeaderActions>
  );
}

function StoragePolicyLoadState(
  props: Pick<StorageDraftsState, 'policyLoaded' | 'policyLoadFailed' | 'retryLoad'>
) {
  if (props.policyLoaded) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 text-sm text-[var(--sniptale-color-text-secondary)]"
    >
      <span>
        {translate(
          props.policyLoadFailed
            ? 'settings.storageDrafts.policyUnavailable'
            : 'settings.storageDrafts.loading'
        )}
      </span>
      {props.policyLoadFailed ? (
        <button
          type="button"
          className={getControlSecondaryButtonClassName({ density: 'compact' })}
          onClick={() => void props.retryLoad()}
        >
          {translate('settings.storageDrafts.retry')}
        </button>
      ) : null}
    </div>
  );
}

function StorageDraftsBody(props: {
  confirmation: ReturnType<typeof useStorageDraftsConfirmation>;
  state: StorageDraftsState;
  view: 'drafts' | 'storage';
}) {
  const { confirmation, state, view } = props;
  return (
    <>
      {view === 'drafts' ? (
        <StorageDraftsResetAction
          busy={state.busy}
          onRequest={() => confirmation.request('reset')}
        />
      ) : null}
      <StorageDraftsContent
        {...state}
        view={view}
        onDeleteAllRequest={() => confirmation.request('delete-all')}
        onDeleteExpiredRequest={() => confirmation.request('delete-expired')}
      />
      <StorageDraftsDialogs
        busy={state.busy}
        confirmation={confirmation.confirmation}
        onCancel={confirmation.close}
        onDeleteAll={confirmation.deleteAll}
        onDeleteExpired={confirmation.deleteExpired}
        onReset={confirmation.reset}
      />
    </>
  );
}

export function StorageDraftsSection(props: { view?: string }) {
  const view = props.view === 'storage' ? 'storage' : 'drafts';
  const state = useStorageDraftsState();
  const confirmation = useStorageDraftsConfirmation(state);

  return (
    <section className={settingsSectionClassName}>
      <StoragePolicyLoadState {...state} />
      {view === 'storage' || state.policyLoaded ? (
        <StorageDraftsBody confirmation={confirmation} state={state} view={view} />
      ) : null}
    </section>
  );
}
