import { translate } from '../../../../../platform/i18n';

import { SAVE_FORMAT_OPTIONS } from './constants';
import { EditorDocumentExportPreferencesFormatOption } from './option';
import type { useEditorExportSettingsState } from '../../export-settings';

export function EditorDocumentExportPreferencesFormatSection(props: {
  settings: ReturnType<typeof useEditorExportSettingsState>;
}) {
  return (
    <section className="space-y-2" aria-label={translate('imageSettings.section.formatLabel')}>
      <div className="grid grid-cols-3 gap-2">
        {SAVE_FORMAT_OPTIONS.map((option) => (
          <EditorDocumentExportPreferencesFormatOption
            key={option.value}
            option={option}
            disabled={props.settings.isPersisting}
            isSelected={props.settings.imageFormat === option.value}
            onSelect={() => void props.settings.setImageFormat(option.value)}
          />
        ))}
      </div>
    </section>
  );
}
