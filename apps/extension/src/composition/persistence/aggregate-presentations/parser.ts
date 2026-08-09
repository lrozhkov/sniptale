import type { AggregatePresentationEntry, EditableAggregateKind } from './contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAggregateKind(value: unknown): EditableAggregateKind | null {
  return value === 'image' || value === 'video-project' || value === 'scenario' ? value : null;
}

function isRevision(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0;
}

export function parseAggregatePresentationEntry(value: unknown): AggregatePresentationEntry | null {
  if (!isRecord(value)) return null;
  const aggregateKind = parseAggregateKind(value['aggregateKind']);
  const previewBlob = value['previewBlob'];
  if (
    !aggregateKind ||
    typeof value['aggregateId'] !== 'string' ||
    !isRevision(value['presentationRevision']) ||
    !(value['thumbnailBlob'] instanceof Blob) ||
    (previewBlob !== undefined && !(previewBlob instanceof Blob)) ||
    typeof value['updatedAt'] !== 'number' ||
    !Number.isFinite(value['updatedAt'])
  ) {
    return null;
  }

  return {
    aggregateId: value['aggregateId'],
    aggregateKind,
    presentationRevision: value['presentationRevision'],
    thumbnailBlob: value['thumbnailBlob'],
    updatedAt: value['updatedAt'],
    ...(previewBlob === undefined ? {} : { previewBlob }),
  };
}
