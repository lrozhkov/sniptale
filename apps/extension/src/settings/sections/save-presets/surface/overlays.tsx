import { translate } from '../../../../platform/i18n';
import type { SavePreset } from '../../../../contracts/settings';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { SavePresetEditorModal } from '../editor-modal';

export function PresetsListOverlays(props: {
  confirmDelete: SavePreset | null;
  confirmDeletePreset: () => Promise<void>;
  editingPreset?: SavePreset;
  isEditorOpen: boolean;
  onCloseDeleteDialog: () => void;
  onCloseEditor: () => void;
  onSavePreset: (name: string, path: string, enabled: boolean) => Promise<void>;
}) {
  return (
    <>
      {props.isEditorOpen ? (
        <SavePresetEditorModal
          onClose={props.onCloseEditor}
          onSave={props.onSavePreset}
          {...(props.editingPreset === undefined ? {} : { preset: props.editingPreset })}
        />
      ) : null}

      {props.confirmDelete ? (
        <ProductConfirmDialog
          title={translate('savePresets.section.deleteTitle')}
          message={[
            translate('savePresets.section.deleteMessagePrefix'),
            props.confirmDelete.name,
            translate('savePresets.section.deleteMessageSuffix'),
          ].join('')}
          cancelText={translate('common.actions.cancel')}
          confirmText={translate('common.actions.delete')}
          onCancel={props.onCloseDeleteDialog}
          onConfirm={props.confirmDeletePreset}
        />
      ) : null}
    </>
  );
}
