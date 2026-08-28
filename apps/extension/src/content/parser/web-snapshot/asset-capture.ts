import { formatWebSnapshotWarningUrl } from './asset-session';
import { fetchAssetUrl } from './asset-fetch';
import { sanitizeWebSnapshotCssText } from '../../../features/web-snapshot/public';
import { MAX_WEB_SNAPSHOT_ASSET_BYTES, MAX_WEB_SNAPSHOT_ASSETS_BYTES } from './limits';
import { parseSrcset, serializeSrcset, type AssetTarget } from './asset-targets';
import type { WebSnapshotAssetEntry } from './types';

interface AssetByteBudget {
  totalBytes: number;
}

export type CapturedAssetCache = Map<string, WebSnapshotAssetEntry | null>;
export type DeferredCssAssetRewrites = Map<Element, Map<string, string | null>>;

export type WebSnapshotAssetContext = {
  baseUrl: string;
  pageOrigin: string;
};
type FetchSameOriginAssetBlob = (resolved: URL) => Promise<Blob>;
type AnonymousCrossOriginAssets = ReadonlyMap<string, Blob | Error>;

function throwIfAssetCaptureAborted(signal?: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Web snapshot save was cancelled');
}

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
  baseUrl: string,
  deferredCssAssetRewrites?: DeferredCssAssetRewrites
): void {
  removeFailedAssetReference(target, deferredCssAssetRewrites);
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
  anonymousCrossOriginAssets: AnonymousCrossOriginAssets;
  assetIndex: number;
  context: WebSnapshotAssetContext;
  fetchSameOriginAssetBlob: FetchSameOriginAssetBlob;
  snapshotSessionId: string;
  url: string;
}): Promise<WebSnapshotAssetEntry> {
  return fetchAssetUrl({
    allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
    anonymousCrossOriginAssets: args.anonymousCrossOriginAssets,
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
  anonymousCrossOriginAssets: AnonymousCrossOriginAssets;
  budget: AssetByteBudget;
  context: WebSnapshotAssetContext;
  fetchSameOriginAssetBlob: FetchSameOriginAssetBlob;
  target: AssetTarget;
  startIndex: number;
  snapshotSessionId: string;
  warnings: string[];
  abortSignal?: AbortSignal | undefined;
}): Promise<{ assets: WebSnapshotAssetEntry[]; nextIndex: number }> {
  const assets: WebSnapshotAssetEntry[] = [];
  const candidates = parseSrcset(args.target.url);

  for (const [candidateIndex, candidate] of candidates.entries()) {
    throwIfAssetCaptureAborted(args.abortSignal);
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
      throwIfAssetCaptureAborted(args.abortSignal);
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

function rewriteCssAssetReference(target: AssetTarget, replacement: string | null): void {
  const isStyleElement = target.element.tagName.toLowerCase() === 'style';
  const cssText = isStyleElement
    ? (target.element.textContent ?? '')
    : (target.element.getAttribute('style') ?? '');
  const rewritten = sanitizeWebSnapshotCssText(cssText, (url) =>
    url === target.url ? replacement : url
  );
  if (isStyleElement) target.element.textContent = rewritten;
  else target.element.setAttribute('style', rewritten);
}

function deferCssAssetReference(
  target: AssetTarget,
  replacement: string | null,
  deferredCssAssetRewrites?: DeferredCssAssetRewrites
): boolean {
  if (target.attribute !== 'css-url' || !deferredCssAssetRewrites) return false;
  const replacements =
    deferredCssAssetRewrites.get(target.element) ?? new Map<string, string | null>();
  replacements.set(target.url, replacement);
  deferredCssAssetRewrites.set(target.element, replacements);
  return true;
}

export function flushDeferredCssAssetRewrites(
  deferredCssAssetRewrites: DeferredCssAssetRewrites
): void {
  for (const [element, replacements] of deferredCssAssetRewrites) {
    const isStyleElement = element.tagName.toLowerCase() === 'style';
    const cssText = isStyleElement
      ? (element.textContent ?? '')
      : (element.getAttribute('style') ?? '');
    const rewritten = sanitizeWebSnapshotCssText(cssText, (url) =>
      replacements.has(url) ? (replacements.get(url) ?? null) : url
    );
    if (isStyleElement) element.textContent = rewritten;
    else element.setAttribute('style', rewritten);
  }
  deferredCssAssetRewrites.clear();
}

function removeFailedAssetReference(
  target: AssetTarget,
  deferredCssAssetRewrites?: DeferredCssAssetRewrites
): void {
  if (deferCssAssetReference(target, null, deferredCssAssetRewrites)) return;
  if (target.attribute === 'css-url') {
    rewriteCssAssetReference(target, null);
    return;
  }
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

function applyCapturedAssetReference(
  target: AssetTarget,
  asset: WebSnapshotAssetEntry,
  deferredCssAssetRewrites?: DeferredCssAssetRewrites
): void {
  if (deferCssAssetReference(target, `../${asset.localPath}`, deferredCssAssetRewrites)) return;
  if (target.attribute === 'css-url') {
    rewriteCssAssetReference(target, `../${asset.localPath}`);
  } else {
    target.element.setAttribute(target.attribute, `../${asset.localPath}`);
  }
}

function applyRejectedAsset(args: {
  capturedAssetsByUrl: CapturedAssetCache;
  deferredCssAssetRewrites?: DeferredCssAssetRewrites;
  resolvedUrl: string;
  target: AssetTarget;
}): null {
  args.capturedAssetsByUrl.set(args.resolvedUrl, null);
  removeFailedAssetReference(args.target, args.deferredCssAssetRewrites);
  return null;
}

async function captureSingleAsset(args: {
  allowAnonymousCrossOriginAssets: boolean;
  anonymousCrossOriginAssets: AnonymousCrossOriginAssets;
  assetIndex: number;
  budget: AssetByteBudget;
  context: WebSnapshotAssetContext;
  fetchSameOriginAssetBlob: FetchSameOriginAssetBlob;
  snapshotSessionId: string;
  target: AssetTarget;
  warnings: string[];
  abortSignal?: AbortSignal | undefined;
  capturedAssetsByUrl: CapturedAssetCache;
  deferredCssAssetRewrites?: DeferredCssAssetRewrites;
}): Promise<WebSnapshotAssetEntry | null> {
  throwIfAssetCaptureAborted(args.abortSignal);
  const resolvedUrl = new URL(args.target.url, args.context.baseUrl).href;
  if (args.capturedAssetsByUrl.has(resolvedUrl)) {
    const cachedAsset = args.capturedAssetsByUrl.get(resolvedUrl) ?? null;
    if (cachedAsset) {
      applyCapturedAssetReference(args.target, cachedAsset, args.deferredCssAssetRewrites);
    } else {
      applyRejectedAsset({
        capturedAssetsByUrl: args.capturedAssetsByUrl,
        resolvedUrl,
        target: args.target,
      });
    }
    return null;
  }
  try {
    const asset = await fetchSnapshotAsset({ ...args, url: args.target.url });
    if (!acceptAssetWithinBudget(asset, args.budget, args.warnings)) {
      return applyRejectedAsset({
        capturedAssetsByUrl: args.capturedAssetsByUrl,
        resolvedUrl,
        target: args.target,
      });
    }
    args.capturedAssetsByUrl.set(resolvedUrl, asset);
    applyCapturedAssetReference(args.target, asset, args.deferredCssAssetRewrites);
    return asset;
  } catch (error) {
    throwIfAssetCaptureAborted(args.abortSignal);
    pushAssetCaptureWarning(args.warnings, args.target.url, args.context.baseUrl, error);
    return applyRejectedAsset({
      capturedAssetsByUrl: args.capturedAssetsByUrl,
      resolvedUrl,
      target: args.target,
    });
  }
}

export async function captureAssetTarget(args: {
  allowAnonymousCrossOriginAssets: boolean;
  anonymousCrossOriginAssets: AnonymousCrossOriginAssets;
  assets: WebSnapshotAssetEntry[];
  budget: AssetByteBudget;
  context: WebSnapshotAssetContext;
  fetchSameOriginAssetBlob: FetchSameOriginAssetBlob;
  nextAssetIndex: number;
  snapshotSessionId: string;
  target: AssetTarget;
  warnings: string[];
  abortSignal?: AbortSignal | undefined;
  capturedAssetsByUrl: CapturedAssetCache;
  deferredCssAssetRewrites?: DeferredCssAssetRewrites;
}): Promise<number> {
  throwIfAssetCaptureAborted(args.abortSignal);
  if (args.target.attribute === 'srcset') {
    const srcsetResult = await captureSrcsetAssets({
      ...args,
      startIndex: args.nextAssetIndex,
    });
    args.assets.push(...srcsetResult.assets);
    return srcsetResult.nextIndex;
  }

  if (!hasAssetBudgetCapacity(args.budget)) {
    skipAssetBecauseBudgetExceeded(
      args.target,
      args.warnings,
      args.context.baseUrl,
      args.deferredCssAssetRewrites
    );
    return args.nextAssetIndex + 1;
  }

  const asset = await captureSingleAsset({
    ...args,
    assetIndex: args.nextAssetIndex,
  });
  if (asset) {
    args.assets.push(asset);
  }
  return args.nextAssetIndex + 1;
}
