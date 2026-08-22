import { expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { putImageWorkspaceBackupRestore } from './backup-restore';
import type { StoredImageWorkspaceEntry } from './contracts';

it('publishes every editor document role and the workspace through caller stores', async () => {
  const ref = {
    assetId: 'source',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/source' },
    mimeType: 'image/png',
    sha256: null,
    size: 1,
  };
  const ownerPut = vi.fn();
  const refPut = vi.fn();
  const workspacePut = vi.fn();
  const entry = {
    aggregateId: 'image',
    createdAt: 1,
    document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'source'),
    revision: 1,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 1,
  } satisfies StoredImageWorkspaceEntry;
  await putImageWorkspaceBackupRestore({
    entry,
    ownerStore: { put: ownerPut },
    refsByAssetId: new Map([['source', ref]]),
    refStore: { put: refPut },
    workspaceStore: { put: workspacePut },
  });
  expect(refPut).toHaveBeenCalledWith(ref);
  expect(ownerPut).toHaveBeenCalledWith({
    assetId: 'source',
    ownerId: 'image',
    ownerKind: 'image-workspace',
    role: 'source-image',
  });
  expect(workspacePut).toHaveBeenCalledWith(entry);
});

it('rejects a workspace before publication when an editor asset ref is missing', async () => {
  const entry = {
    aggregateId: 'image',
    createdAt: 1,
    document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'source'),
    revision: 1,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 1,
  } satisfies StoredImageWorkspaceEntry;
  const workspacePut = vi.fn();

  await expect(
    putImageWorkspaceBackupRestore({
      entry,
      ownerStore: { put: vi.fn() },
      refsByAssetId: new Map(),
      refStore: { put: vi.fn() },
      workspaceStore: { put: workspacePut },
    })
  ).rejects.toThrow('Restored editor asset ref is missing: source.');
  expect(workspacePut).not.toHaveBeenCalled();
});
