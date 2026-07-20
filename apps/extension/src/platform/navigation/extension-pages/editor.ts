import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { EDITOR_BOOTSTRAP_QUERY_PARAM } from '../../../features/editor/contracts/bootstrap';
import {
  appendEditorEmbedMode,
  type EditorEmbedMode,
} from '../../../features/editor/contracts/embed';

interface EditorPageUrlOptions {
  assetId?: string | null;
  bootstrapId?: string | null;
  embedMode?: EditorEmbedMode | null;
  sessionId?: string | null;
}

export function buildEditorUrl(options: EditorPageUrlOptions = {}): string {
  const editorUrl = appendEditorEmbedMode(
    new URL(runtimeInfo.getURL('apps/extension/src/editor/index.html')),
    options.embedMode
  );

  if (options.sessionId) {
    editorUrl.searchParams.set('session', options.sessionId);
  }

  if (options.bootstrapId) {
    editorUrl.searchParams.set(EDITOR_BOOTSTRAP_QUERY_PARAM, options.bootstrapId);
  }

  if (options.assetId) {
    editorUrl.searchParams.set('assetId', options.assetId);
  }

  return editorUrl.toString();
}
