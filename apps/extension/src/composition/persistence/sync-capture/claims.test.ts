import { expect, it } from 'vitest';
import { createMediaLibraryEntry } from '../projects/index.test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { captureRootKey } from './contracts';
import { hashCaptureText } from './guards';
import { collectSyncCaptureClaims } from './claims';

it('retains native image document assets until prepared claims replace them', () => {
  const ref = {
    assetId: 'document',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/document' },
    mimeType: 'image/png',
    size: 8,
    sha256: null,
  };
  const media = createMediaLibraryEntry({
    id: 'image',
    kind: 'screenshot',
    source: { kind: 'screenshot' },
    blob: new Blob(['original'], { type: 'image/png' }),
    size: 8,
    mimeType: 'image/png',
    workspaceRevision: 1,
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
  });
  const native = createNativeCapture({
    version: 1,
    kind: 'sync-operation',
    key: 'native',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 1,
    rootKind: 'media',
    rootId: media.id,
    rootKey: captureRootKey('space', 'media', media.id),
    generation: 1,
    operationId: 'operation',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: {
      kind: 'image',
      rows: {
        media,
        refs: [ref],
        presentation: null,
        workspace: {
          aggregateId: media.id,
          createdAt: 1,
          updatedAt: 1,
          revision: 1,
          sourceTitle: null,
          sourceUrl: null,
          document: createPersistedEditorDocumentFixture(
            createEditorDocumentFixture(),
            ref.assetId
          ),
        },
      },
    },
  });
  expect(collectSyncCaptureClaims([native])).toEqual({
    valid: true,
    assetIds: new Set(['document']),
  });
  const { change: _nativeRows, phase: _nativePhase, ...header } = native;
  const prepared = {
    ...header,
    phase: 'prepared',
    prepared: {
      recordText: '{}',
      recordSha256: hashCaptureText('{}'),
      objects: [
        {
          objectId: 'object',
          ref: {
            ...ref,
            assetId: 'transport',
            location: { kind: 'opfs', objectKey: 'objects/transport' },
          },
          sha256: 'b'.repeat(64),
          filename: 'image.png',
        },
      ],
    },
  };
  expect(collectSyncCaptureClaims([prepared])).toEqual({
    valid: true,
    assetIds: new Set(['transport']),
  });
  expect(collectSyncCaptureClaims([{ ...native, change: { kind: 'image', rows: {} } }]).valid).toBe(
    false
  );
});
