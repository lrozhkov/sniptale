import { translate } from '../../../../platform/i18n';
import type { BuildEditorDocumentActionGroupsParams, EditorDocumentActionGroup } from './types';
import { buildDocumentActionCommands } from './commands';
import { buildDocumentActionGroupList } from './groups/default';
import { buildScenarioDocumentActionGroupList } from './groups/scenario';

export function buildEditorDocumentActionGroups(
  params: BuildEditorDocumentActionGroupsParams
): EditorDocumentActionGroup[] {
  const jsonTag = translate('editor.documentActions.jsonTag');
  const commands = buildDocumentActionCommands(params, jsonTag);

  if (params.embedMode === 'scenario') {
    return buildScenarioDocumentActionGroupList(commands);
  }

  return buildDocumentActionGroupList(commands);
}
