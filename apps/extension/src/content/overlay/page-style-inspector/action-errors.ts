import { translate } from '../../../platform/i18n';

export class PageStyleAssetCleanupError extends Error {
  readonly assetIds: string[];

  constructor(assetIds: string[]) {
    super(translate('content.pageStyleInspector.fileCleanupError'));
    this.name = 'PageStyleAssetCleanupError';
    this.assetIds = assetIds;
  }
}

export function isPageStyleAssetCleanupError(error: unknown): error is PageStyleAssetCleanupError {
  return error instanceof PageStyleAssetCleanupError;
}
