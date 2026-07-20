import { useSettingsStore } from '../../runtime/store/useSettingsStore';
import { translate } from '../../../platform/i18n';
import { getQuickActionDisplayName } from '../../../features/quick-actions-presets/catalog';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { settingsSectionClassName } from '../../section-surface';
import {
  QuickActionsDisplayModeCard,
  QuickActionsEditor,
  QuickActionsHeader,
  QuickActionsList,
} from './views';
import { useQuickActionsSection } from './section';

function getDeleteActionMessage(name: string | undefined): string {
  return [
    translate('settings.quickActions.deleteActionMessagePrefix'),
    `"${name ?? ''}"${translate('settings.quickActions.deleteActionMessageSuffix')}`,
  ].join(' ');
}

export function QuickActionsSection() {
  const { settings } = useSettingsStore();
  const state = useQuickActionsSection();
  const handleConfirmDelete = async () => {
    if (!state.confirmDelete) {
      return;
    }

    await state.handleDelete(state.confirmDelete.id);
    state.setConfirmDelete(null);
  };

  return (
    <div className={settingsSectionClassName}>
      <QuickActionsHeader confirmationMessage={state.confirmationMessage} />
      <QuickActionsEditor state={state} viewportPresets={settings.viewportPresets} />
      <QuickActionsDisplayModeCard
        displayMode={state.displayMode}
        onChange={state.setDisplayMode}
      />
      <QuickActionsList state={state} viewportPresets={settings.viewportPresets} />

      <ProductConfirmDialog
        isOpen={Boolean(state.confirmDelete)}
        title={translate('settings.quickActions.deleteActionTitle')}
        message={getDeleteActionMessage(
          state.confirmDelete ? getQuickActionDisplayName(state.confirmDelete) : undefined
        )}
        confirmText={translate('common.actions.delete')}
        cancelText={translate('common.actions.cancel')}
        onConfirm={handleConfirmDelete}
        onCancel={() => state.setConfirmDelete(null)}
        isLoading={state.isLoading}
        backdropClassName="!z-[2147483648]"
      />
    </div>
  );
}
