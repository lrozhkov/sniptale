import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { translate } from '../../../../platform/i18n';
import { settingsModalClassName } from '../../../section-surface';

export type StorageDraftsConfirmation = 'delete-all' | 'reset' | null;

export function StorageDraftsDialogs(props: {
  busy: boolean;
  confirmation: StorageDraftsConfirmation;
  onCancel(): void;
  onDeleteAll(): Promise<void>;
  onReset(): Promise<void>;
}) {
  if (!props.confirmation) return null;
  const reset = props.confirmation === 'reset';
  return (
    <ProductConfirmDialog
      cancelText={translate('common.actions.cancel')}
      confirmText={translate(
        reset ? 'settings.storageDrafts.resetDefaults' : 'common.actions.delete'
      )}
      dialogClassName={settingsModalClassName}
      isLoading={props.busy}
      message={translate(
        reset
          ? 'settings.storageDrafts.resetDefaultsConfirm'
          : 'settings.storageDrafts.deleteAllConfirm'
      )}
      onCancel={props.onCancel}
      onConfirm={reset ? props.onReset : props.onDeleteAll}
      title={translate(
        reset ? 'settings.storageDrafts.resetDefaults' : 'settings.storageDrafts.deleteAll'
      )}
    />
  );
}
