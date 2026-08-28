import { extendWebSnapshotAssetSession, requestWebSnapshotAssetSession } from './asset-session';
import type { WebSnapshotAssetEntry } from './types';
import { fetchAnonymousCrossOriginAssetBlobs, readSameOriginAssetBlob } from './asset-fetch';
import { createPrivacyWarnings } from './asset-warnings';
import { collectAssetTargets, collectBackgroundFetchUrls } from './asset-targets';
import {
  captureAssetTarget,
  createAssetBudget,
  flushDeferredCssAssetRewrites,
  type CapturedAssetCache,
  type DeferredCssAssetRewrites,
  type WebSnapshotAssetContext,
} from './asset-capture';
import { prepareStylesheetAsset } from './stylesheet-assets';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseSrcset } from './asset-targets';
import { MAX_WEB_SNAPSHOT_ASSETS_BYTES } from './limits';

const logger = createLogger({ namespace: 'ContentWebSnapshot' });
const ASSET_PREFETCH_CONCURRENCY = 3;
const ASSET_PREFETCH_TOTAL_TIMEOUT_MS = 45_000;

const FETCH_TIMEOUT_MS = 15_000;

function throwIfAssetCollectionAborted(signal?: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Web snapshot save was cancelled');
}

async function fetchSameOriginAssetBlob(args: {
  allowAuthenticatedSameOriginAssets: boolean;
  abortSignal?: AbortSignal | undefined;
  resolved: URL;
}): Promise<Blob> {
  if (!args.allowAuthenticatedSameOriginAssets) {
    throw new Error('authenticated same-origin asset fetch is disabled');
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const relayAbort = () => controller.abort(args.abortSignal?.reason);
  if (args.abortSignal?.aborted) relayAbort();
  else args.abortSignal?.addEventListener('abort', relayAbort, { once: true });

  try {
    const response = await fetch(args.resolved.href, {
      credentials: 'include',
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new Error('web snapshot asset redirects are not allowed');
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await readSameOriginAssetBlob(response, args.resolved.href);
  } finally {
    args.abortSignal?.removeEventListener('abort', relayAbort);
    globalThis.clearTimeout(timeoutId);
  }
}

function resolveAssetContextWithSource(
  root: ParentNode,
  sourceUrl: string | undefined
): WebSnapshotAssetContext {
  const documentRoot =
    'nodeType' in root && root.nodeType === 9 ? (root as Document) : (root as Node).ownerDocument;
  const baseUrl = sourceUrl ?? documentRoot?.baseURI;

  if (!baseUrl) {
    throw new Error('Cannot collect web snapshot assets without a base URL.');
  }

  return {
    baseUrl,
    pageOrigin: new URL(baseUrl).origin,
  };
}

function collectSameOriginFetchUrls(
  targets: ReturnType<typeof collectAssetTargets>['targets'],
  context: WebSnapshotAssetContext
): string[] {
  const urls = new Set<string>();
  for (const target of targets) {
    const candidates =
      target.attribute === 'srcset'
        ? parseSrcset(target.url).map((item) => item.url)
        : [target.url];
    for (const candidate of candidates) {
      try {
        const resolved = new URL(candidate, context.baseUrl);
        if (resolved.origin === context.pageOrigin) urls.add(resolved.href);
      } catch {
        // Invalid targets are handled by the canonical capture path.
      }
    }
  }
  return [...urls];
}

async function prefetchSameOriginAssets(args: {
  abortSignal?: AbortSignal | undefined;
  allowAuthenticatedSameOriginAssets: boolean;
  context: WebSnapshotAssetContext;
  targets: ReturnType<typeof collectAssetTargets>['targets'];
}): Promise<Map<string, Blob | Error>> {
  const urls = collectSameOriginFetchUrls(args.targets, args.context);
  if (urls.length === 0) return new Map();
  const controller = new AbortController();
  const relayAbort = () => controller.abort(args.abortSignal?.reason);
  if (args.abortSignal?.aborted) relayAbort();
  else args.abortSignal?.addEventListener('abort', relayAbort, { once: true });
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(new Error('Web snapshot asset collection timed out')),
    ASSET_PREFETCH_TOTAL_TIMEOUT_MS
  );
  const results = new Map<string, Blob | Error>();
  let retainedBytes = 0;
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < urls.length) {
      const url = urls[nextIndex];
      nextIndex += 1;
      if (!url) continue;
      try {
        const blob = await fetchSameOriginAssetBlob({
          allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets,
          abortSignal: controller.signal,
          resolved: new URL(url),
        });
        if (retainedBytes + blob.size > MAX_WEB_SNAPSHOT_ASSETS_BYTES) {
          results.set(url, new Error('web snapshot asset budget exceeded'));
          controller.abort(new Error('Web snapshot asset budget reached'));
        } else {
          retainedBytes += blob.size;
          results.set(url, blob);
          if (retainedBytes >= MAX_WEB_SNAPSHOT_ASSETS_BYTES) {
            controller.abort(new Error('Web snapshot asset budget reached'));
          }
        }
      } catch (error) {
        results.set(
          url,
          error instanceof Error ? error : new Error('same-origin asset fetch failed')
        );
      }
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(ASSET_PREFETCH_CONCURRENCY, urls.length) }, () => worker())
    );
    return results;
  } finally {
    globalThis.clearTimeout(timeoutId);
    args.abortSignal?.removeEventListener('abort', relayAbort);
  }
}

function registerAssetSession(args: {
  allowAnonymousCrossOriginAssets: boolean;
  context: WebSnapshotAssetContext;
  requestId: string;
  targets: ReturnType<typeof collectAssetTargets>['targets'];
}): Promise<string> {
  const assetUrls = args.allowAnonymousCrossOriginAssets
    ? collectBackgroundFetchUrls(args.targets, args.context)
    : [];

  return requestWebSnapshotAssetSession(assetUrls, args.requestId);
}

async function captureCollectedAssetTargets(args: {
  allowAnonymousCrossOriginAssets: boolean;
  allowAuthenticatedSameOriginAssets: boolean;
  anonymousCrossOriginAssets: Map<string, Blob | Error>;
  assets: WebSnapshotAssetEntry[];
  budget: ReturnType<typeof createAssetBudget>;
  context: WebSnapshotAssetContext;
  snapshotSessionId: string;
  targets: ReturnType<typeof collectAssetTargets>['targets'];
  warnings: string[];
  abortSignal?: AbortSignal | undefined;
  state: {
    capturedAssetsByUrl: CapturedAssetCache;
    nextAssetIndex: number;
  };
}): Promise<void> {
  const startedAt = Date.now();
  const deferredCssAssetRewrites: DeferredCssAssetRewrites = new Map();
  for (const [targetIndex, target] of args.targets.entries()) {
    throwIfAssetCollectionAborted(args.abortSignal);
    if (targetIndex > 0 && targetIndex % 25 === 0) {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
      throwIfAssetCollectionAborted(args.abortSignal);
    }
    args.state.nextAssetIndex = await captureAssetTarget({
      allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
      anonymousCrossOriginAssets: args.anonymousCrossOriginAssets,
      assets: args.assets,
      budget: args.budget,
      context: args.context,
      fetchSameOriginAssetBlob: (resolved) =>
        fetchSameOriginAssetBlob({
          allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets,
          abortSignal: args.abortSignal,
          resolved,
        }),
      nextAssetIndex: args.state.nextAssetIndex,
      snapshotSessionId: args.snapshotSessionId,
      target,
      warnings: args.warnings,
      capturedAssetsByUrl: args.state.capturedAssetsByUrl,
      deferredCssAssetRewrites,
      abortSignal: args.abortSignal,
    });
    throwIfAssetCollectionAborted(args.abortSignal);
  }
  flushDeferredCssAssetRewrites(deferredCssAssetRewrites);
  logger.log('Web snapshot asset targets materialized', {
    elapsedMs: Date.now() - startedAt,
    targetCount: args.targets.length,
  });
}

async function captureNestedStylesheetAssets(args: {
  allowAnonymousCrossOriginAssets: boolean;
  allowAuthenticatedSameOriginAssets: boolean;
  anonymousCrossOriginAssets: Map<string, Blob | Error>;
  assets: WebSnapshotAssetEntry[];
  budget: ReturnType<typeof createAssetBudget>;
  context: WebSnapshotAssetContext;
  requestId: string;
  snapshotSessionId: string;
  state: {
    capturedAssetsByUrl: CapturedAssetCache;
    nextAssetIndex: number;
  };
  warnings: string[];
  abortSignal?: AbortSignal | undefined;
}): Promise<void> {
  const preparedStylesheetUrls = new Set<string>();
  for (let assetIndex = 0; assetIndex < args.assets.length; assetIndex += 1) {
    const stylesheetAsset = args.assets[assetIndex];
    if (
      !stylesheetAsset ||
      stylesheetAsset.blob.type !== 'text/css' ||
      preparedStylesheetUrls.has(stylesheetAsset.originalUrl)
    ) {
      continue;
    }
    preparedStylesheetUrls.add(stylesheetAsset.originalUrl);
    throwIfAssetCollectionAborted(args.abortSignal);
    logger.log('Web snapshot stylesheet preparation started', {
      assetIndex,
      stylesheetBytes: stylesheetAsset.blob.size,
    });
    const prepared = await prepareStylesheetAsset(stylesheetAsset);
    logger.log('Web snapshot stylesheet parsed', {
      assetIndex,
      nestedTargetCount: prepared.targets.length,
    });
    const crossOriginUrls = collectBackgroundFetchUrls(prepared.targets, args.context);
    const sameOriginAssetsPromise = prefetchSameOriginAssets({
      abortSignal: args.abortSignal,
      allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets,
      context: args.context,
      targets: prepared.targets,
    });
    if (args.allowAnonymousCrossOriginAssets) {
      await extendWebSnapshotAssetSession(crossOriginUrls, args.requestId, args.snapshotSessionId);
      const [nestedAssets, sameOriginAssets] = await Promise.all([
        fetchAnonymousCrossOriginAssetBlobs(crossOriginUrls, args.snapshotSessionId),
        sameOriginAssetsPromise,
      ]);
      for (const [url, result] of nestedAssets) {
        args.anonymousCrossOriginAssets.set(url, result);
      }
      for (const [url, result] of sameOriginAssets) {
        args.anonymousCrossOriginAssets.set(url, result);
      }
    } else {
      const sameOriginAssets = await sameOriginAssetsPromise;
      for (const [url, result] of sameOriginAssets) {
        args.anonymousCrossOriginAssets.set(url, result);
      }
    }
    await captureCollectedAssetTargets({
      ...args,
      targets: prepared.targets,
    });
    prepared.finish();
    logger.log('Web snapshot stylesheet materialized', { assetIndex });
  }
}

export async function collectWebSnapshotAssets(
  root: ParentNode,
  args: {
    allowAnonymousCrossOriginAssets: boolean;
    allowAuthenticatedSameOriginAssets: boolean;
    requestId: string;
    sourceUrl?: string | undefined;
    abortSignal?: AbortSignal | undefined;
  }
): Promise<{
  assets: WebSnapshotAssetEntry[];
  privacyWarnings: string[];
  snapshotSessionId: string;
  warnings: string[];
}> {
  throwIfAssetCollectionAborted(args.abortSignal);
  const assets: WebSnapshotAssetEntry[] = [];
  const warnings: string[] = [];
  const context = resolveAssetContextWithSource(root, args.sourceUrl);
  const targetCollection = collectAssetTargets(root, {
    baseUrl: context.baseUrl,
  });
  const targets = targetCollection.targets;
  const privacyWarnings = createPrivacyWarnings(
    targetCollection.warnings,
    args.allowAuthenticatedSameOriginAssets,
    context.baseUrl
  );
  const budget = createAssetBudget();
  const state = {
    capturedAssetsByUrl: new Map<string, WebSnapshotAssetEntry | null>(),
    nextAssetIndex: 1,
  };
  const snapshotSessionId = await registerAssetSession({
    allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
    context,
    requestId: args.requestId,
    targets,
  });
  throwIfAssetCollectionAborted(args.abortSignal);
  const [crossOriginAssets, sameOriginAssets] = await Promise.all([
    args.allowAnonymousCrossOriginAssets
      ? fetchAnonymousCrossOriginAssetBlobs(
          collectBackgroundFetchUrls(targets, context),
          snapshotSessionId
        )
      : Promise.resolve(new Map<string, Blob | Error>()),
    prefetchSameOriginAssets({
      abortSignal: args.abortSignal,
      allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets,
      context,
      targets,
    }),
  ]);
  const anonymousCrossOriginAssets = new Map([...crossOriginAssets, ...sameOriginAssets]);
  logger.log('Web snapshot primary asset batch received', {
    fetchedCount: anonymousCrossOriginAssets.size,
    targetCount: targets.length,
  });
  throwIfAssetCollectionAborted(args.abortSignal);

  await captureCollectedAssetTargets({
    allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
    allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets,
    anonymousCrossOriginAssets,
    assets,
    budget,
    context,
    snapshotSessionId,
    targets,
    warnings,
    abortSignal: args.abortSignal,
    state,
  });
  logger.log('Web snapshot primary asset targets materialized', {
    assetCount: assets.length,
  });

  await captureNestedStylesheetAssets({
    allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
    allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets,
    anonymousCrossOriginAssets,
    assets,
    budget,
    context,
    requestId: args.requestId,
    snapshotSessionId,
    state,
    warnings,
    abortSignal: args.abortSignal,
  });

  return { assets, privacyWarnings, snapshotSessionId, warnings };
}
