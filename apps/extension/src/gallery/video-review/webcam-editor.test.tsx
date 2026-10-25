// @vitest-environment jsdom
import { act, useState } from 'react';
import { committedEditorFixtureProjection } from './editor-fixture.test-support';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  createQuickEditWebcam,
  type QuickEditWebcam,
} from '../../features/video/review/advanced/webcam';
import type { ReviewOperation, ReviewSelection } from '../../features/video/review/types';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import { parseReviewOperation } from '../../features/video/review/validation';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import type { attachReviewWebcam } from '../../workflows/video-review/webcam-source';
import { useReviewAdvanced } from './use-advanced';
import { useReviewWebcamEditor } from './webcam-editor';

const io = vi.hoisted(() => ({
  find: vi.fn(),
  attach: vi.fn(),
  published: vi.fn(),
  recover: vi.fn(),
}));
vi.mock('../../workflows/video-review/webcam-source', () => ({
  findReviewWebcam: io.find,
  attachReviewWebcam: io.attach,
  recoverReviewWebcam: io.recover,
}));
const source = { duration: 12, width: 160, height: 90, mimeType: 'video/webm', size: 100 };
let root: Root | null;
let editor: ReturnType<typeof useReviewWebcamEditor>;
let allowed: boolean;

function setup(
  webcam?: QuickEditWebcam,
  trackVisible?: boolean,
  automatic = false,
  pending = false,
  mount = true,
  priorCamera = false,
  aggregateId = 'recording:main'
) {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = automatic ? 'advanced' : 'basic';
  advanced.ui.modeSelectionPending = pending;
  if (trackVisible !== undefined) advanced.ui.tracks.webcam = trackVisible;
  if (webcam) advanced.webcam = webcam;
  const history: ReviewOperation[] = priorCamera
    ? [
        {
          id: 'prior-camera',
          at: 1,
          target: 'advancedContent',
          before: advanced,
          after: { ...advanced, webcam: createQuickEditWebcam('saved', source, source) },
        },
      ]
    : [];
  let cursor = 0;
  const events: string[] = [];
  let commitGate = Promise.resolve();
  const snapshot = (): VideoWorkspaceSnapshot => ({
    workspace: {
      aggregateId,
      sourceAssetId: 'main',
      formatVersion: 1,
      source,
      revision: history.length + 1,
      cursor,
      advanced,
      history: [...history],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  });
  const commit = vi.fn(async (args: { operation: unknown }) => {
    events.push('commit');
    await commitGate;
    const operation = parseReviewOperation(args.operation, 12);
    if (!operation) throw new Error('Invalid operation');
    history.splice(cursor, history.length - cursor, operation);
    cursor += 1;
    return snapshot();
  });
  const saveAdvanced = vi.fn(async () => snapshot());
  const session = createVideoReviewSession(snapshot(), {
    commitVideoWorkspace: commit,
    commitVideoWorkspaceWithProjection: async (args) =>
      committedEditorFixtureProjection(await commit(args)),
    saveVideoWorkspaceSnapshot: async (args) => {
      const workspace = parseVideoWorkspace(args.workspace);
      if (!workspace) throw new Error('Invalid workspace');
      Object.assign(advanced, workspace.advanced);
      history.splice(0, history.length, ...workspace.history);
      return snapshot();
    },
    saveVideoWorkspaceDraft: async () => snapshot(),
    readVideoWorkspace: async () => snapshot(),
    moveVideoWorkspaceHistory: async ({ direction }) => {
      cursor += direction === 'undo' ? -1 : 1;
      return snapshot();
    },
    saveVideoWorkspaceAdvanced: saveAdvanced,
  });
  function Harness({ activeSession = session }: { activeSession?: typeof session }) {
    const advanced = useReviewAdvanced(activeSession);
    const [selection, select] = useState<ReviewSelection>({ kind: 'annotation', id: 'note' });
    const [time, seek] = useState(3);
    editor = useReviewWebcamEditor({
      session: activeSession,
      advanced: {
        ...advanced,
        flush: async () => {
          events.push('flush');
          await advanced.flush();
        },
      },
      sourceDuration: 12,
      scene: source,
      time,
      selection,
      select,
      seek,
      pause: () => {},
      allowed: () => allowed,
    });
    return null;
  }
  if (mount) act(() => root!.render(<Harness />));
  return {
    session,
    saveAdvanced,
    commit,
    history,
    events,
    render: (activeSession = session) => root!.render(<Harness activeSession={activeSession} />),
    advanced,
    gate: (value: Promise<void>) => {
      commitGate = value;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  allowed = true;
  root = createRoot(document.createElement('div'));
  io.find.mockResolvedValue({ id: 'recording:camera', filename: 'camera.webm' });
  io.attach.mockImplementation(async (args: Parameters<typeof attachReviewWebcam>[0]) => {
    args.assertCurrentTarget();
    await args.attach('project-asset:camera', source);
    io.published();
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
});

it('flushes content and awaits the first attachment commit while blocking duplicate imports', async () => {
  const fixture = setup();
  await act(async () => {});
  let release!: () => void;
  fixture.gate(
    new Promise((resolve) => {
      release = resolve;
    })
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = editor.toggle();
  });
  expect(editor.pending).toBe(true);
  expect(fixture.events).toEqual(['flush', 'commit']);
  expect(io.published).not.toHaveBeenCalled();
  await act(async () => {
    await editor.toggle();
  });
  expect(io.attach).toHaveBeenCalledOnce();
  await act(async () => {
    release();
    await pending;
  });
  expect(io.published).toHaveBeenCalledOnce();
  expect(editor.camera?.assetId).toBe('project-asset:camera');
  expect(editor.selection).toEqual({ kind: 'webcam' });
  expect(editor.pending).toBe(false);
});

it('preserves the project and exposes retry after a rejected attachment', async () => {
  const fixture = setup();
  fixture.commit.mockRejectedValueOnce(new Error('Save failed'));
  await act(async () => {});
  await act(async () => {
    await editor.toggle();
  });
  expect(editor.failed).toBe(true);
  expect(editor.pending).toBe(false);
  expect(editor.camera).toBeUndefined();
  expect(fixture.history).toHaveLength(0);
  expect(io.published).not.toHaveBeenCalled();
  await act(async () => {
    editor.retry();
  });
  expect(editor.camera?.enabled).toBe(true);
});

it('edits the persisted camera without rediscovery and respects the export or Basic lock', async () => {
  setup(createQuickEditWebcam('project-asset:saved', source, source));
  await act(async () => {});
  expect(io.find).not.toHaveBeenCalled();
  act(() => editor.addPosition());
  expect(editor.selectedPosition?.time).toBe(3);
  act(() => editor.place({ x: 0, y: 0, width: 0.5, height: 0.5 }));
  expect(editor.selectedPosition?.placement.width).toBe(0.5);
  act(() => editor.hide({ start: 5, end: 7 }));
  expect(editor.hidden).toMatchObject({ start: 5, end: 7 });
  expect(editor.canHide({ start: 6, end: 8 })).toBe(false);
  expect(editor.canHide({ start: 7, end: 8 })).toBe(true);
  const before = structuredClone(editor.camera);
  const selection = editor.selection;
  allowed = false;
  await act(async () => {
    editor.remove();
    editor.patch({ offsetSeconds: 2 });
    await editor.toggle();
  });
  expect(editor.camera).toEqual(before);
  expect(editor.selection).toEqual(selection);
  allowed = true;
  await act(async () => {
    await editor.toggle();
  });
  expect(editor.camera?.enabled).toBe(false);
  await act(async () => {
    await editor.toggle();
  });
  expect(editor.camera).toEqual(before);
  expect(io.attach).not.toHaveBeenCalled();
});

it('aborts an in-flight acquisition when the editor unmounts', async () => {
  setup();
  await act(async () => {});
  let signal: AbortSignal | undefined;
  io.attach.mockImplementation((args: Parameters<typeof attachReviewWebcam>[0]) => {
    signal = args.signal;
    return new Promise((_resolve, reject) =>
      args.signal.addEventListener('abort', () => reject(args.signal.reason))
    );
  });
  let pending!: Promise<void>;
  await act(async () => {
    pending = editor.toggle();
  });
  await act(async () => {
    root!.unmount();
    root = null;
    await pending;
  });
  expect(signal?.aborted).toBe(true);
  expect(io.published).not.toHaveBeenCalled();
});

it('durably attaches automatic camera bytes before user edits with autosave disabled', async () => {
  const fixture = setup(undefined, undefined, true);
  act(() => fixture.session.setAutosaveEnabled(false));
  await act(async () => {});
  expect(fixture.commit).toHaveBeenCalledOnce();
  expect(fixture.history).toHaveLength(1);
  expect(fixture.session.getSnapshot().dirty).toBe(false);
});

it('retries resources after automatic committed publication failure without another attachment', async () => {
  const fixture = setup(undefined, undefined, true);
  io.attach.mockImplementation(async (args: Parameters<typeof attachReviewWebcam>[0]) => {
    await args.attach('project-asset:camera', source);
    throw new Error('Publication failed');
  });
  await act(async () => {});
  expect(editor.failed).toBe(true);
  expect(editor.camera?.assetId).toBe('project-asset:camera');
  const attempt = editor.resourceAttempt;
  await act(async () => {
    await editor.retry();
  });
  expect(io.recover).toHaveBeenCalledWith('project-asset:camera', expect.any(AbortSignal));
  expect(editor.resourceAttempt).toBe(attempt + 1);
  expect(editor.failed).toBe(false);
  expect(io.attach).toHaveBeenCalledOnce();
  expect(fixture.commit).toHaveBeenCalledOnce();
});

it('admits one explicit recovery, exposes failure and retries without changing history', async () => {
  const fixture = setup(createQuickEditWebcam('project-asset:saved', source, source));
  await act(async () => {});
  expect(io.recover).not.toHaveBeenCalled();
  let reject!: (error: Error) => void;
  io.recover.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  let pending: Promise<void> | undefined;
  await act(async () => {
    pending = editor.retry();
  });
  expect(editor.pending).toBe(true);
  await act(async () => {
    await editor.retry();
  });
  expect(io.recover).toHaveBeenCalledOnce();
  await act(async () => {
    reject(new Error('Still unavailable'));
    await pending;
  });
  expect(editor.failed).toBe(true);
  expect(editor.resourceAttempt).toBe(0);
  await act(async () => {
    await editor.retry();
  });
  expect(editor.failed).toBe(false);
  expect(editor.resourceAttempt).toBe(1);
  expect(fixture.commit).not.toHaveBeenCalled();
  expect(io.attach).not.toHaveBeenCalled();
});

it('keeps crop local to the selected point and moves that point through the history writer', async () => {
  const camera = createQuickEditWebcam('project-asset:camera', source, source);
  camera.positions = [
    {
      id: 'p',
      time: 2,
      placement: camera.placement,
      transition: { type: 'shrink', duration: 0.5 },
    },
  ];
  const fixture = setup(camera);
  await act(async () => editor.navigate('p'));
  await act(async () => editor.setCrop({ zoom: 2, panX: 0.3, panY: -0.2 }));
  expect(editor.camera!.appearance.zoom).toBe(1);
  expect(editor.selectedPosition!.crop).toEqual({ zoom: 2, panX: 0.3, panY: -0.2 });
  await act(async () => editor.movePosition('p', 4));
  expect(editor.selectedPosition).toMatchObject({
    time: 4,
    crop: { zoom: 2 },
    transition: { type: 'shrink' },
  });
  await act(async () =>
    vi.waitFor(
      () =>
        expect(
          fixture.session.getSnapshot().document.advancedContent.webcam?.positions[0]
        ).toMatchObject({ time: 4 }),
      { timeout: 2500 }
    )
  );
  allowed = false;
  await act(async () => editor.movePosition('p', 6));
  expect(editor.selectedPosition!.time).toBe(4);
});

it('reveals a new attachment even when an earlier camera lane preference was hidden', async () => {
  const { session } = setup(undefined, false);
  await act(async () => {});
  await act(async () => editor.toggle());
  expect(editor.camera?.enabled).toBe(true);
  expect(session.getSnapshot().document.advancedContent.webcam?.assetId).toBe(
    'project-asset:camera'
  );
  expect(io.attach).toHaveBeenCalledOnce();
  expect(session.getSnapshot().snapshot.workspace.advanced.ui.tracks.webcam).toBe(true);
});

it.each([null, undefined])(
  'preserves an authored docked destination when adding a position (%s)',
  async (split) => {
    const camera = createQuickEditWebcam('project-asset:camera', source, source);
    camera.split = 'left';
    camera.positions = [
      {
        id: 'docked',
        time: 2,
        placement: camera.placement,
        ...(split === null ? { split } : {}),
        transition: { type: 'ease-in-out', duration: 0.5 },
      },
    ];
    setup(camera);
    await act(async () => {});
    act(() => editor.addPosition());
    expect(editor.selectedPosition).toMatchObject({ time: 3, split: null });
    expect(editor.camera?.split).toBe('left');
    expect(editor.camera?.positions[0]).toEqual(camera.positions[0]);
  }
);

it('automatically admits a linked webcam in Advanced without changing object selection', async () => {
  const fixture = setup(undefined, undefined, true);
  await act(async () => {});
  expect(editor.camera?.enabled).toBe(true);
  expect(io.attach).toHaveBeenCalledOnce();
  expect(fixture.commit).toHaveBeenCalledOnce();
  expect(editor.selection).toEqual({ kind: 'annotation', id: 'note' });
});

it('shares automatic and manual admission and preserves Undo after the first attachment', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  io.attach.mockImplementation(async (args: Parameters<typeof attachReviewWebcam>[0]) => {
    await gate;
    args.assertCurrentTarget();
    await args.attach('project-asset:camera', source);
  });
  const fixture = setup(undefined, undefined, true);
  await act(async () => {});
  expect(editor.pending).toBe(true);
  await act(async () => editor.toggle());
  expect(io.attach).toHaveBeenCalledOnce();
  await act(async () => release());
  expect(editor.camera?.enabled).toBe(true);
  await act(async () => fixture.session.history('undo'));
  expect(editor.camera).toBeUndefined();
  act(() => fixture.render());
  await act(async () => {});
  expect(io.attach).toHaveBeenCalledOnce();
});

it('does not repeat a failed automatic admission until explicit Retry', async () => {
  io.attach.mockRejectedValueOnce(new Error('save'));
  const fixture = setup(undefined, undefined, true);
  await act(async () => {});
  expect(editor.failed).toBe(true);
  act(() => fixture.render());
  await act(async () => {});
  expect(io.attach).toHaveBeenCalledOnce();
  await act(async () => editor.retry());
  expect(editor.camera?.enabled).toBe(true);
  expect(fixture.history).toHaveLength(1);
  expect(io.attach).toHaveBeenCalledTimes(2);
});

it.each(['basic', 'pending', 'hidden', 'disabled', 'locked'])(
  'preserves the %s camera choice during automatic discovery',
  async (choice) => {
    if (choice === 'locked') allowed = false;
    const camera =
      choice === 'disabled'
        ? { ...createQuickEditWebcam('project-asset:saved', source, source), enabled: false }
        : undefined;
    setup(
      camera,
      choice === 'hidden' ? false : undefined,
      choice !== 'basic',
      choice === 'pending'
    );
    await act(async () => {});
    expect(io.attach).not.toHaveBeenCalled();
    expect(editor.camera).toEqual(camera);
  }
);

it.each(['recording:main', 'recording:replacement'])(
  'rejects a delayed old session attachment when opening %s',
  async (aggregateId) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const signals: AbortSignal[] = [];
    io.attach.mockImplementation(async (args: Parameters<typeof attachReviewWebcam>[0]) => {
      signals.push(args.signal);
      await gate;
      args.assertCurrentTarget();
      await args.attach('project-asset:camera', source);
    });
    const old = setup(undefined, undefined, true);
    await act(async () => {});
    const replacement = setup(undefined, undefined, true, false, false, false, aggregateId);
    act(() => old.render(replacement.session));
    await act(async () => {});
    expect(signals[0].aborted).toBe(true);
    await act(async () => release());
    expect(old.commit).not.toHaveBeenCalled();
    expect(replacement.commit).toHaveBeenCalledOnce();
  }
);

it('preserves an undone camera choice when reopening its authored history', async () => {
  const fixture = setup(undefined, undefined, true, false, true, true);
  await act(async () => {});
  expect(editor.camera).toBeUndefined();
  expect(io.attach).not.toHaveBeenCalled();
  expect(fixture.commit).not.toHaveBeenCalled();
});

it('ignores discovery that completes after the target session changed', async () => {
  let release!: (candidate: { id: string; filename: string }) => void;
  io.find.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const old = setup(undefined, undefined, true);
  const replacement = setup(undefined, undefined, true, false, false);
  await act(async () => old.render(replacement.session));
  expect(replacement.commit).toHaveBeenCalledOnce();
  await act(async () => release({ id: 'old-camera', filename: 'old.webm' }));
  expect(old.commit).not.toHaveBeenCalled();
  expect(io.attach).toHaveBeenCalledOnce();
});
