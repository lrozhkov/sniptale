import { describe, expect, it } from 'vitest';
import type { AggregatePresentationBackupDescriptor } from '../contracts/types';
import { materializeAggregatePresentation } from './presentation';

function createDescriptor(): AggregatePresentationBackupDescriptor {
  return {
    entry: {
      aggregateId: 'source-image',
      aggregateKind: 'image',
      presentationRevision: 4,
      updatedAt: 100,
    },
    previewPath: 'aggregate-presentations/image/source-image/presentation-preview',
    thumbnailPath: 'aggregate-presentations/image/source-image/presentation-thumbnail',
  };
}

function createArchive(paths: Record<string, Blob | Error>) {
  return {
    file(path: string) {
      const value = paths[path];
      if (!value) return null;
      return {
        async: async () => {
          if (value instanceof Error) throw value;
          return value;
        },
      };
    },
  };
}

describe('aggregate presentation backup restore', () => {
  it('materializes a valid presentation and remaps the aggregate id', async () => {
    const sourceDescriptor = createDescriptor();
    const descriptor = {
      ...sourceDescriptor,
      entry: { ...sourceDescriptor.entry, aggregateId: 'imported-image' },
    };

    await expect(
      materializeAggregatePresentation({
        descriptor,
        ref: { id: 'imported-image', kind: 'image' },
        zip: createArchive({
          [descriptor.previewPath!]: new Blob(['preview']),
          [descriptor.thumbnailPath]: new Blob(['thumbnail']),
        }),
      })
    ).resolves.toMatchObject({
      aggregateId: 'imported-image',
      aggregateKind: 'image',
      presentationRevision: 4,
    });
  });

  it('fails soft when a derived blob is missing or unreadable', async () => {
    const descriptor = createDescriptor();

    await expect(
      materializeAggregatePresentation({
        descriptor,
        ref: { id: 'source-image', kind: 'image' },
        zip: createArchive({ [descriptor.thumbnailPath]: new Blob(['thumbnail']) }),
      })
    ).resolves.toBeNull();
    await expect(
      materializeAggregatePresentation({
        descriptor,
        ref: { id: 'source-image', kind: 'image' },
        zip: createArchive({
          [descriptor.previewPath!]: new Error('corrupt'),
          [descriptor.thumbnailPath]: new Blob(['thumbnail']),
        }),
      })
    ).resolves.toBeNull();
  });
});
