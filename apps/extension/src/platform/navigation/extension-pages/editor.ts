import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { EDITOR_BOOTSTRAP_QUERY_PARAM } from '../../../features/editor/contracts/bootstrap';
import {
  appendEditorEmbedMode,
  type EditorEmbedMode,
} from '../../../features/editor/contracts/embed';

interface EditorPageUrlOptions {
  assetId?: string | null;
  originalId?: string | null;
  bootstrapId?: string | null;
  embedMode?: EditorEmbedMode | null;
}

export function buildEditorUrl(options: EditorPageUrlOptions = {}): string {
  const editorUrl = appendEditorEmbedMode(
    new URL(runtimeInfo.getURL('apps/extension/src/editor/index.html')),
    options.embedMode
  );

  if (options.bootstrapId) {
    editorUrl.searchParams.set(EDITOR_BOOTSTRAP_QUERY_PARAM, options.bootstrapId);
  }

  if (options.assetId) {
    editorUrl.searchParams.set('assetId', options.assetId);
    if (options.originalId) editorUrl.searchParams.set('originalId', options.originalId);
  }

  return editorUrl.toString();
}
