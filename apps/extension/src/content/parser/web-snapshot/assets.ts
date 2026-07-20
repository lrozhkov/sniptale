import { requestWebSnapshotAssetSession } from './asset-session';
import type { WebSnapshotAssetEntry } from './types';
import { readSameOriginAssetBlob } from './asset-fetch';
import { createPrivacyWarnings } from './asset-warnings';
import { collectAssetTargets, collectBackgroundFetchUrls } from './asset-targets';
import {
  captureAssetTarget,
  createAssetBudget,
  type WebSnapshotAssetContext,
} from './asset-capture';

const FETCH_TIMEOUT_MS = 15_000;

async function fetchSameOriginAssetBlob(args: {
  allowAuthenticatedSameOriginAssets: boolean;
  resolved: URL;
}): Promise<Blob> {
  if (!args.allowAuthenticatedSameOriginAssets) {
    throw new Error('authenticated same-origin asset fetch is disabled');
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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
}): Promise<void> {
  let nextAssetIndex = 1;

  for (const target of args.targets) {
    nextAssetIndex = await captureAssetTarget({
      allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
      assets: args.assets,
      budget: args.budget,
      context: args.context,
      fetchSameOriginAssetBlob: (resolved) =>
        fetchSameOriginAssetBlob({
          allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets,
          resolved,
        }),
      nextAssetIndex,
      snapshotSessionId: args.snapshotSessionId,
      target,
      warnings: args.warnings,
    });
  }
}

export async function collectWebSnapshotAssets(
  root: ParentNode,
  args: {
    allowAnonymousCrossOriginAssets: boolean;
    allowAuthenticatedSameOriginAssets: boolean;
    requestId: string;
    sourceUrl?: string | undefined;
  }
): Promise<{
  assets: WebSnapshotAssetEntry[];
  privacyWarnings: string[];
  snapshotSessionId: string;
  warnings: string[];
}> {
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
  const snapshotSessionId = await registerAssetSession({
    allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
    context,
    requestId: args.requestId,
    targets,
  });

  await captureCollectedAssetTargets({
    allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
    allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets,
    assets,
    budget,
    context,
    snapshotSessionId,
    targets,
    warnings,
  });

  return { assets, privacyWarnings, snapshotSessionId, warnings };
}
