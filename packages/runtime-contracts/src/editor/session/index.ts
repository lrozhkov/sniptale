const EDITOR_ASSET_QUERY_PARAM = 'assetId';

export function readEditorAssetId(search: string): string | null {
  return new URLSearchParams(search).get(EDITOR_ASSET_QUERY_PARAM);
}
