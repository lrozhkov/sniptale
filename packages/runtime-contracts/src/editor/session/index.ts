const EDITOR_SESSION_QUERY_PARAM = 'session';
const EDITOR_ASSET_QUERY_PARAM = 'assetId';

export function readEditorSessionId(search: string): string | null {
  return new URLSearchParams(search).get(EDITOR_SESSION_QUERY_PARAM);
}

export function readEditorAssetId(search: string): string | null {
  return new URLSearchParams(search).get(EDITOR_ASSET_QUERY_PARAM);
}
