import { EditorDocumentExportPreferencesFields } from './format';
import { useEditorExportSettingsState } from '../export-settings';
import type { EditorExportImageSizeState } from '../export-image-size';

function EditorDocumentImageFormatContentWithHook() {
  const settings = useEditorExportSettingsState();
  return <EditorDocumentExportPreferencesFields settings={settings} />;
}

export function EditorDocumentImageFormatContent(props: {
  settings?: ReturnType<typeof useEditorExportSettingsState>;
  sizeState?: EditorExportImageSizeState;
}) {
  if (props.settings) {
    return (
      <EditorDocumentExportPreferencesFields
        settings={props.settings}
        {...(props.sizeState ? { sizeState: props.sizeState } : {})}
      />
    );
  }

  return <EditorDocumentImageFormatContentWithHook />;
}
