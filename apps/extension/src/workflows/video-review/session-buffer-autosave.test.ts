import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewOperation } from '../../features/video/review/types';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import { createVideoReviewSession } from './session';
import type { ReviewSessionPersistence } from './session-types';
import { EDITOR_AUTOSAVE_POLICY } from '../../features/autosave/policy';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(holdFirst = true, seedText = false) {
  let stored: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:buffer',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 2, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 0,
      history: [],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  if (seedText)
    stored.workspace.advanced.text = {
      version: 1,
      fragments: [
        {
          id: 'phrase',
          start: 0,
          end: 2,
          text: '',
          originalText: '',
          revision: 0,
          timingRevision: 0,
          alignment: 'manual',
          timeDomain: 'result',
          showInVideo: false,
        },
      ],
    };
  const entered = deferred();
  const release = deferred();
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  let failNext = false;
  let loseNextAck = false;
  const writes: VideoWorkspaceSnapshot[] = [];
  const write = async (expectedRevision: number, raw: unknown, draft: unknown) => {
    calls++;
    active++;
    maximumActive = Math.max(maximumActive, active);
    try {
      if (calls === 1) {
        entered.resolve();
        if (holdFirst) await release.promise;
      }
      if (failNext) {
        failNext = false;
        throw new Error('Storage unavailable');
      }
      expect(expectedRevision).toBe(stored.workspace.revision);
      const workspace = parseVideoWorkspace(raw);
      if (!workspace || draft !== null) throw new Error('Invalid controlled publication');
      stored = { workspace: { ...workspace, revision: expectedRevision + 1 }, draft: null };
      writes.push(structuredClone(stored));
      if (loseNextAck) {
        loseNextAck = false;
        throw new Error('Acknowledgement lost');
      }
      return structuredClone(stored);
    } finally {
      active--;
    }
  };
  const read = async () => structuredClone(stored);
  const deps: ReviewSessionPersistence = {
    acquireSyncCheckpointEdit: async () => ({ release: async () => undefined }),
    readVideoWorkspace: read,
    moveVideoWorkspaceHistory: read,
    saveVideoWorkspaceAdvanced: read,
    saveVideoWorkspaceDraft: read,
    saveVideoWorkspaceSnapshot: (request) =>
      write(request.expectedRevision, request.workspace, request.draft),
    commitVideoWorkspace: (request) =>
      write(
        request.expectedRevision,
        {
          ...stored.workspace,
          history: [
            ...stored.workspace.history.slice(0, stored.workspace.cursor),
            request.operation,
          ],
          cursor: stored.workspace.cursor + 1,
        },
        null
      ),
  };
  return {
    session: createVideoReviewSession(stored, deps),
    entered,
    release,
    read,
    writes,
    calls: () => calls,
    maximumActive: () => maximumActive,
    failNext: () => {
      failNext = true;
    },
    loseNextAck: () => {
      loseNextAck = true;
    },
    externalWrite: () => {
      stored = {
        ...stored,
        workspace: {
          ...stored.workspace,
          revision: stored.workspace.revision + 1,
          history: [note('external')],
          cursor: 1,
        },
      };
    },
    replaceSource: () => {
      stored = {
        workspace: { ...stored.workspace, sourceAssetId: 'replacement', revision: 1, createdAt: 2 },
        draft: null,
      };
    },
  };
}

function note(id: string): ReviewOperation {
  return {
    id,
    at: 1,
    target: 'annotation',
    before: null,
    after: { id, text: 'Synthetic note', anchor: { kind: 'point', time: 1 } },
  };
}

function stageContent(
  session: ReturnType<typeof createVideoReviewSession>,
  value: number,
  typing = false
) {
  const before = session.getSnapshot().document.advancedContent;
  const content = typing
    ? {
        ...before,
        text: {
          version: 1 as const,
          fragments: before.text!.fragments.map((fragment) => ({
            ...fragment,
            text: String(value),
            revision: fragment.revision + 1,
          })),
        },
      }
    : {
        ...before,
        audio: { ...before.audio, original: { ...before.audio.original, volume: value } },
      };
  const acknowledge = vi.fn();
  session.stageAutosave(
    'content',
    () => ({
      change: {
        kind: 'content',
        content,
        ...(typing
          ? {
              typing: {
                actionId: crypto.randomUUID(),
                writeId: crypto.randomUUID(),
                continuation: false,
                target: { kind: 'text' as const, fragmentId: 'phrase', field: 'text' as const },
              },
            }
          : {}),
      },
      acknowledge,
      fail: vi.fn(),
    }),
    EDITOR_AUTOSAVE_POLICY
  );
  return acknowledge;
}

it.each([false, true])(
  'publishes a staged capture after one idle delay with typing=%s',
  async (typing) => {
    vi.useFakeTimers();
    const f = fixture(false, typing);
    try {
      const acknowledged = stageContent(f.session, 1.25, typing);
      await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay - 1);
      expect(f.calls()).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(acknowledged).toHaveBeenCalledOnce();
      expect(f.session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
      expect(f.calls()).toBe(1);
      expect((await f.read()).workspace.history).toHaveLength(1);
      expect(f.session.getSnapshot()).toMatchObject({ dirty: false, error: null });
    } finally {
      await f.session.dispose();
      vi.useRealTimers();
    }
  }
);

it('publishes continuous captures within the original maximum wait', async () => {
  vi.useFakeTimers();
  const f = fixture(false);
  try {
    stageContent(f.session, 1.001);
    for (let at = 100; at < EDITOR_AUTOSAVE_POLICY.maxWait; at += 100) {
      await vi.advanceTimersByTimeAsync(100);
      stageContent(f.session, 1 + at / 100_000);
    }
    expect(f.calls()).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(f.calls()).toBe(1);
    expect(f.session.getSnapshot().document.advancedContent.audio.original.volume).toBe(1.049);
    expect((await f.read()).workspace.history).toHaveLength(1);
  } finally {
    await f.session.dispose();
    vi.useRealTimers();
  }
});

it('retains the ordinary idle debounce for direct session commands', async () => {
  vi.useFakeTimers();
  const f = fixture(false);
  try {
    await f.session.commit(note('direct'));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay - 1);
    expect(f.calls()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.calls()).toBe(1);
    expect((await f.read()).workspace.history).toEqual([note('direct')]);
  } finally {
    await f.session.dispose();
    vi.useRealTimers();
  }
});

it('acknowledges an unchanged capture without creating history or a native write', async () => {
  vi.useFakeTimers();
  const f = fixture(false);
  try {
    const acknowledged = stageContent(f.session, 1);
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.maxWait);
    expect(acknowledged).toHaveBeenCalledOnce();
    expect(f.session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
    expect(f.calls()).toBe(0);
  } finally {
    await f.session.dispose();
    vi.useRealTimers();
  }
});

it('keeps staged captures local with autosave off until explicit Save', async () => {
  vi.useFakeTimers();
  const f = fixture(false);
  try {
    f.session.setAutosaveEnabled(false);
    stageContent(f.session, 1.25);
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.maxWait);
    expect(f.calls()).toBe(0);
    expect(f.session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
    expect(f.session.getSnapshot().document.advancedContent.audio.original.volume).toBe(1.25);
    await f.session.saveBuffered();
    expect(f.calls()).toBe(1);
    expect((await f.read()).workspace.history).toHaveLength(1);
  } finally {
    await f.session.dispose();
    vi.useRealTimers();
  }
});

it('keeps due captures and local history available while the native writer is acquired', async () => {
  vi.useFakeTimers();
  const f = fixture();
  try {
    stageContent(f.session, 1.25);
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    expect(f.calls()).toBe(1);
    stageContent(f.session, 1.5);
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    expect(f.calls()).toBe(1);
    expect(f.session.getSnapshot().document.advancedContent.audio.original.volume).toBe(1.5);
    await f.session.history('undo');
    expect(f.session.getSnapshot().document.advancedContent.audio.original.volume).toBe(1.25);
    await f.session.history('redo');
    const publication = f.session.flush();
    f.release.resolve();
    await publication;
    expect(f.calls()).toBe(2);
    expect(f.maximumActive()).toBe(1);
    expect((await f.read()).workspace.history).toHaveLength(2);
    expect(f.session.getSnapshot()).toMatchObject({ dirty: false, error: null });
  } finally {
    f.release.resolve();
    await f.session.dispose();
    vi.useRealTimers();
  }
});

it('accepts local actions and history while publication waits, then saves only the latest pending state', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const first = f.session.commit(note('first'));
  try {
    const admitted = await Promise.race([
      first.then(() => 'local'),
      f.entered.promise.then(() => 'writer'),
    ]);
    expect(admitted).toBe('local');
    expect(f.calls()).toBe(0);
    const publication = f.session.flush();
    await f.entered.promise;
    await f.session.commit(note('second'));
    await f.session.history('undo');
    await f.session.history('redo');
    expect(f.session.getSnapshot()).toMatchObject({
      dirty: true,
      snapshot: { workspace: { cursor: 2, history: [note('first'), note('second')] } },
    });
    expect(f.calls()).toBe(1);
    f.release.resolve();
    await publication;
    expect(f.session.getSnapshot()).toMatchObject({
      dirty: true,
      snapshot: { workspace: { cursor: 2 } },
    });
    expect(f.session.getSnapshot().snapshot.workspace.history).toHaveLength(2);
    await f.session.flush();
    expect(f.calls()).toBe(2);
    expect(f.maximumActive()).toBe(1);
    expect((await f.read()).workspace.history).toHaveLength(2);
    expect(f.session.getSnapshot()).toMatchObject({
      dirty: false,
      snapshot: { workspace: { cursor: 2 } },
    });
  } finally {
    f.release.resolve();
    await first.catch(() => undefined);
    await f.session.dispose();
    vi.useRealTimers();
  }
});

it('keeps local actions write-free with autosave off and waits for explicit Save', async () => {
  const f = fixture(false);
  try {
    f.session.setAutosaveEnabled(false);
    await f.session.commit(note('first'));
    await f.session.commit(note('second'));
    await f.session.flush();
    expect(f.calls()).toBe(0);
    expect(f.session.getSnapshot()).toMatchObject({
      dirty: true,
      snapshot: { workspace: { cursor: 2 } },
    });
    await f.session.saveBuffered();
    expect(f.calls()).toBe(1);
    expect((await f.read()).workspace.history).toHaveLength(2);
    expect(f.session.getSnapshot().dirty).toBe(false);
  } finally {
    await f.session.dispose();
  }
});

it('retains accepted history after publication failure and retries without duplicating actions', async () => {
  vi.useFakeTimers();
  const f = fixture(false);
  try {
    await f.session.commit(note('first'));
    f.failNext();
    await expect(f.session.flush()).rejects.toThrow();
    expect(f.session.getSnapshot()).toMatchObject({ dirty: true, error: 'storage' });
    expect(f.session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
    await f.session.commit(note('second'));
    await f.session.flush();
    expect((await f.read()).workspace.history.map((entry) => entry.id)).toEqual([
      'first',
      'second',
    ]);
    expect(f.session.getSnapshot()).toMatchObject({ dirty: false, error: null });
    expect(f.maximumActive()).toBe(1);
  } finally {
    await f.session.dispose();
    vi.useRealTimers();
  }
});

it('recovers a committed publication with a lost ACK before publishing newer local actions', async () => {
  vi.useFakeTimers();
  const f = fixture(false);
  try {
    await f.session.commit(note('first'));
    f.loseNextAck();
    await expect(f.session.flush()).rejects.toThrow('Acknowledgement lost');
    expect(f.writes).toHaveLength(1);
    expect(f.session.getSnapshot()).toMatchObject({ dirty: true, error: 'storage' });
    await f.session.commit(note('second'));
    await f.session.flush();
    expect(f.calls()).toBe(2);
    expect(f.writes).toHaveLength(2);
    expect((await f.read()).workspace.history.map((entry) => entry.id)).toEqual([
      'first',
      'second',
    ]);
    expect(f.session.getSnapshot()).toMatchObject({ dirty: false, error: null });
  } finally {
    await f.session.dispose();
    vi.useRealTimers();
  }
});

it('finishes an acquired publication after autosave is disabled without writing newer local state', async () => {
  vi.useFakeTimers();
  const f = fixture();
  try {
    await f.session.commit(note('first'));
    const publication = f.session.flush();
    await f.entered.promise;
    await f.session.commit(note('second'));
    f.session.setAutosaveEnabled(false);
    f.release.resolve();
    await publication;
    await f.session.flush();
    expect(f.calls()).toBe(1);
    expect((await f.read()).workspace.history.map((entry) => entry.id)).toEqual(['first']);
    expect(f.session.getSnapshot()).toMatchObject({ dirty: true, autosaveEnabled: false });
    expect(f.session.getSnapshot().snapshot.workspace.history).toHaveLength(2);
    await f.session.saveBuffered();
    expect(f.calls()).toBe(2);
    expect(f.session.getSnapshot().dirty).toBe(false);
  } finally {
    f.release.resolve();
    await f.session.dispose();
    vi.useRealTimers();
  }
});

it('refuses retry into a replacement source and keeps the accepted local history until reload', async () => {
  vi.useFakeTimers();
  const f = fixture(false);
  try {
    await f.session.commit(note('first'));
    f.failNext();
    await expect(f.session.flush()).rejects.toThrow();
    f.replaceSource();
    await expect(f.session.flush()).rejects.toMatchObject({ code: 'conflict' });
    expect(f.calls()).toBe(1);
    expect(f.session.getSnapshot()).toMatchObject({ dirty: true, error: 'conflict' });
    expect(f.session.getSnapshot().snapshot.workspace.history.map((entry) => entry.id)).toEqual([
      'first',
    ]);
    await f.session.reload();
    expect(f.session.getSnapshot()).toMatchObject({
      dirty: false,
      error: null,
      snapshot: { workspace: { sourceAssetId: 'replacement', history: [] } },
    });
  } finally {
    await f.session.dispose();
    vi.useRealTimers();
  }
});

it('keeps a typing continuation local during a lost ACK and restores one complete Undo group', async () => {
  vi.useFakeTimers();
  const f = fixture(true, true);
  const actionId = crypto.randomUUID();
  const acknowledged = vi.fn();
  const stage = async (text: string, continuation: boolean) => {
    const before = f.session.getSnapshot().document.advancedContent;
    const content = {
      ...before,
      text: {
        version: 1 as const,
        fragments: before.text!.fragments.map((fragment) => ({
          ...fragment,
          text,
          revision: fragment.revision + 1,
        })),
      },
    };
    f.session.stageAutosave(
      'content',
      () => ({
        change: {
          kind: 'content',
          content,
          typing: {
            actionId,
            writeId: crypto.randomUUID(),
            continuation,
            target: { kind: 'text', fragmentId: 'phrase', field: 'text' },
          },
        },
        acknowledge: acknowledged,
        fail: vi.fn(),
      }),
      { delay: 250 }
    );
    await f.session.flushAutosave(['content']);
  };
  try {
    await stage('A', false);
    f.loseNextAck();
    const publication = f.session.flush();
    await f.entered.promise;
    await stage('AB', true);
    expect(f.session.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe('AB');
    expect(f.session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
    expect(acknowledged).toHaveBeenCalledTimes(2);
    f.release.resolve();
    await expect(publication).rejects.toThrow('Acknowledgement lost');
    await f.session.flush();
    expect(f.calls()).toBe(2);
    expect(f.session.getSnapshot().snapshot.workspace.history.map((entry) => entry.id)).toEqual([
      actionId,
    ]);
    const reopened = createVideoReviewSession(await f.read(), {
      readVideoWorkspace: f.read,
      moveVideoWorkspaceHistory: f.read,
      saveVideoWorkspaceAdvanced: f.read,
      saveVideoWorkspaceDraft: f.read,
      saveVideoWorkspaceSnapshot: f.read,
      commitVideoWorkspace: f.read,
    });
    try {
      reopened.setAutosaveEnabled(false);
      await reopened.history('undo');
      expect(reopened.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe('');
      await reopened.history('redo');
      expect(reopened.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe('AB');
    } finally {
      await reopened.dispose();
    }
  } finally {
    f.release.resolve();
    await f.session.dispose();
    vi.useRealTimers();
  }
});

it('does not treat a competing writer at the next revision as its own lost acknowledgement', async () => {
  vi.useFakeTimers();
  const f = fixture(false);
  try {
    await f.session.commit(note('local'));
    f.failNext();
    await expect(f.session.flush()).rejects.toThrow();
    f.externalWrite();
    await expect(f.session.flush()).rejects.toMatchObject({ code: 'conflict' });
    expect(f.calls()).toBe(1);
    expect((await f.read()).workspace.history.map((entry) => entry.id)).toEqual(['external']);
    expect(f.session.getSnapshot().snapshot.workspace.history.map((entry) => entry.id)).toEqual([
      'local',
    ]);
    expect(f.session.getSnapshot()).toMatchObject({ dirty: true, error: 'conflict' });
  } finally {
    await f.session.dispose();
    vi.useRealTimers();
  }
});
