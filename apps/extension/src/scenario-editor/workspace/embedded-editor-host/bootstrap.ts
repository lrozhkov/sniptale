import {
  persistPendingEditorBootstrapPayload,
  type EditorBootstrapPayload,
} from '../../../workflows/editor/bootstrap';
import { buildEditorUrl } from '../../../platform/navigation/extension-pages/editor';

export async function createScenarioEditorEmbedUrl(
  payload: EditorBootstrapPayload
): Promise<string> {
  const bootstrapId = await persistPendingEditorBootstrapPayload(payload);

  return buildEditorUrl({
    bootstrapId,
    embedMode: 'scenario',
  });
}
