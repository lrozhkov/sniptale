import type React from 'react';
import { translate } from '../../../platform/i18n';
import type { SavePreset } from '../../../contracts/settings';
import { ProductSaveDialog } from '@sniptale/ui/product-save-dialog';
import {
  createTrustedContentActionIntentSource,
  type ContentPrivilegedActionIntentSource,
} from '../../application/privileged-action-intent';

function buildPresetItems(presets: SavePreset[]) {
  return presets.map((preset) => ({
    id: preset.id,
    title: preset.name,
    path:
      `${translate('content.saveDialog.presetPathPrefix')} ` +
      `${preset.path || translate('content.saveDialog.presetPathFallback')}`,
  }));
}

function getPresetsEmptyState(loading: boolean, loadError: boolean) {
  if (loading) {
    return `${translate('common.states.loading')}${translate('content.saveDialog.loadingPresetsSuffix')}`;
  }

  if (loadError) {
    return translate('content.saveDialog.loadError');
  }

  return translate('content.saveDialog.noPresets');
}

export function SaveDialogSessionFooter(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="sniptale-save-dialog-checkbox-row">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="sniptale-checkbox"
      />
      <span>{translate('content.saveDialog.rememberPreset')}</span>
    </label>
  );
}

export function SaveDialogContent(props: {
  filename: string;
  loading: boolean;
  loadError: boolean;
  onChoosePreset: (
    presetId: string,
    contentIntentSource: ContentPrivilegedActionIntentSource | null
  ) => void;
  onChooseSystemFolder: (contentIntentSource: ContentPrivilegedActionIntentSource | null) => void;
  onClose: () => void;
  onFilenameChange: (value: string) => void;
  presets: SavePreset[];
  sessionFooter?: React.ReactNode;
}) {
  return (
    <ProductSaveDialog
      title={translate('content.saveDialog.title')}
      subtitle={translate('content.saveDialog.subtitle')}
      closeLabel={translate('common.actions.close')}
      filenameLabel={translate('content.saveDialog.filenameLabel')}
      filename={props.filename}
      filenamePlaceholder={translate('content.saveDialog.filenamePlaceholder')}
      onFilenameChange={props.onFilenameChange}
      presetLabel={translate('content.saveDialog.presetPathsLabel')}
      presetCount={props.loading ? '...' : props.presets.length}
      presetItems={buildPresetItems(props.presets)}
      presetsEmptyState={getPresetsEmptyState(props.loading, props.loadError)}
      systemFolderLabel={translate('content.saveDialog.otherFolderLabel')}
      systemFolderHint={translate('content.saveDialog.otherFolderHint')}
      onChoosePreset={(presetId, event) =>
        props.onChoosePreset(presetId, createTrustedContentActionIntentSource(event.nativeEvent))
      }
      onChooseSystemFolder={(event) =>
        props.onChooseSystemFolder(createTrustedContentActionIntentSource(event.nativeEvent))
      }
      onClose={props.onClose}
      footer={props.sessionFooter}
    />
  );
}
