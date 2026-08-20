import { getScenarioAssetBlob } from '../../composition/persistence/scenario/store/public';
import { ScenarioDeckExportDialog } from '../export-dialog/deck';
import { downloadScenarioEditorBlob } from '../platform/browser-driver';
import { buildScenarioDeckExport, createScenarioDeckArchiveFilename } from '../project/export/deck';
import type { ScenarioDeckExportOptions } from '../project/export/deck/types';
import { createDirectFileSink } from '../../composition/archive-transfer';
import { translate } from '../../platform/i18n';
import type { useScenarioV3EditorState } from './state';

type ScenarioV3EditorState = ReturnType<typeof useScenarioV3EditorState>;

export function ScenarioV3DeckExportDialogMount(props: {
  editor: ScenarioV3EditorState;
  onClose: () => void;
  open: boolean;
}) {
  if (!props.open) {
    return null;
  }

  return (
    <ScenarioDeckExportDialog
      onClose={props.onClose}
      onExport={(options) => exportScenarioDeck(props.editor, options)}
      project={props.editor.project}
    />
  );
}

async function exportScenarioDeck(
  editor: ScenarioV3EditorState,
  options: ScenarioDeckExportOptions
) {
  const packageFilename = createScenarioDeckArchiveFilename(editor.project.name, options.format);
  const archiveSink =
    options.format === 'markdown' || options.assetMode === 'files'
      ? await createDirectFileSink({
          description: translate('scenario.editor.exportArchiveDescription'),
          extension: '.zip',
          filename: packageFilename,
          mimeType: 'application/zip',
        })
      : undefined;
  const result = await buildScenarioDeckExport({
    ...(archiveSink ? { archiveSink } : {}),
    getAssetBlob: getScenarioAssetBlob,
    options,
    project: editor.project,
  });
  if (result.blob) downloadScenarioEditorBlob(result.blob, result.filename);
  return result;
}
