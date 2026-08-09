import { describe, expect, it, vi } from 'vitest';
import type { AggregatePresentationEntry } from '../../../composition/persistence/aggregate-presentations/contracts';
import { appendAggregatePresentation } from './presentation';

describe('aggregate presentation backup export', () => {
  it('writes derived blobs and keeps their shared presentation revision', async () => {
    const entry: AggregatePresentationEntry = {
      aggregateId: 'image-1',
      aggregateKind: 'image',
      presentationRevision: 7,
      previewBlob: new Blob(['preview']),
      thumbnailBlob: new Blob(['thumbnail']),
      updatedAt: 100,
    };
    const file = vi.fn();

    await expect(
      appendAggregatePresentation({
        aggregateId: entry.aggregateId,
        aggregateKind: entry.aggregateKind,
        budget: { totalBytes: 0 },
        db: { get: vi.fn(async () => entry) },
        pathPrefix: 'aggregate-presentations/image/image-1',
        zip: { file },
      })
    ).resolves.toEqual({
      entry: {
        aggregateId: 'image-1',
        aggregateKind: 'image',
        presentationRevision: 7,
        updatedAt: 100,
      },
      previewPath: 'aggregate-presentations/image/image-1/presentation-preview',
      thumbnailPath: 'aggregate-presentations/image/image-1/presentation-thumbnail',
    });
    expect(file).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['malformed', { aggregateId: 'image-1', thumbnailBlob: 'not-a-blob' }],
    [
      'mismatched id',
      {
        aggregateId: 'other-image',
        aggregateKind: 'image',
        presentationRevision: 1,
        thumbnailBlob: new Blob(['thumbnail']),
        updatedAt: 100,
      },
    ],
    [
      'mismatched kind',
      {
        aggregateId: 'image-1',
        aggregateKind: 'scenario',
        presentationRevision: 1,
        thumbnailBlob: new Blob(['thumbnail']),
        updatedAt: 100,
      },
    ],
  ])('omits a %s derived row without writing backup blobs', async (_label, stored) => {
    const file = vi.fn();
    const budget = { totalBytes: 0 };

    await expect(
      appendAggregatePresentation({
        aggregateId: 'image-1',
        aggregateKind: 'image',
        budget,
        db: { get: vi.fn(async () => stored) },
        pathPrefix: 'aggregate-presentations/image/image-1',
        zip: { file },
      })
    ).resolves.toBeUndefined();

    expect(file).not.toHaveBeenCalled();
    expect(budget.totalBytes).toBe(0);
  });
});
