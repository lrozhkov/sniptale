// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  createQuickEditWebcam,
  type QuickEditWebcam,
} from '../../features/video/review/advanced/webcam';
import type { ReviewOperation, ReviewSelection } from '../../features/video/review/types';
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

function setup(webcam?: QuickEditWebcam, trackVisible?: boolean) {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  if (trackVisible !== undefined) advanced.ui.tracks.webcam = trackVisible;
  if (webcam) advanced.webcam = webcam;
  const history: ReviewOperation[] = [];
  const events: string[] = [];
  let commitGate = Promise.resolve();
  const snapshot = (): VideoWorkspaceSnapshot => ({
    workspace: {
      aggregateId: 'recording:main',
      sourceAssetId: 'main',
      formatVersion: 1,
      source,
      revision: history.length + 1,
      cursor: history.length,
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
    history.push(operation);
    return snapshot();
  });
  const saveAdvanced = vi.fn(async () => snapshot());
  const session = createVideoReviewSession(snapshot(), {
    commitVideoWorkspace: commit,
    saveVideoWorkspaceSnapshot: async () => snapshot(),
    saveVideoWorkspaceDraft: async () => snapshot(),
    readVideoWorkspace: async () => snapshot(),
    moveVideoWorkspaceHistory: async () => snapshot(),
    saveVideoWorkspaceAdvanced: saveAdvanced,
  });
  function Harness() {
    const advanced = useReviewAdvanced(session);
    const [selection, select] = useState<ReviewSelection>({ kind: 'none' });
    const [time, seek] = useState(3);
    editor = useReviewWebcamEditor({
      session,
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
  act(() => root!.render(<Harness />));
  return {
    session,
    saveAdvanced,
    commit,
    history,
    events,
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
  await act(async () => {
    await editor.toggle();
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

it('durably attaches camera bytes even with autosave disabled', async () => {
  const fixture = setup();
  act(() => fixture.session.setAutosaveEnabled(false));
  await act(async () => {});
  await act(async () => {
    await editor.toggle();
  });
  expect(fixture.commit).toHaveBeenCalledOnce();
  expect(fixture.history).toHaveLength(1);
  expect(fixture.session.getSnapshot().dirty).toBe(false);
});

it('retries resources after committed attachment publication failure without another attachment', async () => {
  const fixture = setup();
  io.attach.mockImplementation(async (args: Parameters<typeof attachReviewWebcam>[0]) => {
    await args.attach('project-asset:camera', source);
    throw new Error('Publication failed');
  });
  await act(async () => {});
  await act(async () => {
    await editor.toggle();
  });
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
    vi.waitFor(() =>
      expect(
        fixture.session.getSnapshot().document.advancedContent.webcam?.positions[0]
      ).toMatchObject({ time: 4 })
    )
  );
  allowed = false;
  await act(async () => editor.movePosition('p', 6));
  expect(editor.selectedPosition!.time).toBe(4);
});

it('reveals a new attachment even when an earlier camera lane preference was hidden', async () => {
  const { session, saveAdvanced } = setup(undefined, false);
  await act(async () => {});
  await act(async () => editor.toggle());
  expect(editor.camera?.enabled).toBe(true);
  expect(session.getSnapshot().document.advancedContent.webcam?.assetId).toBe(
    'project-asset:camera'
  );
  expect(io.attach).toHaveBeenCalledOnce();
  await act(async () => {
    await vi.waitFor(() =>
      expect(saveAdvanced).toHaveBeenCalledWith(
        expect.objectContaining({
          advanced: expect.objectContaining({
            ui: expect.objectContaining({ tracks: expect.objectContaining({ webcam: true }) }),
          }),
        })
      )
    );
  });
});
