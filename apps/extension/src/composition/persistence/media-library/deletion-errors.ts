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
