import { FolderTree } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { SavePreset } from '../../../contracts/settings';
import {
  disclosureContentClassName,
  DisclosureButton,
  usePersistentDisclosureState,
} from './disclosure-shared';
import { EditorInspectorDocumentPresetOptions } from './presets';

const SAVE_TO_FOLDER_DISCLOSURE_KEY = 'sniptale_editor_file_menu_save_to_folder_open';

export function EditorDocumentSaveToFolderDisclosure(props: {
  defaultImagePresetId: string | null;
  feedbackPresetId: string | null;
  savePresets: SavePreset[];
  savingPresetId: string | null;
  summary?: string | null;
  onSaveToPreset: (presetId: string) => Promise<void> | void;
}) {
  const disclosure = usePersistentDisclosureState(SAVE_TO_FOLDER_DISCLOSURE_KEY);
  const summaryProps = props.summary === undefined ? {} : { summary: props.summary };

  return (
    <div className="space-y-2.5">
      <DisclosureButton
        title={translate('editor.documentActions.saveToFolder')}
        isOpen={disclosure.isOpen}
        onToggle={disclosure.toggle}
        icon={<FolderTree size={18} strokeWidth={2} />}
        {...summaryProps}
      />
      {disclosure.isOpen ? (
        <div className={disclosureContentClassName}>
          <EditorInspectorDocumentPresetOptions
            defaultImagePresetId={props.defaultImagePresetId}
            feedbackPresetId={props.feedbackPresetId}
            savePresets={props.savePresets}
            savingPresetId={props.savingPresetId}
            onSaveToPreset={props.onSaveToPreset}
          />
        </div>
      ) : null}
    </div>
  );
}
