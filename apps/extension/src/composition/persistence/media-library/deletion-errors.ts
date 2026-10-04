/** Rejects a purge when the references differ from the explicitly confirmed preview. */
export class StaleMediaAssetDeletePreviewError extends Error {
  constructor() {
    super('The affected projects changed after the deletion warning.');
    this.name = 'StaleMediaAssetDeletePreviewError';
  }
}

/** Retains a source required by an authoritative project or review workspace. */
export class PrimaryMediaAssetDeleteError extends Error {
  constructor() {
    super('A project requires this file as its primary source.');
    this.name = 'PrimaryMediaAssetDeleteError';
  }
}

export type MediaAssetGraphDomain =
  | 'video-project'
  | 'scenario-project'
  | 'scenario-asset'
  | 'quick-edit';

/** Expected deletion refusals expose fixed codes rather than persistence or source details. */
export class MediaAssetDeletionBlockedError extends Error {
  constructor(
    readonly reason:
      | 'scenario-busy'
      | 'invalid-graph'
      | 'source-unavailable'
      | 'unsupported-source'
      | 'pending-publication',
    readonly graphDomain?: MediaAssetGraphDomain
  ) {
    super('Media deletion is blocked.');
    this.name = 'MediaAssetDeletionBlockedError';
  }
}
