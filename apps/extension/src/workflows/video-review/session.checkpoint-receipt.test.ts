import { expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type { SyncCheckpointReceipt } from '../../composition/persistence/sync-capture/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/parser';
import { parseReviewOperation } from '../../features/video/review/validation';
import type { ReviewSessionPersistence } from './session-types';
import { projectReviewWorkspace } from './session-durable-access';
import { createVideoReviewSession } from './session';

const id = 'recording:receipt';
const token = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const receipt = (index: number): SyncCheckpointReceipt => ({
  rootKind: 'video-review',
  rootId: id,
  revision: token(index),
});
const operation = {
  id: 'annotation-op',
  at: 1,
  target: 'annotation' as const,
  before: null,
  after: { id: 'note', text: 'Saved', anchor: { kind: 'point' as const, time: 1 } },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(projection?: 'outer' | 'nested') {
  let stored: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: id,
      sourceAssetId: 'source',
      formatVersion: 1,
      revision: 1,
      source: { duration: 4, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      advanced: createQuickEditAdvancedState(),
      history: [],
      cursor: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  let serial = 1;
  let omit = false;
  const acknowledge = () => {
    stored = {
      ...stored,
      workspace: { ...stored.workspace, revision: stored.workspace.revision + 1 },
    };
    serial += 1;
    return { ...structuredClone(stored), ...(omit ? {} : { checkpointReceipt: receipt(serial) }) };
  };
  const read = vi.fn(async () => structuredClone(stored));
  const save = vi.fn(async () => acknowledge());
  const saveSnapshot = vi.fn(
    async (args: Parameters<ReviewSessionPersistence['saveVideoWorkspaceSnapshot']>[0]) => {
      const workspace = parseVideoWorkspace(args.workspace);
      if (!workspace) throw new Error('Invalid fixture workspace.');
      const draft =
        args.draft === null
          ? null
          : parseVideoWorkspaceDraft(args.draft, workspace.source.duration);
      if (args.draft !== null && !draft) throw new Error('Invalid fixture draft.');
      stored = { workspace, draft };
      return acknowledge();
    }
  );
  const commit = vi.fn(
    async (args: Parameters<ReviewSessionPersistence['commitVideoWorkspace']>[0]) => {
      const parsed = parseReviewOperation(args.operation, stored.workspace.source.duration);
      if (!parsed) throw new Error('Invalid fixture operation.');
      stored = {
        ...stored,
        workspace: {
          ...stored.workspace,
          history: [...stored.workspace.history.slice(0, stored.workspace.cursor), parsed],
          cursor: stored.workspace.cursor + 1,
        },
      };
      return acknowledge();
    }
  );
  const projected = vi.fn(
    async (args: Parameters<ReviewSessionPersistence['commitVideoWorkspace']>[0]) => {
      const committed = await commit(args);
      const { checkpointReceipt, ...clean } = committed;
      return {
        snapshot: projection === 'nested' ? committed : clean,
        document: projectReviewWorkspace(clean),
        ...(projection === 'outer' && checkpointReceipt ? { checkpointReceipt } : {}),
      };
    }
  );
  const deps = {
    acquireSyncCheckpointEdit: async () => ({ release: async () => undefined }),
    readVideoWorkspace: read,
    saveVideoWorkspaceDraft: save,
    saveVideoWorkspaceAdvanced: save,
    saveVideoWorkspaceSnapshot: saveSnapshot,
    moveVideoWorkspaceHistory: save,
    commitVideoWorkspace: commit,
    ...(projection ? { commitVideoWorkspaceWithProjection: projected } : {}),
  } satisfies ReviewSessionPersistence;
  const initial = { ...structuredClone(stored), checkpointReceipt: receipt(1) };
  const session = createVideoReviewSession(initial, deps);
  return {
    session,
    deps,
    initial,
    read,
    save,
    saveSnapshot,
    commit,
    projected,
    acknowledge,
    omit: () => {
      omit = true;
    },
  };
}

it('separates a coherent initial-open receipt from canonical state and returns a fresh exact DTO', async () => {
  const f = fixture();
  expect(f.session.getCheckpointExitReceipt()).toEqual(receipt(1));
  const dto = f.session.getCheckpointExitReceipt()!;
  dto.revision = token(99);
  expect(f.session.getCheckpointExitReceipt()).toEqual(receipt(1));
  expect(f.session.getSnapshot().snapshot).not.toHaveProperty('checkpointReceipt');
  expect(JSON.stringify(f.session.getSnapshot())).not.toContain('checkpointReceipt');
  await f.session.saveBuffered();
  expect(f.saveSnapshot).not.toHaveBeenCalled();
  expect(f.session.getCheckpointExitReceipt()).toEqual(receipt(1));
  await f.session.dispose();
});

it.each(['outer', 'nested'] as const)(
  'consumes %s projection metadata without changing snapshot or document semantics',
  async (projection) => {
    const f = fixture(projection);
    const saved = await f.session.commit(operation);
    expect(saved).not.toHaveProperty('checkpointReceipt');
    expect(f.session.getCheckpointExitReceipt()).toEqual(receipt(2));
    expect(JSON.stringify(f.session.getSnapshot())).not.toContain('checkpointReceipt');
    expect(f.session.getSnapshot().snapshot).toEqual(await f.read());
    expect(f.session.getSnapshot().document.annotations).toEqual([operation.after]);
    await f.session.dispose();
  }
);

it('consumes plain native ACK metadata and clears authority on a later legacy ACK omission', async () => {
  const f = fixture();
  expect(await f.session.saveDraft(null, null)).not.toHaveProperty('checkpointReceipt');
  expect(f.session.getCheckpointExitReceipt()).toEqual(receipt(2));
  f.omit();
  await f.session.saveDraft(null, null);
  expect(f.session.getCheckpointExitReceipt()).toBeNull();
  expect(f.session.getSnapshot().snapshot).toEqual(await f.read());
  await f.session.dispose();
});

it('does not expose an old receipt while a newer native ACK is pending and retains the latest queued ACK', async () => {
  const f = fixture();
  const entered = deferred<void>();
  const ack = deferred<VideoWorkspaceSnapshot>();
  f.save.mockImplementationOnce(async () => {
    entered.resolve();
    return ack.promise;
  });
  const first = f.session.saveDraft(null, null);
  await entered.promise;
  const second = f.session.saveDraft(null, null);
  expect(f.session.getCheckpointExitReceipt()).toBeNull();
  ack.resolve(f.acknowledge());
  await first;
  await second;
  expect(f.session.getCheckpointExitReceipt()).toEqual(receipt(3));
  await f.session.dispose();
});

it('keeps transient metadata out of explicit buffered native save requests', async () => {
  const f = fixture();
  f.session.setAutosaveEnabled(false);
  await f.session.commit(operation);
  expect(f.session.getCheckpointExitReceipt()).toBeNull();
  await f.session.saveBuffered();
  expect(f.saveSnapshot).toHaveBeenCalledOnce();
  expect(JSON.stringify(f.saveSnapshot.mock.calls[0])).not.toContain('checkpointReceipt');
  expect(f.session.getCheckpointExitReceipt()).toEqual(receipt(2));
  await f.session.dispose();
});

it('keeps confirmed-absence recovery equality independent of a prior receipt-bearing ACK', async () => {
  const f = fixture();
  f.commit.mockRejectedValueOnce(new Error('Native refused'));
  await expect(f.session.commitDurable(operation)).rejects.toThrow('Native refused');
  await f.session.saveDraft(null, null);
  expect(f.session.getCheckpointExitReceipt()).toEqual(receipt(2));
  await expect(f.session.recoverDurableOperation(operation, 1, { kind: 'text' })).resolves.toBe(
    false
  );
  expect(f.session.getCheckpointExitReceipt()).toBeNull();
  expect(f.session.getSnapshot().error).toBeNull();
  await f.session.dispose();
});

it('clears prior authority when a lost native ACK is recovered through a canonical read', async () => {
  const f = fixture();
  const native = f.commit.getMockImplementation()!;
  f.commit.mockImplementationOnce(async (args) => {
    await native(args);
    throw new Error('Lost ACK');
  });
  await expect(f.session.commitDurable(operation)).rejects.toThrow('Lost ACK');
  await expect(f.session.recoverDurableOperation(operation, 1, { kind: 'text' })).resolves.toBe(
    true
  );
  expect(f.session.getCheckpointExitReceipt()).toBeNull();
  expect(f.session.getSnapshot().snapshot).toEqual(await f.read());
  expect(JSON.stringify(f.session.getSnapshot())).not.toContain('checkpointReceipt');
  await f.session.dispose();
});

it('clears on canonical reload even when an older injected read returns receipt metadata', async () => {
  const f = fixture();
  f.read.mockResolvedValueOnce(f.initial);
  await f.session.reload();
  expect(f.session.getCheckpointExitReceipt()).toBeNull();
  expect(f.session.getSnapshot().snapshot).not.toHaveProperty('checkpointReceipt');
  await f.session.dispose();
});

it('never restores receipt authority after disposal when an older native ACK arrives', async () => {
  const f = fixture();
  const entered = deferred<void>();
  const ack = deferred<VideoWorkspaceSnapshot>();
  f.save.mockImplementationOnce(async () => {
    entered.resolve();
    return ack.promise;
  });
  const saving = f.session.saveDraft(null, null);
  await entered.promise;
  const disposal = f.session.dispose();
  expect(f.session.getCheckpointExitReceipt()).toBeNull();
  ack.resolve(f.acknowledge());
  await saving;
  await disposal;
  expect(f.session.getCheckpointExitReceipt()).toBeNull();
});

it(
  'hides the receipt while authored captures or an action remain open without ' +
    'clearing it on local cancellation',
  async () => {
    const f = fixture();
    const end = f.session.beginCheckpointEdit();
    expect(f.session.getCheckpointExitReceipt()).toBeNull();
    end();
    f.session.stageAutosave(
      'draft',
      () => ({
        change: { kind: 'draft', annotation: null, before: null },
        acknowledge: () => undefined,
        fail: () => undefined,
      }),
      { delay: 100000 }
    );
    expect(f.session.getCheckpointExitReceipt()).toBeNull();
    f.session.cancelAutosave('draft');
    expect(f.session.getCheckpointExitReceipt()).toEqual(receipt(1));
    await f.session.dispose();
  }
);

it('refuses a receipt from another aggregate even when a legacy adapter returns a matching foreign snapshot', async () => {
  const f = fixture();
  f.save.mockResolvedValueOnce({
    ...f.initial,
    workspace: { ...f.initial.workspace, aggregateId: 'recording:other', revision: 2 },
    checkpointReceipt: { ...receipt(2), rootId: 'recording:other' },
  });
  await f.session.saveDraft(null, null);
  expect(f.session.getCheckpointExitReceipt()).toBeNull();
  expect(f.session.getSnapshot().snapshot).not.toHaveProperty('checkpointReceipt');
  await f.session.dispose();
});

it('ignores malformed or mismatched ACK receipts without changing the accepted local save', async () => {
  for (const invalid of [
    { ...receipt(2), revision: 'not-a-uuid' },
    { ...receipt(2), rootId: 'other' },
  ]) {
    const f = fixture();
    f.save.mockResolvedValueOnce({
      ...f.initial,
      workspace: { ...f.initial.workspace, revision: 2 },
      checkpointReceipt: invalid,
    });
    await f.session.saveDraft(null, null);
    expect(f.session.getCheckpointExitReceipt()).toBeNull();
    expect(f.session.getSnapshot()).toMatchObject({ error: null, dirty: false });
    expect(f.session.getSnapshot().snapshot).not.toHaveProperty('checkpointReceipt');
    await f.session.dispose();
  }
});

it('opens safely without a receipt when a legacy opening adapter omits transient metadata', async () => {
  const f = fixture();
  const { checkpointReceipt: _receipt, ...initial } = f.initial;
  const legacy = createVideoReviewSession(initial, f.deps);
  expect(legacy.getCheckpointExitReceipt()).toBeNull();
  expect(legacy.getSnapshot().snapshot).toEqual(initial);
  await legacy.dispose();
  await f.session.dispose();
});

function projectCreationAck(initial: VideoWorkspaceSnapshot, command: string) {
  const sourceId = initial.workspace.sourceMediaId ?? initial.workspace.aggregateId;
  const { sourceMediaId: _source, ...body } = initial.workspace;
  return {
    workspace: {
      ...body,
      aggregateId: sourceId,
      revision: body.revision + 1,
      createdAt: body.createdAt + 1,
    },
    draft: null,
    checkpointReceipt: { ...receipt(2), rootId: initial.workspace.aggregateId },
    archiveCheckpointReceipt: {
      ...receipt(5),
      rootId: `${sourceId.split(':', 1)[0]}:quick-project:${command}`,
    },
    ...(initial.workspace.aggregateId !== sourceId
      ? {
          retainedEditorCheckpointReceipt: { ...receipt(2), rootId: initial.workspace.aggregateId },
        }
      : {}),
  };
}

it('forwards only validated creation roles and keeps all metadata out of canonical session state', async () => {
  const f = fixture();
  const command = token(77);
  const ack = projectCreationAck(f.initial, command);
  const create = vi.fn(async () => ({ ...ack, retainedEditorCheckpointReceipt: receipt(2) }));
  const session = createVideoReviewSession(f.initial, {
    ...f.deps,
    createVideoWorkspaceProject: create,
  });
  const created = await session.createProject(command);
  expect(created.archiveCheckpointReceipt).toEqual(ack.archiveCheckpointReceipt);
  expect(created.retainedEditorCheckpointReceipt).toBeUndefined();
  expect(created).not.toHaveProperty('checkpointReceipt');
  expect(session.getCheckpointExitReceipt()).toBeNull();
  expect(JSON.stringify(session.getSnapshot())).not.toMatch(
    /checkpointReceipt|archiveCheckpointReceipt|retainedEditorCheckpointReceipt/u
  );
  await session.dispose();
  await f.session.dispose();
});

it('preserves the archive B and retained A roles when the newly selected default is C', async () => {
  const f = fixture();
  const command = token(78);
  const initial = {
    ...f.initial,
    workspace: {
      ...f.initial.workspace,
      aggregateId: 'recording:quick-project:editor-a',
      sourceMediaId: id,
    },
    checkpointReceipt: { ...receipt(1), rootId: 'recording:quick-project:editor-a' },
  };
  const ack = projectCreationAck(initial, command);
  const session = createVideoReviewSession(initial, {
    ...f.deps,
    createVideoWorkspaceProject: vi.fn(async () => ack),
  });
  const created = await session.createProject(command);
  expect(created.workspace.aggregateId).toBe(id);
  expect(created.archiveCheckpointReceipt).toEqual(ack.archiveCheckpointReceipt);
  expect(created.retainedEditorCheckpointReceipt).toEqual(ack.retainedEditorCheckpointReceipt);
  expect(created.archiveCheckpointReceipt?.rootId).not.toBe(id);
  expect(created.retainedEditorCheckpointReceipt?.rootId).not.toBe(id);
  expect(session.getCheckpointExitReceipt()).toBeNull();
  expect(JSON.stringify(session.getSnapshot())).not.toContain('CheckpointReceipt');
  await session.dispose();
  await f.session.dispose();
});

it('does not resurrect prior creation roles from a completed command replay or a mismatched archive ACK', async () => {
  const f = fixture();
  const command = token(79);
  const ack = projectCreationAck(f.initial, command);
  const { checkpointReceipt: _generic, archiveCheckpointReceipt: _archive, ...canonical } = ack;
  const create = vi
    .fn()
    .mockResolvedValueOnce(ack)
    .mockResolvedValueOnce(canonical)
    .mockResolvedValueOnce({ ...ack, archiveCheckpointReceipt: receipt(2) });
  const session = createVideoReviewSession(f.initial, {
    ...f.deps,
    createVideoWorkspaceProject: create,
  });
  await session.createProject(command);
  const replay = await session.createProject(command);
  expect(replay).not.toHaveProperty('archiveCheckpointReceipt');
  expect(replay).not.toHaveProperty('retainedEditorCheckpointReceipt');
  expect((await session.createProject(command)).archiveCheckpointReceipt).toBeUndefined();
  await session.dispose();
  await f.session.dispose();
});

it('drops delayed creation role authority after this mounted session has been disposed', async () => {
  const f = fixture();
  const command = token(80);
  const ack = projectCreationAck(f.initial, command);
  const entered = deferred<void>();
  const reply = deferred<typeof ack>();
  const create = vi.fn(async () => {
    entered.resolve();
    return reply.promise;
  });
  const session = createVideoReviewSession(f.initial, {
    ...f.deps,
    createVideoWorkspaceProject: create,
  });
  const creating = session.createProject(command);
  await entered.promise;
  const disposal = session.dispose();
  reply.resolve(ack);
  const created = await creating;
  expect(created).not.toHaveProperty('archiveCheckpointReceipt');
  expect(created).not.toHaveProperty('retainedEditorCheckpointReceipt');
  await disposal;
  await f.session.dispose();
});
