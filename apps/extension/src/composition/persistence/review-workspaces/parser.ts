import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { replayReviewHistory } from '../../../features/video/review/document';
import {
  parseReviewAnnotation,
  parseReviewOperation,
  parseReviewSource,
} from '../../../features/video/review/validation';
import { loadQuickEditAdvancedState } from '../../../features/video/review/advanced/validation';
import type { VideoWorkspace, VideoWorkspaceDraft } from './contracts';

const revision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
const timestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const aggregateId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256;

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
  const history = [];
  const ids = new Set<string>();
  for (const raw of value['history']) {
    const operation = parseReviewOperation(raw, source.duration);
    if (!operation || ids.has(operation.id)) return null;
    ids.add(operation.id);
    history.push(operation);
  }
  try {
    replayReviewHistory(history, history.length, source);
  } catch {
    return null;
  }
  const advanced = loadQuickEditAdvancedState(value['advanced']);
  if (!advanced) return null;
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
