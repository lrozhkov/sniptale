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
  createBrowserAnnotationTargetEvidence,
  type BrowserAnnotationTargetEvidence,
} from '../../../parser/page-preparation/annotations';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import {
  applyPreparedPageStyleRuleMutation,
  preparePageStyleRuleMutation,
  type PageStyleRuleApplyResult,
} from '../../../selection/quick-edit-runtime/page-style/apply';
import { createPageStyleAssetResolver } from '../../../selection/quick-edit-runtime/page-style/assets';
import { publishPageStyleAnnotation } from '../../../selection/quick-edit-runtime/page-style/annotation';
import { resolvePageStyleRuleElement } from '../../../selection/quick-edit-runtime/page-style/element';
import {
  applyPageStyleMutationBatch,
  capturePageStyleMutationResidual,
  createPageStyleHistoryEffect,
  mergePageStyleMutationBatches,
} from '../../../selection/quick-edit-runtime/page-style/mutation';
import type {
  PageStyleMutationBatch,
  PageStyleMutationElement,
} from '../../../selection/quick-edit-runtime/page-style/types';

interface PageStylePageIdentity {
  pageDomain: string | null;
  pageUrl: string;
}

interface SavePageStyleImageAssetInput {
  file: File;
  kind: PageStyleAssetKind;
}

interface PendingPageStyleHistory {
  element: PageStyleMutationElement;
  evidence: BrowserAnnotationTargetEvidence;
  mutation: PageStyleMutationBatch | null;
  recoveryOnly: boolean;
  timer: number | null;
  transactionId: string;
}

let inspectorMutationSequence = 0;
let pendingHistoryCommit: PendingPageStyleHistory | null = null;

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

export function flushPendingPageStyleHistory(): void {
  if (!pendingHistoryCommit) {
    return;
  }

  clearPendingHistoryTimer();
  const pending = pendingHistoryCommit;
  try {
    pagePreparationHistory.commitTransaction(
      pending.transactionId,
      null,
      pending.mutation
        ? createPageStyleHistoryEffect(pending.mutation, {
            onRecovery: (recoveryBatch) => {
              tryPublishPageStyleRecovery(recoveryBatch, pending.evidence, pending.element);
            },
            recoveryOnly: pending.recoveryOnly,
          })
        : null
    );
    pendingHistoryCommit = null;
  } catch (error) {
    pagePreparationHistory.cancelTransaction(pending.transactionId);
    pendingHistoryCommit = null;
    throw error;
  }
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
  element: PageStyleMutationElement,
  evidence: BrowserAnnotationTargetEvidence
): NonNullable<typeof pendingHistoryCommit> {
  if (pendingHistoryCommit && pendingHistoryCommit.element !== element) {
    flushPendingPageStyleHistory();
  }

  if (!pendingHistoryCommit) {
    pendingHistoryCommit = {
      element,
      evidence,
      mutation: null,
      recoveryOnly: false,
      timer: null,
      transactionId: createInspectorMutationId('page-style-inspector'),
    };
    if (!pagePreparationHistory.beginTransaction(pendingHistoryCommit.transactionId)) {
      pendingHistoryCommit = null;
      throw new Error('Page style history transaction is unavailable');
    }
  }

  return pendingHistoryCommit;
}

function tryPublishPageStyleRecovery(
  mutation: PageStyleMutationBatch,
  evidence: BrowserAnnotationTargetEvidence,
  target: PageStyleMutationElement
): void {
  try {
    publishPageStyleAnnotation({ changes: mutation.declarations, evidence, target });
  } catch {
    // Invalid hostile residuals remain recovery-only and are never annotation evidence.
  }
}

function pageStyleMutationHasChanges(mutation: PageStyleMutationBatch): boolean {
  return (
    mutation.attributes.length > 0 || mutation.declarations.length > 0 || mutation.text !== null
  );
}

function retainPageStyleRecovery(args: {
  element: PageStyleMutationElement;
  evidence: BrowserAnnotationTargetEvidence;
  mutation: PageStyleMutationBatch;
  pending: PendingPageStyleHistory;
}): void {
  if (!pageStyleMutationHasChanges(args.mutation)) {
    return;
  }
  args.pending.mutation = mergePageStyleMutationBatches(args.pending.mutation, args.mutation);
  args.pending.recoveryOnly = true;
  tryPublishPageStyleRecovery(args.mutation, args.evidence, args.element);
}

function throwFailedPageStyleMutation(args: {
  element: PageStyleMutationElement;
  evidence: BrowserAnnotationTargetEvidence;
  pending: PendingPageStyleHistory;
  result: PageStyleRuleApplyResult;
}): never {
  if (args.result.recoveryMutation) {
    retainPageStyleRecovery({
      element: args.element,
      evidence: args.evidence,
      mutation: args.result.recoveryMutation,
      pending: args.pending,
    });
  }
  throw new Error(
    args.result.diagnostics.map((diagnostic) => diagnostic.message).join('; ') ||
      'Page style mutation failed'
  );
}

function publishAppliedPageStyleMutation(args: {
  element: PageStyleMutationElement;
  evidence: BrowserAnnotationTargetEvidence;
  mutation: PageStyleMutationBatch;
  pending: PendingPageStyleHistory;
}): void {
  const nextMutation = mergePageStyleMutationBatches(args.pending.mutation, args.mutation);
  try {
    publishPageStyleAnnotation({
      changes: args.mutation.declarations,
      evidence: args.evidence,
      target: args.element,
    });
  } catch (error) {
    const rollback = applyPageStyleMutationBatch(args.mutation, 'undo');
    if (!rollback.success) {
      retainPageStyleRecovery({
        element: args.element,
        evidence: args.evidence,
        mutation: capturePageStyleMutationResidual(args.mutation, 'before'),
        pending: args.pending,
      });
      throw new Error(
        `Page style evidence failed and rollback failed: ${rollback.failures.join(', ')}`,
        { cause: error }
      );
    }
    throw error;
  }
  args.pending.mutation = nextMutation;
}

function schedulePendingPageStyleHistoryCommit(): void {
  if (!pendingHistoryCommit) {
    return;
  }

  clearPendingHistoryTimer();
  pendingHistoryCommit.timer = window.setTimeout(
    flushPendingPageStyleHistory,
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
  element: PageStyleMutationElement;
  patch: PageStylePatch;
  selector?: PageStyleSelectorIdentity;
}): Promise<PageStyleRuleApplyResult> {
  return await applyPageStyleRuleWithHistory({
    element: args.element,
    rule: createTransientRule({
      patch: args.patch,
      ...(args.selector ? { selector: args.selector } : {}),
    }),
  });
}

async function applyPageStyleRuleWithHistory(args: {
  element: PageStyleMutationElement;
  rule: PageStyleRestoreRule;
}): Promise<PageStyleRuleApplyResult> {
  const evidence = createBrowserAnnotationTargetEvidence(args.element);
  const assetResolver = createPageStyleAssetResolver();

  try {
    const prepared = await preparePageStyleRuleMutation({
      assetResolver,
      element: args.element,
      rule: args.rule,
    });
    const pending = ensurePendingPageStyleHistory(args.element, evidence);
    const result = applyPreparedPageStyleRuleMutation(prepared);
    if (!result.applied) {
      throwFailedPageStyleMutation({ element: args.element, evidence, pending, result });
    }
    if (!result.mutation) {
      throw new Error('Page style mutation returned no applied delta');
    }

    publishAppliedPageStyleMutation({
      element: args.element,
      evidence,
      mutation: result.mutation,
      pending,
    });

    schedulePendingPageStyleHistoryCommit();
    return result;
  } catch (error) {
    if (!pendingHistoryCommit?.mutation) {
      cancelPendingPageStyleHistory();
    } else {
      schedulePendingPageStyleHistoryCommit();
    }
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
