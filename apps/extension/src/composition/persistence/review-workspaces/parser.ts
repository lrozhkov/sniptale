import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  ReviewHistoryError,
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import { createQuickEditAdvancedContent } from '../../../features/video/review/advanced/defaults';
import { buildReviewTimeMap } from '../../../features/video/review/timeline';
import {
  parseReviewAnnotation,
  parseReviewOperation,
  parseReviewSource,
} from '../../../features/video/review/validation';
import { loadQuickEditAdvancedState } from '../../../features/video/review/advanced/validation';
import type {
  ReviewDocument,
  ReviewOperation,
  ReviewSource,
} from '../../../features/video/review/types';
import type { QuickEditAdvancedState } from '../../../features/video/review/advanced/types';
import type { VideoWorkspace, VideoWorkspaceDraft } from './contracts';

/** Safe parser location and invariant codes; no retained document values. */
export type VideoWorkspaceDiagnostic = {
  check:
    | 'workspace-envelope'
    | 'source-metadata'
    | 'history-operation'
    | 'history-replay'
    | 'advanced-state'
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
): ReviewOperation[] | null {
  const history: ReviewOperation[] = [];
  const ids = new Set<string>();
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
    history.push(operation);
  }
  return history;
}

/** Replays current and legacy baselines, returning only a fixed-point workspace state. */
function parseWorkspaceDocument(args: {
  history: readonly ReviewOperation[];
  cursor: number;
  source: ReviewSource;
  rawAdvanced: unknown;
  report: Report;
}): { document: ReviewDocument; advanced: QuickEditAdvancedState } | null {
  const currentAdvanced = loadQuickEditAdvancedState(args.rawAdvanced);
  const baseline = currentAdvanced
    ? reviewAdvancedContentBaseline(currentAdvanced)
    : createQuickEditAdvancedContent();
  let document: ReviewDocument;
  try {
    replayReviewHistory(args.history, args.history.length, args.source, baseline);
    document = replayReviewHistory(args.history, args.cursor, args.source, baseline);
  } catch (error) {
    args.report(replayFailure(error));
    return null;
  }
  let segments;
  try {
    segments = buildReviewTimeMap(args.source.duration, document.edits);
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
      replayReviewHistory(args.history, args.history.length, args.source, migratedBaseline);
      document = replayReviewHistory(args.history, args.cursor, args.source, migratedBaseline);
    } catch (error) {
      args.report(replayFailure(error));
      return null;
    }
  }
  return { document, advanced };
}

/** Rejects corrupt history, including invalid operations in the unapplied redo suffix. */
function parseWorkspace(value: unknown, report: Report): VideoWorkspace | null {
  if (
    !isRecord(value) ||
    value['formatVersion'] !== 1 ||
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
  const source = parseReviewSource(value['source']);
  if (!source) {
    report({ check: 'source-metadata', reason: 'invalid' });
    return null;
  }
  const history = parseWorkspaceHistory(value['history'], source, report);
  if (!history) return null;
  const parsed = parseWorkspaceDocument({
    history,
    cursor: value['cursor'],
    source,
    rawAdvanced: value['advanced'],
    report,
  });
  if (!parsed) return null;
  const { advanced } = parsed;
  return {
    aggregateId: value['aggregateId'],
    formatVersion: 1,
    source,
    sourceAssetId: value['sourceAssetId'],
    revision: value['revision'],
    history,
    cursor: value['cursor'],
    advanced,
    createdAt: value['createdAt'],
    updatedAt: value['updatedAt'],
  };
}

/** Parses without repairing data, retaining a bounded diagnostic for rejected workspaces. */
export function inspectVideoWorkspace(value: unknown) {
  let failure: VideoWorkspaceDiagnostic = { check: 'workspace-envelope', reason: 'invalid' };
  const workspace = parseWorkspace(value, (detail) => {
    failure = detail;
  });
  if (workspace) return { workspace, failure: null };
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? Math.min(value, 1_000_000)
      : undefined;
  return {
    workspace: null,
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
