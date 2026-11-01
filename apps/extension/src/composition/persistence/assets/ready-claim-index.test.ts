import { expect, it, vi } from 'vitest';
import { createHarness, MemoryFileHandle } from './opfs-store.test-support';
import type { AssetReadyJournal } from './contracts';
import {
  beginReadyClaimPublication,
  finishReadyClaimPublication,
  prepareReadyClaimIndex,
  readTargetReadyClaims,
  readTargetReadyMediaClaims,
  removeReadyJournalClaims,
} from './ready-claim-index';

async function write(directory: FileSystemDirectoryHandle, name: string, value: string) {
  const stream = await (await directory.getFileHandle(name, { create: true })).createWritable();
  await stream.write(value);
  await stream.close();
}
async function fixture() {
  const harness = createHarness();
  const root = await (
    await harness.options.getOriginRoot()
  ).getDirectoryHandle('sniptale-assets', { create: true });
  const ready = await root.getDirectoryHandle('ready', { create: true });
  return { root, ready };
}
function journal(id = 'prepared'): AssetReadyJournal {
  return {
    journalId: id,
    domain: 'image-workspace',
    createdAt: 1,
    assetRefs: [
      {
        assetId: 'new',
        createdAt: 1,
        mimeType: 'image/png',
        size: 3,
        sha256: null,
        location: { kind: 'opfs', objectKey: 'objects/new' },
      },
    ],
    payload: {
      refs: [{ assetId: 'shared-image' }],
      children: {
        assetPuts: [{ assetId: 'shared-child' }],
        editorDocumentPuts: [{ assetRefs: [{ assetId: 'shared-document' }] }],
      },
    },
  };
}
async function publish(
  root: FileSystemDirectoryHandle,
  ready: FileSystemDirectoryHandle,
  value: AssetReadyJournal
) {
  const complete = await beginReadyClaimPublication(root, value, false);
  await write(ready, value.journalId, JSON.stringify(value));
  if (complete) await finishReadyClaimPublication(root);
}

it('looks up nested shared claims without enumerating unrelated ready journals or manifests', async () => {
  const f = await fixture();
  await prepareReadyClaimIndex(f.root, f.ready);
  await publish(f.root, f.ready, journal());
  const index = await f.root.getDirectoryHandle('ready-claims-v1');
  const manifests = await index.getDirectoryHandle('journals');
  vi.spyOn(f.ready, 'entries').mockImplementation(() => {
    throw new Error('Global ready scan forbidden');
  });
  vi.spyOn(manifests, 'entries').mockImplementation(() => {
    throw new Error('Global manifest scan forbidden');
  });
  const result = await readTargetReadyClaims(f.root, f.ready, [
    'new',
    'shared-image',
    'shared-child',
    'shared-document',
    'unrelated',
  ]);
  expect(result.valid).toBe(true);
  expect(result.assetIds).toEqual(
    new Set(['new', 'shared-image', 'shared-child', 'shared-document'])
  );
  expect(result.journals).toEqual([journal()]);
});

it('retains shared ready claims after partial publication and restart until cleanup retries', async () => {
  const f = await fixture();
  await prepareReadyClaimIndex(f.root, f.ready);
  const index = await f.root.getDirectoryHandle('ready-claims-v1');
  const assets = await index.getDirectoryHandle('assets', { create: true });
  const fault = vi
    .spyOn(assets, 'getDirectoryHandle')
    .mockRejectedValueOnce(new DOMException('injected alias failure', 'QuotaExceededError'));
  await expect(beginReadyClaimPublication(f.root, journal(), false)).rejects.toThrow(
    'injected alias failure'
  );
  expect((await readTargetReadyClaims(f.root, f.ready, ['shared-image'])).valid).toBe(false);
  fault.mockRestore();
  // No disposable process state participates in restart recovery.
  await prepareReadyClaimIndex(f.root, f.ready);
  const rebuilt = await readTargetReadyClaims(f.root, f.ready, ['shared-image', 'shared-document']);
  expect(rebuilt).toMatchObject({
    valid: true,
    assetIds: new Set(['shared-image', 'shared-document']),
    journals: [],
  });
  const manifestDirectory = await index.getDirectoryHandle('journals');
  const unlink = vi
    .spyOn(manifestDirectory, 'removeEntry')
    .mockRejectedValueOnce(
      new DOMException('injected cleanup failure', 'NoModificationAllowedError')
    );
  await expect(removeReadyJournalClaims(f.root, 'prepared')).rejects.toThrow(
    'injected cleanup failure'
  );
  unlink.mockRestore();
  await removeReadyJournalClaims(f.root, 'prepared');
  expect((await readTargetReadyClaims(f.root, f.ready, ['shared-image'])).assetIds.size).toBe(0);
});

it('refuses malformed legacy journals before completeness or destructive admission', async () => {
  const f = await fixture();
  await write(f.ready, 'unknown', JSON.stringify({ journalId: 'unknown', futurePayload: true }));
  await expect(prepareReadyClaimIndex(f.root, f.ready)).rejects.toThrow(
    'Invalid legacy ready journal binding'
  );
  expect((await readTargetReadyClaims(f.root, f.ready, ['target'])).valid).toBe(false);
});

it('backfills legacy journals while preserving zero-byte uncommitted handles', async () => {
  const f = await fixture();
  await f.ready.getFileHandle('uncommitted', { create: true });
  await write(f.ready, 'prepared', JSON.stringify(journal()));
  await prepareReadyClaimIndex(f.root, f.ready);
  expect(
    (await readTargetReadyClaims(f.root, f.ready, ['shared-child'])).assetIds.has('shared-child')
  ).toBe(true);
});

it('preserves previous manifest claims when the same journal is retried with additional refs', async () => {
  const f = await fixture();
  await prepareReadyClaimIndex(f.root, f.ready);
  await publish(f.root, f.ready, journal());
  await publish(f.root, f.ready, { ...journal(), payload: { refs: [{ assetId: 'later' }] } });
  expect(
    (await readTargetReadyClaims(f.root, f.ready, ['later', 'shared-image'])).assetIds
  ).toEqual(new Set(['later', 'shared-image']));
  await f.ready.removeEntry('prepared');
  await removeReadyJournalClaims(f.root, 'prepared');
  expect(
    (await readTargetReadyClaims(f.root, f.ready, ['later', 'shared-image'])).assetIds.size
  ).toBe(0);
});

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

it('selects related parent and private source journals without reading unrelated journals', async () => {
  const f = await fixture();
  await prepareReadyClaimIndex(f.root, f.ready);
  const related = {
    ...journal('related-export'),
    domain: 'project-exports',
    payload: { entry: { id: 'export', projectId: 'parent' } },
  };
  const privateSource = {
    ...journal('private-source'),
    domain: 'project-assets',
    payload: { entry: { id: 'private' } },
  };
  await publish(f.root, f.ready, related);
  await publish(f.root, f.ready, privateSource);
  await publish(f.root, f.ready, {
    ...related,
    journalId: 'unrelated',
    payload: { entry: { id: 'other-export', projectId: 'other-parent' } },
  });
  const index = await f.root.getDirectoryHandle('ready-claims-v1');
  const manifests = await index.getDirectoryHandle('journals');
  vi.spyOn(f.ready, 'entries').mockImplementation(() => {
    throw new Error('Global ready scan forbidden');
  });
  vi.spyOn(manifests, 'entries').mockImplementation(() => {
    throw new Error('Global manifest scan forbidden');
  });
  const reads = vi.spyOn(f.ready, 'getFileHandle');
  const result = await readTargetReadyMediaClaims(f.root, f.ready, {
    id: 'parent',
    projectAssetIds: ['private'],
  });
  expect(result).toMatchObject({ valid: true, pending: true });
  expect(new Set(result.journals.map((entry) => entry.journalId))).toEqual(
    new Set(['related-export', 'private-source'])
  );
  expect(reads.mock.calls.some(([name]) => name === 'unrelated')).toBe(false);
  expect(
    await readTargetReadyMediaClaims(f.root, f.ready, { id: 'absent', projectAssetIds: [] })
  ).toEqual({ valid: true, pending: false, journals: [] });
});

it('retains a pending sync image with no Library row or supplied source identity', async () => {
  const f = await fixture();
  await prepareReadyClaimIndex(f.root, f.ready);
  const value = {
    ...journal(),
    domain: 'sync-replica',
    payload: { kind: 'image', input: { media: { id: 'missing-row' } } },
  };
  await publish(f.root, f.ready, value);
  expect(await readTargetReadyMediaClaims(f.root, f.ready, { id: 'missing-row' })).toEqual({
    valid: true,
    pending: true,
    journals: [value],
  });
});

it.each(['1', '2'])(
  'refuses physical-only capability %s until explicit logical preparation',
  async (capability) => {
    const f = await fixture();
    const index = await f.root.getDirectoryHandle('ready-claims-v1', { create: true });
    await write(index, 'complete', capability);
    const value = {
      ...journal(),
      domain: 'project-exports',
      payload: { entry: { id: 'export', projectId: 'parent' } },
    };
    await write(f.ready, value.journalId, JSON.stringify(value));
    const globalRead = vi.spyOn(f.ready, 'entries');
    expect(
      (await readTargetReadyMediaClaims(f.root, f.ready, { id: 'parent', projectAssetIds: [] }))
        .valid
    ).toBe(false);
    expect((await readTargetReadyClaims(f.root, f.ready, ['new'])).valid).toBe(false);
    expect(globalRead).not.toHaveBeenCalled();
    await prepareReadyClaimIndex(f.root, f.ready);
    expect(
      await readTargetReadyMediaClaims(f.root, f.ready, { id: 'parent', projectAssetIds: [] })
    ).toEqual({ valid: true, pending: true, journals: [value] });
    expect((await readTargetReadyClaims(f.root, f.ready, ['new'])).assetIds).toEqual(
      new Set(['new'])
    );
  }
);

it('upgrades orphan physical-only manifests to unknown logical claims until cleanup retries', async () => {
  const f = await fixture();
  const index = await f.root.getDirectoryHandle('ready-claims-v1', { create: true });
  const manifests = await index.getDirectoryHandle('journals', { create: true });
  await write(index, 'complete', '2');
  await write(
    manifests,
    await hash('orphan'),
    JSON.stringify({ version: 1, journalId: 'orphan', assetIds: ['orphan-bytes'] })
  );
  await prepareReadyClaimIndex(f.root, f.ready);
  expect(await readTargetReadyMediaClaims(f.root, f.ready, { id: 'any-root' })).toEqual({
    valid: true,
    pending: true,
    journals: [],
  });
  expect((await readTargetReadyClaims(f.root, f.ready, ['orphan-bytes'])).assetIds).toEqual(
    new Set(['orphan-bytes'])
  );
  await removeReadyJournalClaims(f.root, 'orphan');
  expect(await readTargetReadyMediaClaims(f.root, f.ready, { id: 'any-root' })).toEqual({
    valid: true,
    pending: false,
    journals: [],
  });
  expect((await readTargetReadyClaims(f.root, f.ready, ['orphan-bytes'])).assetIds.size).toBe(0);
});

it('recovers physical and logical claims after partial logical publication and cleanup failure', async () => {
  const f = await fixture();
  await prepareReadyClaimIndex(f.root, f.ready);
  const index = await f.root.getDirectoryHandle('ready-claims-v1');
  const media = await index.getDirectoryHandle('media', { create: true });
  const value = { ...journal(), payload: { aggregateId: 'root', refs: [{ assetId: 'shared' }] } };
  const fault = vi
    .spyOn(media, 'getDirectoryHandle')
    .mockRejectedValueOnce(new DOMException('logical alias failed', 'QuotaExceededError'));
  await expect(beginReadyClaimPublication(f.root, value, false)).rejects.toThrow(
    'logical alias failed'
  );
  expect((await readTargetReadyMediaClaims(f.root, f.ready, { id: 'root' })).valid).toBe(false);
  expect((await readTargetReadyClaims(f.root, f.ready, ['shared'])).valid).toBe(false);
  fault.mockRestore();
  // Recovery uses persisted manifests without a process-local claim cache.
  await prepareReadyClaimIndex(f.root, f.ready);
  expect(await readTargetReadyMediaClaims(f.root, f.ready, { id: 'root' })).toEqual({
    valid: true,
    pending: true,
    journals: [],
  });
  expect((await readTargetReadyClaims(f.root, f.ready, ['shared'])).assetIds).toEqual(
    new Set(['shared'])
  );
  const rootClaims = await media.getDirectoryHandle(await hash('media:root'));
  const cleanup = vi
    .spyOn(rootClaims, 'removeEntry')
    .mockRejectedValueOnce(
      new DOMException('logical cleanup failed', 'NoModificationAllowedError')
    );
  await expect(removeReadyJournalClaims(f.root, value.journalId)).rejects.toThrow(
    'logical cleanup failed'
  );
  expect(await readTargetReadyMediaClaims(f.root, f.ready, { id: 'root' })).toEqual({
    valid: true,
    pending: true,
    journals: [],
  });
  cleanup.mockRestore();
  await prepareReadyClaimIndex(f.root, f.ready);
  await removeReadyJournalClaims(f.root, value.journalId);
  expect(await readTargetReadyMediaClaims(f.root, f.ready, { id: 'root' })).toEqual({
    valid: true,
    pending: false,
    journals: [],
  });
  expect((await readTargetReadyClaims(f.root, f.ready, ['shared'])).assetIds.size).toBe(0);
});

it('upgrades a legacy manifest from its journal instead of trusting legacy logical absence', async () => {
  const f = await fixture();
  const index = await f.root.getDirectoryHandle('ready-claims-v1', { create: true });
  const manifests = await index.getDirectoryHandle('journals', { create: true });
  const value = {
    ...journal(),
    domain: 'project-exports',
    payload: { entry: { id: 'export', projectId: 'parent' } },
  };
  await write(index, 'complete', '2');
  await write(
    manifests,
    await hash(value.journalId),
    JSON.stringify({
      version: 1,
      journalId: value.journalId,
      assetIds: ['previous-bytes'],
      mediaKeys: [],
    })
  );
  await write(f.ready, value.journalId, JSON.stringify(value));
  await prepareReadyClaimIndex(f.root, f.ready);
  expect(
    await readTargetReadyMediaClaims(f.root, f.ready, { id: 'parent', projectAssetIds: [] })
  ).toEqual({ valid: true, pending: true, journals: [value] });
  expect(
    (await readTargetReadyClaims(f.root, f.ready, ['previous-bytes', 'new'])).assetIds
  ).toEqual(new Set(['previous-bytes', 'new']));
});

it('refuses a logical alias whose manifest omits the current owner', async () => {
  const f = await fixture();
  await prepareReadyClaimIndex(f.root, f.ready);
  const value = {
    ...journal(),
    domain: 'project-exports',
    payload: { entry: { id: 'export', projectId: 'parent' } },
  };
  await publish(f.root, f.ready, value);
  const index = await f.root.getDirectoryHandle('ready-claims-v1');
  const manifests = await index.getDirectoryHandle('journals');
  await write(
    manifests,
    await hash(value.journalId),
    JSON.stringify({
      version: 1,
      projectionVersion: 3,
      journalId: value.journalId,
      assetIds: ['new'],
      mediaKeys: ['project-export:export'],
    })
  );
  expect(
    await readTargetReadyMediaClaims(f.root, f.ready, { id: 'parent', projectAssetIds: [] })
  ).toEqual({ valid: false, pending: true, journals: [] });
});

it('retains unknown parent and private source families while excluding unrelated known owners', async () => {
  const f = await fixture();
  await prepareReadyClaimIndex(f.root, f.ready);
  const exportValue = {
    ...journal('unknown-parent'),
    domain: 'project-exports',
    payload: { entry: { id: 'export' } },
  };
  const sourceValue = {
    ...journal('unknown-private'),
    domain: 'project-assets',
    payload: { entry: {} },
  };
  await publish(f.root, f.ready, exportValue);
  await publish(f.root, f.ready, sourceValue);
  const result = await readTargetReadyMediaClaims(f.root, f.ready, {
    id: 'any-parent',
    projectAssetIds: [],
  });
  expect(result).toMatchObject({ valid: true, pending: true });
  expect(new Set(result.journals.map((value) => value.journalId))).toEqual(
    new Set(['unknown-parent', 'unknown-private'])
  );
});

it('cannot publish logical absence for a legacy journal with a malformed owner payload', async () => {
  const f = await fixture();
  const value = { ...journal(), domain: 'project-exports', payload: null };
  await write(f.ready, value.journalId, JSON.stringify(value));
  await prepareReadyClaimIndex(f.root, f.ready);
  expect(
    await readTargetReadyMediaClaims(f.root, f.ready, { id: 'parent', projectAssetIds: [] })
  ).toEqual({ valid: true, pending: true, journals: [value] });
});

it('retains both old and new logical identities when a publication is retried', async () => {
  const f = await fixture();
  await prepareReadyClaimIndex(f.root, f.ready);
  await publish(f.root, f.ready, { ...journal(), payload: { aggregateId: 'old-root' } });
  const next = { ...journal(), payload: { aggregateId: 'next-root' } };
  await publish(f.root, f.ready, next);
  for (const id of ['old-root', 'next-root']) {
    expect(await readTargetReadyMediaClaims(f.root, f.ready, { id })).toEqual({
      valid: true,
      pending: true,
      journals: [next],
    });
  }
  await f.ready.removeEntry(next.journalId);
  await removeReadyJournalClaims(f.root, next.journalId);
  for (const id of ['old-root', 'next-root']) {
    expect(await readTargetReadyMediaClaims(f.root, f.ready, { id })).toEqual({
      valid: true,
      pending: false,
      journals: [],
    });
  }
});

it('preserves the original publication error when abort also fails', async () => {
  const f = await fixture();
  const index = await f.root.getDirectoryHandle('ready-claims-v1', { create: true });
  const marker = await index.getFileHandle('complete', { create: true });
  if (!(marker instanceof MemoryFileHandle)) throw new Error('Missing memory file fixture.');
  const original = new DOMException('marker write failed', 'QuotaExceededError');
  const cleanup = new DOMException('abort failed', 'NoModificationAllowedError');
  marker.writeEffect = async () => {
    throw original;
  };
  marker.abortEffect = async () => {
    throw cleanup;
  };
  await expect(finishReadyClaimPublication(f.root)).rejects.toMatchObject({
    cause: original,
    errors: [original, cleanup],
  });
  expect((await readTargetReadyClaims(f.root, f.ready, ['new'])).valid).toBe(false);
});
