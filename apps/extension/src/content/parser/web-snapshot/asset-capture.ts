import { formatWebSnapshotWarningUrl } from './asset-session';
import { fetchAssetUrl } from './asset-fetch';
import { MAX_WEB_SNAPSHOT_ASSET_BYTES, MAX_WEB_SNAPSHOT_ASSETS_BYTES } from './limits';
import { parseSrcset, serializeSrcset, type AssetTarget } from './asset-targets';
import type { WebSnapshotAssetEntry } from './types';

interface AssetByteBudget {
  totalBytes: number;
}

export type WebSnapshotAssetContext = {
  baseUrl: string;
  pageOrigin: string;
};
type FetchSameOriginAssetBlob = (resolved: URL) => Promise<Blob>;

export function createAssetBudget(): AssetByteBudget {
  return { totalBytes: 0 };
}

function hasAssetBudgetCapacity(budget: AssetByteBudget): boolean {
  return budget.totalBytes < MAX_WEB_SNAPSHOT_ASSETS_BYTES;
}

function pushAssetBudgetWarning(
  warnings: string[],
  url: string,
  reason: string,
  baseUrl?: string
): void {
  warnings.push(`Asset skipped: ${formatWebSnapshotWarningUrl(url, baseUrl)} (${reason})`);
}

function skipAssetBecauseBudgetExceeded(
  target: AssetTarget,
  warnings: string[],
  baseUrl: string
): void {
  removeFailedAssetReference(target);
  pushAssetBudgetWarning(warnings, target.url, 'web snapshot asset budget exceeded', baseUrl);
}

function acceptAssetWithinBudget(
  asset: WebSnapshotAssetEntry,
  budget: AssetByteBudget,
  warnings: string[]
): boolean {
  if (asset.blob.size > MAX_WEB_SNAPSHOT_ASSET_BYTES) {
    pushAssetBudgetWarning(warnings, asset.originalUrl, 'web snapshot asset is too large');
    return false;
  }
  if (budget.totalBytes + asset.blob.size > MAX_WEB_SNAPSHOT_ASSETS_BYTES) {
    pushAssetBudgetWarning(warnings, asset.originalUrl, 'web snapshot asset budget exceeded');
    return false;
  }

  budget.totalBytes += asset.blob.size;
  return true;
}

async function fetchSnapshotAsset(args: {
  allowAnonymousCrossOriginAssets: boolean;
  assetIndex: number;
  context: WebSnapshotAssetContext;
  fetchSameOriginAssetBlob: FetchSameOriginAssetBlob;
  snapshotSessionId: string;
  url: string;
}): Promise<WebSnapshotAssetEntry> {
  return fetchAssetUrl({
    allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
    baseUrl: args.context.baseUrl,
    fetchSameOriginAssetBlob: args.fetchSameOriginAssetBlob,
    index: args.assetIndex,
    pageOrigin: args.context.pageOrigin,
    snapshotSessionId: args.snapshotSessionId,
    url: args.url,
  });
}

function pushAssetCaptureWarning(
  warnings: string[],
  url: string,
  baseUrl: string,
  error: unknown
): void {
  warnings.push(
    `Asset skipped: ${formatWebSnapshotWarningUrl(url, baseUrl)} (${
      error instanceof Error ? error.message : error
    })`
  );
}

async function captureSrcsetAssets(args: {
  allowAnonymousCrossOriginAssets: boolean;
  budget: AssetByteBudget;
  context: WebSnapshotAssetContext;
  fetchSameOriginAssetBlob: FetchSameOriginAssetBlob;
  target: AssetTarget;
  startIndex: number;
  snapshotSessionId: string;
  warnings: string[];
}): Promise<{ assets: WebSnapshotAssetEntry[]; nextIndex: number }> {
  const assets: WebSnapshotAssetEntry[] = [];
  const candidates = parseSrcset(args.target.url);

  for (const [candidateIndex, candidate] of candidates.entries()) {
    if (!hasAssetBudgetCapacity(args.budget)) {
      pushAssetBudgetWarning(
        args.warnings,
        candidate.url,
        'web snapshot asset budget exceeded',
        args.context.baseUrl
      );
      continue;
    }

    try {
      const asset = await fetchSnapshotAsset({
        ...args,
        assetIndex: args.startIndex + candidateIndex,
        url: candidate.url,
      });
      if (!acceptAssetWithinBudget(asset, args.budget, args.warnings)) {
        continue;
      }
      candidate.url = `../${asset.localPath}`;
      assets.push(asset);
    } catch (error) {
      pushAssetCaptureWarning(args.warnings, candidate.url, args.context.baseUrl, error);
    }
  }

  const capturedCandidates = candidates.filter((candidate) => candidate.url.startsWith('../'));
  if (capturedCandidates.length > 0) {
    args.target.element.setAttribute('srcset', serializeSrcset(capturedCandidates));
  } else {
    args.target.element.removeAttribute('srcset');
  }
  return { assets, nextIndex: args.startIndex + candidates.length };
}

function removeFailedAssetReference(target: AssetTarget): void {
  const linkConstructor = target.element.ownerDocument.defaultView?.HTMLLinkElement;
  const isLinkElement = linkConstructor
    ? target.element instanceof linkConstructor
    : target.element.tagName.toLowerCase() === 'link';

  if (target.attribute === 'href' && isLinkElement) {
    target.element.remove();
    return;
  }

  target.element.removeAttribute(target.attribute);
}

async function captureSingleAsset(args: {
  allowAnonymousCrossOriginAssets: boolean;
  assetIndex: number;
  budget: AssetByteBudget;
  context: WebSnapshotAssetContext;
  fetchSameOriginAssetBlob: FetchSameOriginAssetBlob;
  snapshotSessionId: string;
  target: AssetTarget;
  warnings: string[];
}): Promise<WebSnapshotAssetEntry | null> {
  try {
    const asset = await fetchSnapshotAsset({ ...args, url: args.target.url });
    if (!acceptAssetWithinBudget(asset, args.budget, args.warnings)) {
      removeFailedAssetReference(args.target);
      return null;
    }
    args.target.element.setAttribute(args.target.attribute, `../${asset.localPath}`);
    return asset;
  } catch (error) {
    removeFailedAssetReference(args.target);
    pushAssetCaptureWarning(args.warnings, args.target.url, args.context.baseUrl, error);
    return null;
  }
}

export async function captureAssetTarget(args: {
  allowAnonymousCrossOriginAssets: boolean;
  assets: WebSnapshotAssetEntry[];
  budget: AssetByteBudget;
  context: WebSnapshotAssetContext;
  fetchSameOriginAssetBlob: FetchSameOriginAssetBlob;
  nextAssetIndex: number;
  snapshotSessionId: string;
  target: AssetTarget;
  warnings: string[];
}): Promise<number> {
  if (args.target.attribute === 'srcset') {
    const srcsetResult = await captureSrcsetAssets({
      ...args,
      startIndex: args.nextAssetIndex,
    });
    args.assets.push(...srcsetResult.assets);
    return srcsetResult.nextIndex;
  }

  if (!hasAssetBudgetCapacity(args.budget)) {
    skipAssetBecauseBudgetExceeded(args.target, args.warnings, args.context.baseUrl);
    return args.nextAssetIndex + 1;
  }

  const asset = await captureSingleAsset({ ...args, assetIndex: args.nextAssetIndex });
  if (asset) {
    args.assets.push(asset);
  }
  return args.nextAssetIndex + 1;
}
