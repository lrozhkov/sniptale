import {
  PAGE_STYLE_ASSET_KINDS,
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleAssetKind,
  type PageStyleAssetReference,
  type PageStylePatch,
  type PageStyleRestoreRule,
  type PageStyleScope,
  type PageStyleSelectorIdentity,
} from '@sniptale/runtime-contracts/page-style';
import { savePageStyleAsset } from '../../../../composition/persistence/page-style/assets';
import {
  captureDomStateMap,
  createDomMutationBatch,
  pagePreparationHistory,
} from '../../../parser/page-preparation/history';
import { applyPageStyleRule } from '../../../selection/quick-edit-runtime/page-style/apply';
import { createPageStyleAssetResolver } from '../../../selection/quick-edit-runtime/page-style/assets';
import { resolvePageStyleRuleElement } from '../../../selection/quick-edit-runtime/page-style/element';

interface PageStylePageIdentity {
  pageDomain: string | null;
  pageUrl: string;
}

interface SavePageStyleImageAssetInput {
  file: File;
  kind: PageStyleAssetKind;
}

let inspectorMutationSequence = 0;
let pendingHistoryCommit: {
  beforeStates: ReturnType<typeof captureDomStateMap>;
  element: HTMLElement;
  timer: number | null;
  transactionId: string;
} | null = null;

const PAGE_STYLE_HISTORY_IDLE_COMMIT_MS = 500;

function resolveCurrentPageStyleLocation(): Pick<Location, 'href' | 'hostname'> {
  if (typeof window === 'undefined') {
    return { hostname: '', href: '' };
  }

  return window.location;
}

function createInspectorMutationId(prefix: string): string {
  inspectorMutationSequence += 1;
  return `${prefix}:${Date.now()}:${inspectorMutationSequence}`;
}

function clearPendingHistoryTimer(): void {
  if (!pendingHistoryCommit?.timer) {
    return;
  }

  window.clearTimeout(pendingHistoryCommit.timer);
  pendingHistoryCommit.timer = null;
}

function commitPendingPageStyleHistory(): void {
  if (!pendingHistoryCommit) {
    return;
  }

  clearPendingHistoryTimer();
  const pending = pendingHistoryCommit;
  pendingHistoryCommit = null;
  pagePreparationHistory.commitTransaction(
    pending.transactionId,
    createDomMutationBatch([pending.element], pending.beforeStates)
  );
}

function cancelPendingPageStyleHistory(): void {
  if (!pendingHistoryCommit) {
    return;
  }

  clearPendingHistoryTimer();
  pagePreparationHistory.cancelTransaction(pendingHistoryCommit.transactionId);
  pendingHistoryCommit = null;
}

function ensurePendingPageStyleHistory(
  element: HTMLElement
): NonNullable<typeof pendingHistoryCommit> {
  if (pendingHistoryCommit && pendingHistoryCommit.element !== element) {
    commitPendingPageStyleHistory();
  }

  if (!pendingHistoryCommit) {
    pendingHistoryCommit = {
      beforeStates: captureDomStateMap([element]),
      element,
      timer: null,
      transactionId: createInspectorMutationId('page-style-inspector'),
    };
    pagePreparationHistory.beginTransaction(pendingHistoryCommit.transactionId);
  }

  return pendingHistoryCommit;
}

function schedulePendingPageStyleHistoryCommit(): void {
  if (!pendingHistoryCommit) {
    return;
  }

  clearPendingHistoryTimer();
  pendingHistoryCommit.timer = window.setTimeout(
    commitPendingPageStyleHistory,
    PAGE_STYLE_HISTORY_IDLE_COMMIT_MS
  );
}

export function readCurrentPageStyleIdentity(
  location: Pick<Location, 'href' | 'hostname'> = resolveCurrentPageStyleLocation()
): PageStylePageIdentity {
  return {
    pageDomain: location.hostname || null,
    pageUrl: location.href,
  };
}

export function createExactPageStyleScope(
  page: PageStylePageIdentity = readCurrentPageStyleIdentity()
): PageStyleScope {
  return {
    active: PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS,
    domain: page.pageDomain,
    exactAddress: page.pageUrl,
  };
}

function createTransientRule(args: {
  patch: PageStylePatch;
  scope?: PageStyleScope;
  selector?: PageStyleSelectorIdentity;
}): PageStyleRestoreRule {
  const now = Date.now();

  return {
    createdAt: now,
    enabled: true,
    id: createInspectorMutationId('inspector-preview'),
    name: 'Inspector preview',
    patch: args.patch,
    propertySummary: args.patch.declarations.map((declaration) => declaration.property),
    scope: args.scope ?? createExactPageStyleScope(),
    selector: args.selector ?? { locator: '' },
    updatedAt: now,
  };
}

export async function applyPageStylePatchWithHistory(args: {
  element: HTMLElement;
  patch: PageStylePatch;
  selector?: PageStyleSelectorIdentity;
}): Promise<void> {
  await applyPageStyleRuleWithHistory({
    element: args.element,
    rule: createTransientRule({
      patch: args.patch,
      ...(args.selector ? { selector: args.selector } : {}),
    }),
  });
}

async function applyPageStyleRuleWithHistory(args: {
  element: HTMLElement;
  rule: PageStyleRestoreRule;
}): Promise<void> {
  const assetResolver = createPageStyleAssetResolver();
  ensurePendingPageStyleHistory(args.element);

  try {
    await applyPageStyleRule({
      assetResolver,
      element: args.element,
      rule: args.rule,
    });
    schedulePendingPageStyleHistoryCommit();
  } catch (error) {
    cancelPendingPageStyleHistory();
    throw error;
  } finally {
    assetResolver.dispose();
  }
}

export async function applyPageStyleRestoreRuleWithHistory(
  rule: PageStyleRestoreRule
): Promise<boolean> {
  const element = resolvePageStyleRuleElement(rule);
  if (!element) {
    return false;
  }

  await applyPageStyleRuleWithHistory({ element, rule });
  return true;
}

function createAssetReference(
  entry: Awaited<ReturnType<typeof savePageStyleAsset>>
): PageStyleAssetReference {
  return {
    assetId: entry.id,
    kind: entry.kind,
    filename: entry.filename,
    height: entry.height,
    mimeType: entry.mimeType,
    size: entry.size,
    width: entry.width,
  };
}

export async function savePageStyleImageAsset(
  input: SavePageStyleImageAssetInput
): Promise<PageStyleAssetReference> {
  const entry = await savePageStyleAsset({
    blob: input.file,
    filename: input.file.name || 'page-style-image',
    kind: input.kind,
    mimeType: input.file.type || 'application/octet-stream',
  });

  return createAssetReference(entry);
}

export function appendPageStyleImageAsset(args: {
  asset: PageStyleAssetReference;
  patch: PageStylePatch;
}): PageStylePatch {
  const nextAssets = args.patch.assets.filter((asset) => asset.kind !== args.asset.kind);

  return {
    assets: [...nextAssets, args.asset],
    declarations:
      args.asset.kind === PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE
        ? [
            ...args.patch.declarations.filter(
              (declaration) => declaration.property !== 'background-image'
            ),
            { property: 'background-image', value: null },
          ]
        : args.patch.declarations,
  };
}
