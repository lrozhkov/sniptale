import { SlidersHorizontal } from 'lucide-react';
import { translate } from '../../../../../platform/i18n';

import type { useEditorExportSettingsState } from '../../export-settings';
import type { EditorExportImageSizeState } from '../../export-image-size';
import { EditorDocumentExportPreferencesImageSizeRow } from './image-size';
import { EditorDocumentExportPreferencesFormatSection } from './section';
import { EditorDocumentExportPreferencesQualitySection } from './quality';

export function EditorDocumentExportPreferencesFields(props: {
  settings: ReturnType<typeof useEditorExportSettingsState>;
  sizeState?: EditorExportImageSizeState;
}) {
  return (
    <div className="space-y-3 rounded-[12px] bg-transparent px-3.5 py-2.5">
      <div
        data-ui="editor.file-actions.export-settings-header"
        className={
          'flex items-center gap-2 text-[12px] font-bold uppercase ' +
          'text-[color:var(--sniptale-color-text-secondary)]'
        }
      >
        <span
          className={
            'flex h-3.5 w-3.5 shrink-0 items-center justify-center ' +
            'text-[color:var(--sniptale-color-text-muted-strong)]'
          }
        >
          <SlidersHorizontal size={14} strokeWidth={2} />
        </span>
        <span className="min-w-0">{translate('imageSettings.section.formatLabel')}</span>
      </div>
      <EditorDocumentExportPreferencesFormatSection settings={props.settings} />
      {props.sizeState ? (
        <EditorDocumentExportPreferencesImageSizeRow sizeState={props.sizeState} />
      ) : null}
      <EditorDocumentExportPreferencesQualitySection settings={props.settings} />
      {props.settings.persistErrorMessage ? (
        <div
          data-ui="editor.file-actions.export-settings-error"
          className="text-sm leading-6 text-[color:var(--sniptale-color-danger)]"
        >
          {props.settings.persistErrorMessage}
        </div>
      ) : null}
    </div>
  );
}
