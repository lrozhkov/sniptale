import { useState } from 'react';
import { normalizePageLaunchPreferences } from '../../../../contracts/page-launch';
import { SettingsControlRow } from '../../../section-surface';
import { SettingsSwitch } from '../../../section-surface/panel-controls';
import { useSettingsStore } from '../../../runtime/store/useSettingsStore';
import { translate } from '../../../../platform/i18n';
import { getQuickActionDisplayName } from '../../../../features/quick-actions-presets/catalog';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { settingsSectionClassName } from '../../../section-surface';
import { QuickActionsEditor } from './editor';
import { QuickActionsList } from './list';
import { useQuickActionsController as useQuickActionsSection } from './controller';

function getDeleteActionMessage(name: string | undefined): string {
  return [
    translate('settings.quickActions.deleteActionMessagePrefix'),
    `"${name ?? ''}"${translate('settings.quickActions.deleteActionMessageSuffix')}`,
  ].join(' ');
}

export function QuickActionsSection() {
  const { settings, updateSettings, hasLoaded } = useSettingsStore();
  const placements = normalizePageLaunchPreferences(settings.pageLaunch);
  const [savingPlacement, setSavingPlacement] = useState(false);
  const [placementFailed, setPlacementFailed] = useState(false);
  const updatePlacement = async (
    key: 'quickActionsPopup' | 'quickActionsCorner' | 'quickActionsToolbar'
  ) => {
    if (savingPlacement) return;
    setSavingPlacement(true);
    setPlacementFailed(false);
    try {
      await updateSettings({ pageLaunch: { [key]: !placements[key] } });
    } catch {
      setPlacementFailed(true);
    } finally {
      setSavingPlacement(false);
    }
  };
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
      <div className="space-y-1">
        {(
          [
            ['quickActionsPopup', 'settings.quickActions.placementPopup'],
            ['quickActionsCorner', 'settings.quickActions.placementCorner'],
            ['quickActionsToolbar', 'settings.quickActions.placementToolbar'],
          ] as const
        ).map(([key, label]) => (
          <SettingsControlRow key={key} label={translate(label)}>
            <SettingsSwitch
              size="sm"
              checked={placements[key]}
              disabled={!hasLoaded || savingPlacement}
              aria-label={translate(label)}
              onClick={() => {
                void updatePlacement(key);
              }}
            />
          </SettingsControlRow>
        ))}
        {placementFailed ? <p role="alert">{translate('content.pageLauncher.failed')}</p> : null}
      </div>
      <QuickActionsEditor state={state} viewportPresets={settings.viewportPresets} />
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
