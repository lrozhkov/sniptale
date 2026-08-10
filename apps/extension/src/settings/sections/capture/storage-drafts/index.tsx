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
  const reset = async () => {
    await state.updatePolicy(DEFAULT_LOCAL_STORAGE_POLICY);
    close();
  };
  return { close, confirmation, deleteAll, reset, request: setConfirmation };
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

export function StorageDraftsSection(props: { view?: 'settings' | 'storage' }) {
  const view = props.view === 'storage' ? 'storage' : 'settings';
  const state = useStorageDraftsState();
  const confirmation = useStorageDraftsConfirmation(state);

  return (
    <section className={settingsSectionClassName}>
      {view === 'settings' ? (
        <StorageDraftsResetAction
          busy={state.busy}
          onRequest={() => confirmation.request('reset')}
        />
      ) : null}
      <StorageDraftsContent
        {...state}
        view={view}
        onDeleteAllRequest={() => confirmation.request('delete-all')}
      />
      <StorageDraftsDialogs
        busy={state.busy}
        confirmation={confirmation.confirmation}
        onCancel={confirmation.close}
        onDeleteAll={confirmation.deleteAll}
        onReset={confirmation.reset}
      />
    </section>
  );
}
