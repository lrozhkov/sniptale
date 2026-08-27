import { extendWebSnapshotAssetSession, requestWebSnapshotAssetSession } from './asset-session';
import type { WebSnapshotAssetEntry } from './types';
import { readSameOriginAssetBlob } from './asset-fetch';
import { createPrivacyWarnings } from './asset-warnings';
import { collectAssetTargets, collectBackgroundFetchUrls } from './asset-targets';
import {
  captureAssetTarget,
  createAssetBudget,
  type CapturedAssetCache,
  type WebSnapshotAssetContext,
} from './asset-capture';
import { prepareStylesheetAsset } from './stylesheet-assets';

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

    return await readSameOriginAssetBlob(response);
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
  for (const target of args.targets) {
    throwIfAssetCollectionAborted(args.abortSignal);
    args.state.nextAssetIndex = await captureAssetTarget({
      allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
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
      abortSignal: args.abortSignal,
    });
    throwIfAssetCollectionAborted(args.abortSignal);
  }
}

async function captureNestedStylesheetAssets(args: {
  allowAnonymousCrossOriginAssets: boolean;
  allowAuthenticatedSameOriginAssets: boolean;
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
    const prepared = await prepareStylesheetAsset(stylesheetAsset);
    const crossOriginUrls = collectBackgroundFetchUrls(prepared.targets, args.context);
    if (args.allowAnonymousCrossOriginAssets) {
      await extendWebSnapshotAssetSession(crossOriginUrls, args.requestId, args.snapshotSessionId);
    }
    await captureCollectedAssetTargets({
      ...args,
      targets: prepared.targets,
    });
    prepared.finish();
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
  const targetCollection = collectAssetTargets(root, { baseUrl: context.baseUrl });
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

  await captureCollectedAssetTargets({
    allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
    allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets,
    assets,
    budget,
    context,
    snapshotSessionId,
    targets,
    warnings,
    abortSignal: args.abortSignal,
    state,
  });

  await captureNestedStylesheetAssets({
    allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
    allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets,
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
