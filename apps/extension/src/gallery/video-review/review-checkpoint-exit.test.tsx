// @vitest-environment jsdom
import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { VideoReview } from './index';
import {
  createEditorFixture,
  committedEditorFixtureProjection,
} from './editor-fixture.test-support';
import type { createVideoReviewSession } from '../../workflows/video-review/session';
import type { loadVideoReviewSource } from '../../workflows/video-review/source';
import type { commitVideoWorkspaceWithProjection } from '../../composition/persistence/review-workspaces/store';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';

const integration = vi.hoisted(() => ({
  load: vi.fn(),
  index: vi.fn(),
  draft: vi.fn(),
  commit: vi.fn(),
  history: vi.fn(),
  read: vi.fn(),
  advanced: vi.fn(),
  snapshot: vi.fn(),
  create: vi.fn(),
  download: vi.fn(),
  export: vi.fn(),
}));
const sync = vi.hoisted(() => ({
  exit: vi.fn(),
  wake: vi.fn(),
  open: vi.fn(),
  sessions: [] as ReturnType<typeof createVideoReviewSession>[],
}));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('./use-zoom-preview-source', async (original) => ({
  ...(await original<typeof import('./use-zoom-preview-source')>()),
  useZoomPreviewSource: () => null,
}));
vi.mock('../../platform/runtime-messaging/sync-product-client', async (original) => ({
  ...(await original<typeof import('../../platform/runtime-messaging/sync-product-client')>()),
  createSyncProductClient: () => ({ requestCheckpointExit: sync.exit, wakeCheckpoints: sync.wake }),
}));
vi.mock('../../platform/navigation/extension-pages', async (original) => ({
  ...(await original<typeof import('../../platform/navigation/extension-pages')>()),
  openVideoEditorPage: sync.open,
}));
vi.mock('../../workflows/video-review/session', async (original) => {
  const actual = await original<typeof import('../../workflows/video-review/session')>();
  return {
    ...actual,
    createVideoReviewSession: (...args: Parameters<typeof createVideoReviewSession>) => {
      const session = actual.createVideoReviewSession(...args);
      sync.sessions.push(session);
      return session;
    },
  };
});
vi.mock('../../workflows/video-review/source', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/source')>()),
  loadVideoReviewSource: integration.load,
}));
vi.mock('../../workflows/video-review/media-index', () => ({
  inspectReviewMedia: integration.index,
  supportedReviewVideoCodecs: vi.fn(async () => ['vp9']),
}));
vi.mock('../../workflows/video-review/export-lifecycle', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/export-lifecycle')>()),
  exportReviewedVideo: integration.export,
}));
vi.mock('../../composition/persistence/review-workspaces/store', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/review-workspaces/store')>()),
  saveVideoWorkspaceDraft: integration.draft,
  saveVideoWorkspaceAdvanced: integration.advanced,
  saveVideoWorkspaceSnapshot: integration.snapshot,
  commitVideoWorkspace: integration.commit,
  createVideoWorkspaceProject: integration.create,
  commitVideoWorkspaceWithProjection: async (
    args: Parameters<typeof commitVideoWorkspaceWithProjection>[0]
  ) => committedEditorFixtureProjection(await integration.commit(args)),
  moveVideoWorkspaceHistory: integration.history,
  readVideoWorkspace: integration.read,
}));
vi.mock('../shared/download', async (original) => ({
  ...(await original<typeof import('../shared/download')>()),
  downloadGalleryBlob: integration.download,
}));

const receipt = (serial: number, rootId = 'recording:r') => ({
  rootKind: 'video-review' as const,
  rootId,
  revision: `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  for (const mock of Object.values(integration)) mock.mockReset();
  sync.sessions.length = 0;
  sync.exit.mockReset().mockResolvedValue({ kind: 'checkpoint-exit', outcome: 'requested' });
  sync.wake.mockReset().mockResolvedValue({ kind: 'checkpoint-woken' });
  sync.open.mockReset().mockResolvedValue(undefined);
});
async function mount(withReceipt = true, archived = false) {
  const fixture = createEditorFixture(integration);
  let serial = 1;
  const load = integration.load.getMockImplementation()!;
  integration.load.mockImplementation(async (...args: Parameters<typeof loadVideoReviewSource>) => {
    const loaded: Awaited<ReturnType<typeof loadVideoReviewSource>> = await load(...args);
    return {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        ...(archived
          ? {
              workspace: {
                ...loaded.snapshot.workspace,
                aggregateId: 'recording:editor-a',
                sourceMediaId: 'recording:r',
              },
            }
          : {}),
        ...(withReceipt
          ? {
              checkpointReceipt: receipt(
                serial,
                archived ? 'recording:editor-a' : loaded.snapshot.workspace.aggregateId
              ),
            }
          : {}),
      },
    };
  });
  for (const mock of [
    integration.draft,
    integration.commit,
    integration.history,
    integration.advanced,
    integration.snapshot,
  ]) {
    const write = mock.getMockImplementation()!;
    mock.mockImplementation(async (...args: unknown[]) => {
      const saved: VideoWorkspaceSnapshot = await write(...args);
      serial++;
      return {
        ...saved,
        ...(withReceipt ? { checkpointReceipt: receipt(serial, saved.workspace.aggregateId) } : {}),
      };
    });
  }
  integration.create.mockImplementation(
    async (args: { aggregateId: string; archiveId: string }) => {
      const before = sync.sessions.at(-1)!.getSnapshot().snapshot;
      const sourceId = before.workspace.sourceMediaId ?? before.workspace.aggregateId;
      const { sourceMediaId: _source, ...workspace } = before.workspace;
      const created = {
        workspace: {
          ...workspace,
          aggregateId: sourceId,
          history: [],
          cursor: 0,
          revision: workspace.revision + 1,
          createdAt: workspace.createdAt + 1,
        },
        draft: null,
      };
      const generic = receipt(++serial, args.aggregateId);
      const archive = receipt(++serial, args.archiveId);
      const currentLoad = integration.load.getMockImplementation()!;
      integration.load.mockImplementationOnce(
        async (...loadArgs: Parameters<typeof loadVideoReviewSource>) => {
          const loaded: Awaited<ReturnType<typeof loadVideoReviewSource>> = await currentLoad(
            ...loadArgs
          );
          return {
            ...loaded,
            snapshot: { ...created, checkpointReceipt: receipt(++serial, sourceId) },
          };
        }
      );
      return {
        ...created,
        ...(withReceipt
          ? {
              checkpointReceipt: generic,
              archiveCheckpointReceipt: archive,
              ...(args.aggregateId !== sourceId
                ? { retainedEditorCheckpointReceipt: generic }
                : {}),
            }
          : {}),
      };
    }
  );
  await act(async () =>
    fixture.root.render(
      <VideoReview
        aggregateId={archived ? 'recording:editor-a' : 'recording:r'}
        onBack={fixture.back}
      />
    )
  );
  return fixture;
}
const close = (fixture: Awaited<ReturnType<typeof mount>>) =>
  fixture.host.querySelector<HTMLButtonElement>('header [aria-label="common.actions.close"]')!;

it(
  'requests the exact normal-close receipt and disables actual edit/close controls ' +
    'while admission waits',
  async () => {
    const f = await mount();
    const rpc = deferred<unknown>();
    sync.exit.mockReturnValueOnce(rpc.promise);
    try {
      await act(async () => close(f).click());
      expect(sync.exit).toHaveBeenCalledExactlyOnceWith(receipt(1));
      expect(f.back).not.toHaveBeenCalled();
      expect(close(f).disabled).toBe(true);
      expect(f.button('addComment').disabled).toBe(true);
      await act(async () => rpc.resolve({ kind: 'checkpoint-exit', outcome: 'requested' }));
      expect(f.back).toHaveBeenCalledOnce();
    } finally {
      await f.cleanup();
    }
  }
);

it('does not issue exit RPC for an ordinary legacy Review without a receipt', async () => {
  const f = await mount(false);
  try {
    await act(async () => close(f).click());
    expect(sync.exit).not.toHaveBeenCalled();
    expect(f.back).toHaveBeenCalledOnce();
  } finally {
    await f.cleanup();
  }
});

it('allows safe normal close after advisory exit RPC rejection without native rereads', async () => {
  const f = await mount();
  const rpc = deferred<unknown>();
  sync.exit.mockReturnValueOnce(rpc.promise);
  try {
    await act(async () => close(f).click());
    const reads = integration.read.mock.calls.length;
    await act(async () => rpc.reject(new Error('Worker unavailable')));
    expect(f.back).toHaveBeenCalledOnce();
    expect(integration.read).toHaveBeenCalledTimes(reads);
    expect(sync.sessions[0]!.getSnapshot().error).toBeNull();
  } finally {
    await f.cleanup();
  }
});

it('keeps the Review open when a new authored capture appears during exit admission', async () => {
  const f = await mount();
  const rpc = deferred<unknown>();
  sync.exit.mockReturnValueOnce(rpc.promise);
  try {
    await act(async () => close(f).click());
    act(() =>
      sync.sessions[0]!.stageAutosave(
        'draft',
        () => ({
          change: { kind: 'draft', annotation: null, before: null },
          acknowledge: () => undefined,
          fail: () => undefined,
        }),
        { delay: 100000 }
      )
    );
    await act(async () => rpc.resolve({ kind: 'checkpoint-exit', outcome: 'requested' }));
    expect(f.back).not.toHaveBeenCalled();
    expect(sync.sessions[0]!.getSnapshot().dirty).toBe(true);
  } finally {
    await f.cleanup();
  }
});

it('does not dismiss a newer accepted native revision after an older exit RPC returns', async () => {
  const f = await mount();
  const rpc = deferred<unknown>();
  sync.exit.mockReturnValueOnce(rpc.promise);
  try {
    await act(async () => close(f).click());
    await act(async () =>
      sync.sessions[0]!.saveAdvanced({
        ...sync.sessions[0]!.getSnapshot().snapshot.workspace.advanced,
        ui: {
          ...sync.sessions[0]!.getSnapshot().snapshot.workspace.advanced.ui,
          overlaysVisible: false,
        },
      })
    );
    expect(sync.sessions[0]!.getCheckpointExitReceipt()).toEqual(receipt(2));
    await act(async () => rpc.resolve({ kind: 'checkpoint-exit', outcome: 'requested' }));
    expect(f.back).not.toHaveBeenCalled();
  } finally {
    await f.cleanup();
  }
});

it.each(['unmount', 'rebind'] as const)(
  'cannot resume an obsolete inspector close after %s',
  async (replacement) => {
    const f = await mount();
    const rpc = deferred<unknown>();
    sync.exit.mockReturnValueOnce(rpc.promise);
    try {
      await act(async () => close(f).click());
      if (replacement === 'unmount') await act(async () => f.root.render(null));
      else {
        const load = integration.load.getMockImplementation()!;
        integration.load.mockImplementationOnce(
          async (...args: Parameters<typeof loadVideoReviewSource>) => {
            const loaded: Awaited<ReturnType<typeof loadVideoReviewSource>> = await load(...args);
            return {
              ...loaded,
              snapshot: {
                ...loaded.snapshot,
                workspace: { ...loaded.snapshot.workspace, aggregateId: 'recording:other' },
                checkpointReceipt: receipt(1, 'recording:other'),
              },
            };
          }
        );
        await act(async () =>
          f.root.render(<VideoReview aggregateId="recording:other" onBack={f.back} />)
        );
      }
      await act(async () => rpc.resolve({ kind: 'checkpoint-exit', outcome: 'requested' }));
      expect(f.back).not.toHaveBeenCalled();
    } finally {
      await f.cleanup();
    }
  }
);

it('preserves unsaved note text after native failure and requests exit only after successful retry', async () => {
  const f = await mount();
  try {
    await f.click('addComment');
    await f.fill('Keep this note');
    integration.draft.mockRejectedValueOnce(new Error('Native refused'));
    await act(async () => close(f).click());
    expect(sync.exit).not.toHaveBeenCalled();
    expect(f.back).not.toHaveBeenCalled();
    expect(f.host.querySelector('textarea')?.value).toBe('Keep this note');
    await act(async () => close(f).click());
    expect(sync.exit).toHaveBeenCalledOnce();
    expect(f.back).toHaveBeenCalledOnce();
  } finally {
    await f.cleanup();
  }
});

it.each(['accepted', 'new-edit', 'rejected'] as const)(
  'guards the actual advanced-to-Montage transition: %s',
  async (outcome) => {
    const f = await mount();
    const rpc = deferred<unknown>();
    sync.exit.mockReturnValueOnce(rpc.promise);
    try {
      await act(async () => f.button('openVideoEditor').click());
      expect(sync.exit).toHaveBeenCalledExactlyOnceWith(receipt(1));
      expect(sync.open).not.toHaveBeenCalled();
      if (outcome === 'new-edit') await act(async () => sync.sessions[0]!.saveDraft(null, null));
      await act(async () => {
        if (outcome === 'rejected') rpc.reject(new Error('Worker unavailable'));
        else rpc.resolve({ kind: 'checkpoint-exit', outcome: 'requested' });
      });
      expect(sync.open).toHaveBeenCalledTimes(outcome === 'new-edit' ? 0 : 1);
    } finally {
      await f.cleanup();
    }
  }
);

vi.mock('../../workflows/sync-transfer/editing-admission', () => ({
  ensureNativeEditingRootAvailable: vi.fn(async () => undefined),
}));

it(
  'requests the accepted recovery receipt when leaving an existing-note edit without ' +
    'committing the note',
  async () => {
    const f = await mount();
    try {
      await f.click('addComment');
      await f.fill('Original note');
      await f.click('save');
      await f.click('editComment');
      await f.fill('Recovery edit');
      const committed = f.snapshot.workspace.history.length;
      await act(async () => close(f).click());
      expect(f.snapshot.workspace.history).toHaveLength(committed);
      expect(f.snapshot.draft?.annotation.text).toBe('Recovery edit');
      expect(sync.exit).toHaveBeenCalledOnce();
      expect(f.back).toHaveBeenCalledOnce();
    } finally {
      await f.cleanup();
    }
  }
);

it(
  'retains an existing-note checkpoint after failed flush and releases it only for a ' +
    'later successful exit',
  async () => {
    const f = await mount();
    try {
      await f.click('addComment');
      await f.fill('Original note');
      await f.click('save');
      await f.click('editComment');
      await f.fill('Retained recovery');
      integration.draft.mockRejectedValueOnce(new Error('Native refused'));
      await act(async () => close(f).click());
      expect(sync.exit).not.toHaveBeenCalled();
      expect(f.back).not.toHaveBeenCalled();
      await act(async () => sync.sessions[0]!.flushAutosave(['draft']));
      expect(sync.sessions[0]!.getSnapshot().dirty).toBe(false);
      expect(sync.sessions[0]!.getCheckpointExitReceipt()).toBeNull();
      await act(async () => close(f).click());
      expect(sync.exit).toHaveBeenCalledOnce();
      expect(f.back).toHaveBeenCalledOnce();
    } finally {
      await f.cleanup();
    }
  }
);

it('reacquires the existing-note action for later input after an obsolete exit attempt', async () => {
  const f = await mount();
  const rpc = deferred<unknown>();
  sync.exit.mockReturnValueOnce(rpc.promise);
  try {
    await f.click('addComment');
    await f.fill('Original note');
    await f.click('save');
    await f.click('editComment');
    await f.fill('Recovery edit');
    await act(async () => close(f).click());
    expect(sync.exit).toHaveBeenCalledOnce();
    await act(async () =>
      sync.sessions[0]!.saveAdvanced(sync.sessions[0]!.getSnapshot().snapshot.workspace.advanced)
    );
    await act(async () => rpc.resolve({ kind: 'checkpoint-exit', outcome: 'requested' }));
    expect(f.back).not.toHaveBeenCalled();
    await f.fill('Later recovery edit');
    await act(async () => sync.sessions[0]!.flushAutosave(['draft']));
    expect(sync.sessions[0]!.getSnapshot().dirty).toBe(false);
    expect(sync.sessions[0]!.getCheckpointExitReceipt()).toBeNull();
    await act(async () => close(f).click());
    expect(sync.exit).toHaveBeenCalledTimes(2);
    expect(f.back).toHaveBeenCalledOnce();
  } finally {
    await f.cleanup();
  }
});

async function clickNew(fixture: Awaited<ReturnType<typeof mount>>) {
  await fixture.click('moreActions');
  const button = document
    .querySelector('[data-ui="gallery.videoReview.newProject"]')
    ?.closest<HTMLButtonElement>('button');
  if (!button) throw new Error('Missing actual New Project action.');
  await act(async () => button.click());
}

it.each([false, true])(
  'uses exact New fixed roles before selecting the returned default in the actual UI; archived=%s',
  async (archived) => {
    const f = await mount(true, archived);
    const rpc = deferred<unknown>();
    sync.exit.mockReturnValueOnce(rpc.promise);
    try {
      await clickNew(f);
      expect(integration.create).toHaveBeenCalledOnce();
      const args = integration.create.mock.calls[0]![0];
      expect(sync.exit.mock.calls[0]![0].rootId).toBe(args.archiveId);
      expect(integration.load).toHaveBeenCalledOnce();
      expect(close(f).disabled).toBe(true);
      expect(f.button('addComment').disabled).toBe(true);
      await act(async () => rpc.resolve({ kind: 'checkpoint-exit', outcome: 'requested' }));
      expect(sync.exit.mock.calls.map((call) => call[0].rootId)).toEqual([
        args.archiveId,
        ...(archived ? ['recording:editor-a'] : []),
      ]);
      expect(sync.exit.mock.calls.some((call) => call[0].rootId === 'recording:r')).toBe(false);
      expect(integration.load).toHaveBeenCalledTimes(2);
      expect(sync.sessions.at(-1)!.getSnapshot().snapshot.workspace.aggregateId).toBe(
        'recording:r'
      );
    } finally {
      await f.cleanup();
    }
  }
);

it('preserves the native New command identity on refusal and continues after advisory role RPC rejection', async () => {
  const f = await mount();
  try {
    integration.create.mockRejectedValueOnce(new Error('Native refused'));
    await clickNew(f);
    expect(sync.exit).not.toHaveBeenCalled();
    expect(integration.load).toHaveBeenCalledOnce();
    sync.exit.mockRejectedValueOnce(new Error('Worker unavailable'));
    await clickNew(f);
    expect(integration.create.mock.calls[0]![0].archiveId).toBe(
      integration.create.mock.calls[1]![0].archiveId
    );
    expect(integration.create).toHaveBeenCalledTimes(2);
    expect(sync.exit).toHaveBeenCalledOnce();
    expect(integration.load).toHaveBeenCalledTimes(2);
  } finally {
    await f.cleanup();
  }
});

it('preserves a newly authored Review buffer and suppresses the second New role and selection after IPC', async () => {
  const f = await mount(true, true);
  const rpc = deferred<unknown>();
  sync.exit.mockReturnValueOnce(rpc.promise);
  try {
    await clickNew(f);
    expect(sync.exit).toHaveBeenCalledOnce();
    act(() =>
      sync.sessions[0]!.stageAutosave(
        'draft',
        () => ({
          change: { kind: 'draft', annotation: null, before: null },
          acknowledge: () => undefined,
          fail: () => undefined,
        }),
        { delay: 100000 }
      )
    );
    await act(async () => rpc.resolve({ kind: 'checkpoint-exit', outcome: 'requested' }));
    expect(sync.exit).toHaveBeenCalledOnce();
    expect(integration.load).toHaveBeenCalledOnce();
    expect(sync.sessions[0]!.getSnapshot().dirty).toBe(true);
  } finally {
    await f.cleanup();
  }
});
