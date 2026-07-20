import {
  persistPendingEditorBootstrapPayload,
  type EditorBootstrapPayload,
} from '../../../workflows/editor/bootstrap';
import { createSecureRandomUuid as createEditorSessionId } from '@sniptale/platform/security/secure-random-id';
import { buildEditorUrl } from '../../../platform/navigation/extension-pages/editor';

export async function createScenarioEditorEmbedUrl(
  payload: EditorBootstrapPayload
): Promise<string> {
  const bootstrapId = await persistPendingEditorBootstrapPayload(payload);

  return buildEditorUrl({
    bootstrapId,
    embedMode: 'scenario',
    sessionId: createEditorSessionId(),
  });
}
