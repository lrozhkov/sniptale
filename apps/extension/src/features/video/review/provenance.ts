import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseReviewOperation, parseReviewSource } from './validation';
import { buildReviewTimeMap } from './timeline';
import type { ReviewEdit, ReviewSource } from './types';

/** Embedded edit provenance follows the output bytes through downloads and media backups. Times are seconds. */
export interface ReviewExportProvenance {
  format: 'sniptale.video-edit.v1';
  timeUnit: 'seconds';
  source: ReviewSource & { filename: string };
  revision: number;
  exportedAt: number;
  edits: ReviewEdit[];
  audioReencoded: boolean;
}

const maxLength = 1_048_576;

/** Unknown, malformed or future container comments never become review history or executable data. */
export function parseReviewProvenance(value: unknown): ReviewExportProvenance | null {
  if (typeof value !== 'string' || value.length > maxLength) return null;
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    !isRecord(data) ||
    data['format'] !== 'sniptale.video-edit.v1' ||
    data['timeUnit'] !== 'seconds'
  )
    return null;
  const source = parseReviewSource(data['source']);
  const filename = isRecord(data['source']) ? data['source']['filename'] : undefined;
  const revision = data['revision'];
  const exportedAt = data['exportedAt'];
  const audioReencoded = data['audioReencoded'];
  if (
    !source ||
    typeof filename !== 'string' ||
    !filename.length ||
    filename.length > 4096 ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    typeof exportedAt !== 'number' ||
    !Number.isSafeInteger(exportedAt) ||
    exportedAt < 0 ||
    typeof audioReencoded !== 'boolean' ||
    !Array.isArray(data['edits'])
  )
    return null;
  const edits: ReviewEdit[] = [];
  const ids = new Set<string>();
  const values: readonly unknown[] = data['edits'];
  for (const value of values) {
    const operation = parseReviewOperation(
      { id: 'provenance', at: 0, target: 'edit', before: null, after: value },
      source.duration
    );
    if (operation?.target !== 'edit' || !operation.after || ids.has(operation.after.id))
      return null;
    edits.push(operation.after);
    ids.add(operation.after.id);
  }
  try {
    buildReviewTimeMap(source.duration, edits);
  } catch {
    return null;
  }
  return {
    format: 'sniptale.video-edit.v1',
    timeUnit: 'seconds',
    source: { ...source, filename },
    revision,
    exportedAt,
    edits,
    audioReencoded,
  };
}

/** Refuses oversized metadata explicitly; no edit or history is silently truncated. */
export function encodeReviewProvenance(value: ReviewExportProvenance): string {
  const encoded = JSON.stringify(value);
  if (!parseReviewProvenance(encoded))
    throw new Error('Export provenance is invalid or too large.');
  return encoded;
}
