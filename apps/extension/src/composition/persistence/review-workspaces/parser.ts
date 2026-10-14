import { parseLibraryLifecycle } from '../library-lifecycle/parser';
import { isDiscardedHeaderChange, replayStoredReviewHistory } from './legacy-header-history';
import { parseVideoWorkspaceTyping, withoutVideoWorkspaceTyping } from './typing';
import { pruneReviewAnnotationEffectSnapshots } from './asset-refs';
import {
  parseReviewAnnotationEffectSnapshots,
  readReviewAnnotationEffectDocument,
  reviewAnnotationEffectMatchesDocument,
} from '../../../features/video/review/annotation-effects/validation';
import type { ReviewAnnotationEffectSnapshot } from '../../../features/video/review/annotation-effects/types';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  ReviewHistoryError,
  createReviewAdvancedContentOperation,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import { createQuickEditAdvancedContent } from '../../../features/video/review/advanced/defaults';
import { buildReviewTimeMap } from '../../../features/video/review/timeline';
import {
  parseReviewAnnotation,
  parseReviewOperation,
  parseReviewSource,
  parseReviewDocumentBaseline,
} from '../../../features/video/review/validation';
import { loadQuickEditAdvancedState } from '../../../features/video/review/advanced/validation';
import type {
  ReviewDocument,
  ReviewOperation,
  ReviewSource,
} from '../../../features/video/review/types';
import type { QuickEditAdvancedState } from '../../../features/video/review/advanced/types';
import type { VideoWorkspace, VideoWorkspaceDraft, VideoWorkspaceProject } from './contracts';

/** Safe parser location and invariant codes; no retained document values. */
export type VideoWorkspaceDiagnostic = {
  check:
    | 'workspace-envelope'
    | 'project-metadata'
    | 'source-metadata'
    | 'history-operation'
    | 'history-replay'
    | 'advanced-state'
    | 'effect-snapshots'
    | 'timeline'
    | 'workspace-identity'
    | 'draft';
  reason: 'invalid' | 'duplicate-operation' | ReviewHistoryError['reason'];
  operationIndex?: number | undefined;
  target?: ReviewOperation['target'] | undefined;
  cursor?: number | undefined;
  historyLength?: number | undefined;
};
type Report = (failure: VideoWorkspaceDiagnostic) => void;
const replayFailure = (error: unknown): VideoWorkspaceDiagnostic =>
  error instanceof ReviewHistoryError
    ? {
        check: 'history-replay',
        reason: error.reason,
        operationIndex: error.operationIndex,
        target: error.target,
      }
    : { check: 'history-replay', reason: 'unexpected-replay-failure' };

const revision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
const timestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const aggregateId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256;

function parseWorkspaceHistory(
  raw: unknown[],
  source: ReviewSource,
  report: Report
): { history: ReviewOperation[]; discardedHeaderChanges: Set<number> } | null {
  const history: ReviewOperation[] = [];
  const ids = new Set<string>();
  const discardedHeaderChanges = new Set<number>();
  for (const [index, value] of raw.entries()) {
    const operation = parseReviewOperation(value, source.duration);
    if (!operation || ids.has(operation.id)) {
      report({
        check: 'history-operation',
        reason: operation ? 'duplicate-operation' : 'invalid',
        operationIndex: index,
      });
      return null;
    }
    ids.add(operation.id);
    if (isDiscardedHeaderChange(value, operation)) discardedHeaderChanges.add(index);
    history.push(operation);
  }
  return { history, discardedHeaderChanges };
}

/** Replays current and legacy baselines, returning only a fixed-point workspace state. */
function parseWorkspaceDocument(args: {
  history: readonly ReviewOperation[];
  cursor: number;
  source: ReviewSource;
  rawAdvanced: unknown;
  completeBaseline?: ReviewDocument;
  discardedHeaderChanges: ReadonlySet<number>;
  report: Report;
}): {
  document: ReviewDocument;
  advanced: QuickEditAdvancedState;
  history: ReviewOperation[];
  cursor: number;
} | null {
  const currentAdvanced = loadQuickEditAdvancedState(args.rawAdvanced);
  const baseline = currentAdvanced
    ? reviewAdvancedContentBaseline(currentAdvanced)
    : createQuickEditAdvancedContent();
  if (
    args.completeBaseline &&
    (!currentAdvanced ||
      JSON.stringify(baseline) !==
        JSON.stringify(reviewAdvancedContentBaseline(args.completeBaseline.advancedContent)))
  ) {
    args.report({ check: 'advanced-state', reason: 'invalid' });
    return null;
  }
  let replayed: ReturnType<typeof replayStoredReviewHistory>;
  try {
    replayed = replayStoredReviewHistory({ ...args, baseline: args.completeBaseline ?? baseline });
  } catch (error) {
    args.report(replayFailure(error));
    return null;
  }
  let segments;
  try {
    segments = buildReviewTimeMap(args.source.duration, replayed.document.edits);
  } catch {
    args.report({ check: 'timeline', reason: 'invalid' });
    return null;
  }
  const advanced = currentAdvanced ?? loadQuickEditAdvancedState(args.rawAdvanced, segments);
  if (!advanced) {
    args.report({ check: 'advanced-state', reason: 'invalid' });
    return null;
  }
  if (!currentAdvanced) {
    const migratedBaseline = reviewAdvancedContentBaseline(advanced);
    try {
      replayed = replayStoredReviewHistory({ ...args, baseline: migratedBaseline });
    } catch (error) {
      args.report(replayFailure(error));
      return null;
    }
  }
  return { ...replayed, advanced };
}

/** Checks baseline and before/after effect bindings; raw registry admission remains separate. */
function validEffectSnapshotClosure(
  snapshots: readonly ReviewAnnotationEffectSnapshot[],
  advanced: QuickEditAdvancedState,
  history: readonly ReviewOperation[],
  duration: number
): boolean {
  const documents = new Map(
    snapshots.map((snapshot) => [snapshot.id, readReviewAnnotationEffectDocument(snapshot.source)])
  );
  const content = [
    advanced,
    ...history.flatMap((operation) =>
      operation.target === 'advancedContent' ? [operation.before, operation.after] : []
    ),
  ];
  return content.every((state) =>
    (state.annotationEffects?.instances ?? []).every((instance) => {
      const document = documents.get(instance.snapshotId);
      return (
        document !== undefined &&
        document !== null &&
        instance.end <= duration &&
        reviewAnnotationEffectMatchesDocument(instance, document)
      );
    })
  );
}

function parseWorkspaceProject(value: unknown): VideoWorkspaceProject | null {
  if (
    !isRecord(value) ||
    typeof value['name'] !== 'string' ||
    value['name'].trim().length === 0 ||
    value['name'].length > 256 ||
    !isRecord(value['lifecycle'])
  )
    return null;
  const lifecycle = parseLibraryLifecycle(value['lifecycle'], {
    storageClass: 'library',
    updatedAt: 0,
  });
  if (
    !lifecycle ||
    lifecycle.storageClass !== 'library' ||
    lifecycle.savedAt === null ||
    !timestamp(lifecycle.savedAt) ||
    !timestamp(lifecycle.updatedAt)
  )
    return null;
  return {
    name: value['name'],
    lifecycle: { ...lifecycle, storageClass: 'library', savedAt: lifecycle.savedAt },
  };
}

/** Rejects corrupt history, including invalid operations in the unapplied redo suffix. */
function parseWorkspace(
  value: unknown,
  report: Report
): { workspace: VideoWorkspace; document: ReviewDocument } | null {
  if (
    !isRecord(value) ||
    'historyLength' in value ||
    'historyStart' in value ||
    (value['formatVersion'] !== 1 &&
      value['formatVersion'] !== 2 &&
      value['formatVersion'] !== 3 &&
      value['formatVersion'] !== 4) ||
    !aggregateId(value['aggregateId']) ||
    !aggregateId(value['sourceAssetId']) ||
    !revision(value['revision']) ||
    !timestamp(value['createdAt']) ||
    !timestamp(value['updatedAt']) ||
    value['updatedAt'] < value['createdAt'] ||
    !Array.isArray(value['history']) ||
    typeof value['cursor'] !== 'number' ||
    !Number.isSafeInteger(value['cursor']) ||
    value['cursor'] < 0 ||
    value['cursor'] > value['history'].length
  )
    return null;
  const hasProject = value['formatVersion'] === 3 || value['formatVersion'] === 4;
  const project = hasProject ? parseWorkspaceProject(value['project']) : undefined;
  if (project === null || (!hasProject && 'project' in value)) {
    report({ check: 'project-metadata', reason: 'invalid' });
    return null;
  }
  const complete = value['formatVersion'] === 2 || value['formatVersion'] === 4;
  const source = parseReviewSource(value['source']);
  if (!source) {
    report({ check: 'source-metadata', reason: 'invalid' });
    return null;
  }
  const completeBaseline = complete
    ? parseReviewDocumentBaseline(value['baseline'], source.duration)
    : undefined;
  if (completeBaseline === null || (!complete && 'baseline' in value)) return null;
  const admitted = parseWorkspaceHistory(value['history'], source, report);
  if (!admitted) return null;
  const parsed = parseWorkspaceDocument({
    ...admitted,
    cursor: value['cursor'],
    source,
    rawAdvanced: value['advanced'],
    ...(completeBaseline ? { completeBaseline } : {}),
    report,
  });
  if (!parsed) return null;
  const { advanced, history, cursor } = parsed;
  const effectSnapshots =
    value['effectSnapshots'] === undefined
      ? undefined
      : parseReviewAnnotationEffectSnapshots(value['effectSnapshots']);
  if (
    effectSnapshots === null ||
    !validEffectSnapshotClosure(effectSnapshots ?? [], advanced, history, source.duration)
  ) {
    report({ check: 'effect-snapshots', reason: 'invalid' });
    return null;
  }
  const workspace: VideoWorkspace = {
    aggregateId: value['aggregateId'],
    formatVersion: value['formatVersion'],
    ...(project ? { project } : {}),
    ...(completeBaseline ? { baseline: completeBaseline } : {}),
    source,
    sourceAssetId: value['sourceAssetId'],
    ...(effectSnapshots ? { effectSnapshots } : {}),
    revision: value['revision'],
    history,
    cursor,
    advanced,
    createdAt: value['createdAt'],
    updatedAt: value['updatedAt'],
  };
  if (value['typing'] !== undefined) {
    const typing = parseVideoWorkspaceTyping(value['typing'], workspace, parsed.document);
    if (!typing) return null;
    workspace.typing = typing;
  }
  return { workspace, document: parsed.document };
}

/** Admits complete history and its selected document without storage writes; rejected values retain only a bounded diagnostic. */
export function inspectVideoWorkspace(value: unknown) {
  let failure: VideoWorkspaceDiagnostic = { check: 'workspace-envelope', reason: 'invalid' };
  const admitted = parseWorkspace(value, (detail) => {
    failure = detail;
  });
  if (admitted) return { ...admitted, failure: null };
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? Math.min(value, 1_000_000)
      : undefined;
  return {
    workspace: null,
    document: null,
    failure: {
      ...failure,
      cursor: isRecord(value) ? count(value['cursor']) : undefined,
      historyLength:
        isRecord(value) && Array.isArray(value['history'])
          ? count(value['history'].length)
          : undefined,
    },
  };
}

/** Compatibility parser for callers that only need strict admission. */
export function parseVideoWorkspace(value: unknown): VideoWorkspace | null {
  return inspectVideoWorkspace(value).workspace;
}

/** Parses field recovery without promoting its text into committed annotation content. */
export function parseVideoWorkspaceDraft(
  value: unknown,
  duration: number
): VideoWorkspaceDraft | null {
  if (
    !isRecord(value) ||
    !aggregateId(value['aggregateId']) ||
    !revision(value['revision']) ||
    !timestamp(value['updatedAt'])
  )
    return null;
  const annotation = parseReviewAnnotation(value['annotation'], duration, true);
  const before = value['before'] === null ? null : parseReviewAnnotation(value['before'], duration);
  if (
    !annotation ||
    (!before && value['before'] !== null) ||
    (before && before.id !== annotation.id)
  )
    return null;
  return {
    aggregateId: value['aggregateId'],
    revision: value['revision'],
    annotation,
    before,
    updatedAt: value['updatedAt'],
  };
}

/** Prepares an append from the current mutation's fresh admitted values; it owns no durable authority. */
export function prepareCanonicalVideoWorkspaceAppend(
  previous: VideoWorkspace,
  operation: ReviewOperation,
  merged: readonly ReviewAnnotationEffectSnapshot[] | undefined,
  document: ReviewDocument
): VideoWorkspace | null {
  const history = previous.history.slice(0, previous.cursor);
  const revision = previous.revision + 1;
  const updatedAt = Math.max(Date.now(), previous.updatedAt);
  if (
    !Number.isSafeInteger(revision) ||
    !Number.isFinite(updatedAt) ||
    history.some((retained) => retained.id === operation.id)
  )
    return null;
  try {
    buildReviewTimeMap(previous.source.duration, document.edits);
  } catch {
    return null;
  }
  const candidate = pruneReviewAnnotationEffectSnapshots(
    withoutVideoWorkspaceTyping({
      ...previous,
      ...(merged ? { effectSnapshots: [...merged] } : {}),
      revision,
      updatedAt,
      cursor: history.length + 1,
      history: [...history, operation],
    })
  );
  if (
    !validEffectSnapshotClosure(
      candidate.effectSnapshots ?? [],
      candidate.advanced,
      operation.target === 'advancedContent' ? [operation] : [],
      previous.source.duration
    )
  )
    return null;
  if (operation.target === 'advancedContent')
    candidate.history[candidate.history.length - 1] =
      createReviewAdvancedContentOperation(operation) ?? operation;
  return candidate;
}
