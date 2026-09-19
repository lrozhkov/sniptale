import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
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

const revision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
const timestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const aggregateId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256;

function parseWorkspaceHistory(raw: unknown[], source: ReviewSource): ReviewOperation[] | null {
  const history: ReviewOperation[] = [];
  const ids = new Set<string>();
  for (const value of raw) {
    const operation = parseReviewOperation(value, source.duration);
    if (!operation || ids.has(operation.id)) return null;
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
}): { document: ReviewDocument; advanced: QuickEditAdvancedState } | null {
  const currentAdvanced = loadQuickEditAdvancedState(args.rawAdvanced);
  const baseline = currentAdvanced
    ? reviewAdvancedContentBaseline(currentAdvanced)
    : createQuickEditAdvancedContent();
  let document: ReviewDocument;
  try {
    replayReviewHistory(args.history, args.history.length, args.source, baseline);
    document = replayReviewHistory(args.history, args.cursor, args.source, baseline);
  } catch {
    return null;
  }
  let segments;
  try {
    segments = buildReviewTimeMap(args.source.duration, document.edits);
  } catch {
    return null;
  }
  const advanced = currentAdvanced ?? loadQuickEditAdvancedState(args.rawAdvanced, segments);
  if (!advanced) return null;
  if (!currentAdvanced) {
    const migratedBaseline = reviewAdvancedContentBaseline(advanced);
    try {
      replayReviewHistory(args.history, args.history.length, args.source, migratedBaseline);
      document = replayReviewHistory(args.history, args.cursor, args.source, migratedBaseline);
    } catch {
      return null;
    }
  }
  return { document, advanced };
}

/** Rejects corrupt history, including invalid operations in the unapplied redo suffix. */
export function parseVideoWorkspace(value: unknown): VideoWorkspace | null {
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
  if (!source) return null;
  const history = parseWorkspaceHistory(value['history'], source);
  if (!history) return null;
  const parsed = parseWorkspaceDocument({
    history,
    cursor: value['cursor'],
    source,
    rawAdvanced: value['advanced'],
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
