import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  abortSession: vi.fn(),
  beginRoot: vi.fn(),
  openReader: vi.fn(),
  readSession: vi.fn(),
  stage: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('../../../composition/archive-transfer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/archive-transfer')>()),
  openArchiveReader: mocks.openReader,
}));
vi.mock('../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/assets')>()),
  abortArchiveRestoreSession: mocks.abortSession,
  beginArchiveRestoreRoot: mocks.beginRoot,
  readArchiveRestoreSession: mocks.readSession,
}));
vi.mock('./restore-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./restore-session')>()),
  verifyMediaHubRestoreResume: mocks.verify,
}));
vi.mock('./staging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./staging')>()),
  stageArchiveRootObjects: mocks.stage,
}));

import type { ArchiveRestoreSession } from '../../../composition/persistence/assets';
import { restoreMediaHubBackupV6 } from './restore';

const catalogPath = '_sniptale/catalog/media-000001.ndjson';
const descriptor = {
  mediaSubtype: 'library-item' as const,
  metadataPath: '_sniptale/metadata/media/declared.json',
  objectCount: 0,
  rootId: 'declared',
  rootKind: 'media' as const,
  totalBytes: 0,
};

function session(strategy: 'replace' | 'skip'): ArchiveRestoreSession {
  return {
    archiveFingerprint: 'a'.repeat(64),
    childIdMap: {},
    committedRoots: [],
    conflictedRoots: [],
    createdAt: 1,
    currentRoot: null,
    kind: 'archive-restore-session',
    operationId: 'restore-identity',
    rootIdMap: {},
    skippedRoots: [],
    status: 'pending',
    strategy,
    updatedAt: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.abortSession.mockResolvedValue(undefined);
  mocks.openReader.mockResolvedValue({
    close: vi.fn(),
    entry: (path: string) => {
      if (path === catalogPath) {
        return { text: async () => `${JSON.stringify(descriptor)}\n` };
      }
      if (path === descriptor.metadataPath) {
        return {
          text: async () =>
            JSON.stringify({
              descriptor,
              metadata: {
                entry: { id: 'other', source: { kind: 'screenshot' }, tags: [] },
                originalObjectId: 'unused',
              },
              objects: [],
            }),
        };
      }
      return undefined;
    },
  });
});

it.each(['skip', 'replace'] as const)(
  'revalidates descriptor identity before %s publication authority',
  async (strategy) => {
    const activeSession = session(strategy);
    mocks.verify.mockResolvedValue({
      inspection: { manifest: { catalogs: [{ path: catalogPath, rootKind: 'media' }] } },
      session: activeSession,
    });
    mocks.beginRoot.mockResolvedValue({
      ...activeSession,
      currentRoot: 'media:library-item:declared',
    });
    mocks.readSession.mockResolvedValue(activeSession);
    const publisher = {
      checkpointSkipIfExisting: vi.fn(),
      profile: 'media:library-item',
      publish: vi.fn(),
    };

    await expect(
      restoreMediaHubBackupV6({
        file: new Blob(),
        operationId: activeSession.operationId,
        publishers: [publisher],
      })
    ).rejects.toThrow('metadata identity does not match its descriptor');

    expect(publisher.checkpointSkipIfExisting).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(mocks.stage).not.toHaveBeenCalled();
  }
);
