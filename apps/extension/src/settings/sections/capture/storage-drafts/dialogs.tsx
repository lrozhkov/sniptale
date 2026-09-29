import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { translate } from '../../../../platform/i18n';
import { settingsModalClassName } from '../../../section-surface';

export type StorageDraftsConfirmation = 'delete-all' | 'delete-expired' | 'reset' | null;

export function StorageDraftsDialogs(props: {
  busy: boolean;
  confirmation: StorageDraftsConfirmation;
  onCancel(): void;
  onDeleteAll(): Promise<void>;
  onDeleteExpired(): Promise<void>;
  onReset(): Promise<void>;
}) {
  if (!props.confirmation) return null;
  const reset = props.confirmation === 'reset';
  const deleteExpired = props.confirmation === 'delete-expired';
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
          : deleteExpired
            ? 'settings.storageDrafts.deleteExpiredConfirm'
            : 'settings.storageDrafts.deleteAllConfirm'
      )}
      onCancel={props.onCancel}
      onConfirm={reset ? props.onReset : deleteExpired ? props.onDeleteExpired : props.onDeleteAll}
      title={translate(
        reset
          ? 'settings.storageDrafts.resetDefaults'
          : deleteExpired
            ? 'settings.storageDrafts.deleteExpired'
            : 'settings.storageDrafts.deleteAll'
      )}
    />
  );
}
