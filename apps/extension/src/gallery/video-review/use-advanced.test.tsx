// @vitest-environment jsdom
import { createSourceImageFilter } from '../../features/image-filters/contract';
import { EDITOR_AUTOSAVE_POLICY } from '../../features/autosave/policy';
import { createNeutralPresentationSettings } from '../../features/video/review/advanced/presentation';
import { patchReviewClicks } from '../../features/video/review/advanced/click-animation';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { reviewAdvancedContentBaseline } from '../../features/video/review/document';
import {
  createQuickEditZoomRegion,
  updateQuickEditZoomRegion,
} from '../../features/video/review/advanced/zoom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { ReviewEdit, ReviewOperation } from '../../features/video/review/types';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import { parseReviewOperation } from '../../features/video/review/validation';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { useReviewAdvanced } from './use-advanced';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import { createQuickEditWatermark } from '../../features/video/project/scene/watermark';
import { createReviewCaptionSettings } from '../../features/video/review/text-document';
import { useReviewSnapshot } from './use-session';

let root: Root;
let host: HTMLDivElement;
let advanced: ReturnType<typeof useReviewAdvanced>;
let view: ReturnType<typeof useReviewSnapshot>;

function setup(initial = createQuickEditAdvancedState()) {
  let workspaceAdvanced = initial;
  let revision = 1;
  let history: ReviewOperation[] = [];
  const build = (): VideoWorkspaceSnapshot => ({
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'asset',
      formatVersion: 1,
      source: { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 200 },
      revision,
      cursor: history.length,
      advanced: structuredClone(workspaceAdvanced),
      history: [...history],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  });
  const deps = {
    saveVideoWorkspaceSnapshot: vi.fn(async (args: { workspace: unknown }) => {
      const workspace = parseVideoWorkspace(args.workspace);
      if (!workspace) throw new Error('Workspace is invalid.');
      workspaceAdvanced = workspace.advanced;
      history = workspace.history;
      revision += 1;
      return build();
    }),
    saveVideoWorkspaceDraft: vi.fn(async () => build()),
    commitVideoWorkspace: vi.fn(async (args: { operation: unknown }) => {
      const operation = parseReviewOperation(args.operation, 4);
      if (!operation) throw new Error('Operation is invalid.');
      history = [...history, operation];
      revision += 1;
      return build();
    }),
    readVideoWorkspace: vi.fn(async () => build()),
    moveVideoWorkspaceHistory: vi.fn(async () => build()),
    saveVideoWorkspaceAdvanced: vi.fn(async (args: { advanced: unknown }) => {
      workspaceAdvanced = structuredClone(args.advanced) as QuickEditAdvancedState;
      revision += 1;
      return build();
    }),
  } satisfies Parameters<typeof createVideoReviewSession>[1];
  const saveFromOtherTab = (next: QuickEditAdvancedState) => {
    history.push({
      id: 'remote-content',
      at: 2,
      target: 'advancedContent',
      before: reviewAdvancedContentBaseline(workspaceAdvanced),
      after: reviewAdvancedContentBaseline(next),
    });
    workspaceAdvanced = { ...workspaceAdvanced, ui: structuredClone(next.ui) };
    revision += 1;
  };
  const session = createVideoReviewSession(build(), deps);
  function Harness() {
    view = useReviewSnapshot(session);
    advanced = useReviewAdvanced(session);
    return null;
  }
  act(() => root.render(<Harness />));
  return {
    session,
    deps,
    saveFromOtherTab,
    build,
    rerender: () => act(() => root.render(<Harness />)),
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  host = document.createElement('div');
  root = createRoot(host);
});

it.each(['basic', 'advanced'] as const)(
  'saves an initial %s choice through the existing UI buffer',
  async (mode) => {
    const initial = createQuickEditAdvancedState();
    initial.ui.modeSelectionPending = true;
    const { session } = setup(initial);
    act(() => advanced.setMode(mode));
    expect(advanced.advanced.ui).toMatchObject({ mode, modeSelectionPending: false });
    await act(async () => advanced.flush());
    expect(session.getSnapshot().snapshot.workspace.advanced.ui).toMatchObject({
      mode,
      modeSelectionPending: false,
    });
  }
);

it('retains an initial choice after a failed save and retries it', async () => {
  const initial = createQuickEditAdvancedState();
  initial.ui.modeSelectionPending = true;
  const { session, deps, build } = setup(initial);
  session.setAutosaveEnabled(false);
  deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce(new Error('Storage unavailable'));
  act(() => advanced.setMode('basic'));
  await act(async () => {
    await advanced.flush();
    await expect(session.saveBuffered()).rejects.toThrow('Storage unavailable');
  });
  expect(session.getSnapshot().error).toBe('storage');
  expect(advanced.advanced.ui.modeSelectionPending).toBe(false);
  expect(build().workspace.advanced.ui.modeSelectionPending).toBe(true);
  await act(async () => session.saveBuffered());
  expect(session.getSnapshot().snapshot.workspace.advanced.ui.modeSelectionPending).toBe(false);
  expect(advanced.saveFailed).toBe(false);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([
  'zoom',
  'cursorMotion',
  'annotationEffects',
  'text',
  'originalAudio',
  'voiceover',
  'music',
  'webcam',
  'keyboard',
  'mouse',
] as const)('keeps unrelated lane data stable after the %s toggle is saved', async (track) => {
  const initial = createQuickEditAdvancedState();
  initial.ui.mode = 'advanced';
  initial.zoom.enabled = true;
  initial.cursorMotionEnabled = true;
  initial.annotationEffects = { enabled: true, instances: [] };
  initial.captions = { ...createReviewCaptionSettings(), enabled: true };
  const clip = {
    id: 'voice',
    assetId: 'project-asset:voice',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 2,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
  initial.audio.voiceover = [clip];
  initial.audio.music = [{ ...clip, id: 'music', assetId: 'project-asset:music' }];
  initial.webcam = createQuickEditWebcam(
    'project-asset:camera',
    { width: 640, height: 480 },
    { width: 1920, height: 1080 }
  );
  setup(initial);
  const before = advanced.advanced;
  const edits = view.document.edits;
  await act(async () => {
    switch (track) {
      case 'zoom':
        advanced.setZoom((value) => ({ ...value, enabled: false }));
        break;
      case 'cursorMotion':
        advanced.setCursorMotionEnabled(false);
        break;
      case 'annotationEffects':
        advanced.setAnnotationEffects((value) => value && { ...value, enabled: false });
        break;
      case 'text':
        advanced.setCaptions({ ...advanced.advanced.captions!, enabled: false });
        break;
      case 'originalAudio':
        advanced.setAudio((value) => ({ ...value, original: { ...value.original, muted: true } }));
        break;
      case 'voiceover':
      case 'music':
        advanced.setAudio((value) => ({
          ...value,
          [track]: value[track].map((clip) => ({ ...clip, muted: true })),
        }));
        break;
      case 'webcam':
        advanced.setWebcam((value) => value && { ...value, enabled: false });
        break;
      case 'keyboard':
      case 'mouse':
        await advanced.setTrackVisibility(track, false);
        break;
    }
    await advanced.flush();
  });
  const after = advanced.advanced;
  expect(view.document.edits, 'a lane flag must not rebuild timeline projections').toBe(edits);
  const affected =
    track === 'text'
      ? 'captions'
      : track === 'cursorMotion'
        ? 'cursorMotionEnabled'
        : track === 'keyboard' || track === 'mouse'
          ? 'ui'
          : ['originalAudio', 'voiceover', 'music'].includes(track)
            ? 'audio'
            : track;
  for (const [key, value] of Object.entries(before)) {
    if (key !== affected && typeof value === 'object' && value !== null)
      expect(Reflect.get(after, key), `${track} must retain ${key}`).toBe(value);
  }
  if (track !== 'voiceover') expect(after.audio.voiceover).toBe(before.audio.voiceover);
  if (track !== 'music') expect(after.audio.music).toBe(before.audio.music);
  if (track !== 'originalAudio') expect(after.audio.original).toBe(before.audio.original);
  if (track === 'zoom') expect(after.zoom.regions).toBe(before.zoom.regions);
  if (track === 'annotationEffects')
    expect(after.annotationEffects?.instances).toBe(before.annotationEffects?.instances);
  if (track === 'webcam') expect(after.webcam?.positions).toBe(before.webcam?.positions);
  expect(advanced.pending).toBe(false);
});

it.each(['cut', 'speed', 'freeze'] as const)(
  'publishes changed %s edits to timeline consumers and restores them through Undo/Redo',
  async (kind) => {
    const { session } = setup();
    session.setAutosaveEnabled(false);
    const before = view.document.edits;
    const range = { id: kind, start: 1, end: 2, requestedStart: 1, requestedEnd: 2 };
    const edit: ReviewEdit =
      kind === 'cut'
        ? { ...range, kind }
        : kind === 'speed'
          ? { ...range, kind, rate: 2, audio: 'speed' }
          : {
              ...range,
              kind,
              end: 1,
              requestedEnd: 1,
              duration: 2,
              frameTime: 1,
              frameDuration: 1 / 30,
            };
    await act(async () => {
      await session.commit({
        id: `${kind}:operation`,
        at: 1,
        target: 'edit',
        before: null,
        after: edit,
      });
    });
    expect(view.document.edits).not.toBe(before);
    expect(view.document.edits).toEqual([edit]);
    await act(async () => session.history('undo'));
    expect(view.document.edits).toEqual([]);
    await act(async () => session.history('redo'));
    expect(view.document.edits).toEqual([edit]);
  }
);

it('rebuilds writes from reloaded persisted content after a conflict recovery', async () => {
  const { session, deps, saveFromOtherTab } = setup();
  deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce(
    Object.assign(new Error('Revision conflict'), { code: 'conflict' })
  );
  act(() => advanced.setMode('advanced'));
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay + 1));
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(1);
  expect(advanced.advanced.ui.mode).toBe('advanced');

  // Another tab saved zoom content; the stale tab reloads to recover from the conflict.
  const otherTab = createQuickEditAdvancedState();
  otherTab.ui.mode = 'advanced';
  otherTab.zoom = {
    enabled: true,
    regions: [
      {
        id: 'zoom-b',
        start: 1,
        end: 2,
        transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
        enter: { type: 'ease-in-out', duration: 0.3 },
        exit: { type: 'ease-in-out', duration: 0.3 },
      },
    ],
  };
  saveFromOtherTab(otherTab);
  await act(async () => {
    await session.reload();
  });
  act(() => advanced.reset());

  expect(advanced.advanced.zoom.regions).toHaveLength(1);
  act(() => advanced.setMode('basic'));
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay + 1));
  const write = parseVideoWorkspace(deps.saveVideoWorkspaceSnapshot.mock.lastCall?.[0].workspace);
  expect(write!.advanced.ui.mode).toBe('basic');
  expect(session.getSnapshot().document.advancedContent.zoom.regions).toHaveLength(1);
});

it('composes two UI commands staged before the next render', async () => {
  const { deps } = setup();
  act(() => {
    advanced.setOverlaysVisible(false);
    advanced.setWorkspaceColor('light', '#abcdefff');
  });
  expect(advanced.advanced.ui.overlaysVisible).toBe(false);
  expect(advanced.advanced.ui.workspaceColors).toEqual({ light: '#abcdefff' });
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay + 1));
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(1);
  const write = parseVideoWorkspace(deps.saveVideoWorkspaceSnapshot.mock.lastCall?.[0].workspace);
  expect(write?.advanced.ui).toMatchObject({
    overlaysVisible: false,
    workspaceColors: { light: '#abcdefff' },
  });
});

it('publishes a collapsed content operation inside one workspace snapshot', async () => {
  const { deps } = setup();
  act(() => advanced.setZoom((zoom) => ({ ...zoom, enabled: true })));
  act(() =>
    advanced.setBackground((background) => ({
      ...background,
      enabled: true,
      type: 'solid',
      color: '#111111ff',
      layout: { padding: 12, cornerRadius: 4 },
    }))
  );
  expect(advanced.advanced.zoom.enabled).toBe(true);
  expect(advanced.advanced.background.enabled).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay + 1));
  // One collapsed content operation is published with the workspace.
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(1);
  const op = parseVideoWorkspace(
    deps.saveVideoWorkspaceSnapshot.mock.lastCall?.[0].workspace
  )?.history.at(-1) as {
    target: string;
    after: { zoom: { enabled: boolean }; background: { enabled: boolean } };
  };
  expect(op.target).toBe('advancedContent');
  expect(op.after.zoom.enabled).toBe(true);
  expect(op.after.background.enabled).toBe(true);
  expect(deps.saveVideoWorkspaceAdvanced).not.toHaveBeenCalled();
});

it('keeps the newest local revision when an older write acknowledges (S2)', async () => {
  const { deps } = setup();
  const save = deps.saveVideoWorkspaceSnapshot.getMockImplementation()!;
  let releaseA!: () => void;
  deps.saveVideoWorkspaceSnapshot.mockImplementationOnce(async (args) => {
    await new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    return save(args);
  });
  act(() => advanced.setZoom((zoom) => ({ ...zoom, enabled: true })));
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay + 1));
  act(() =>
    advanced.setBackground((background) => ({
      ...background,
      enabled: true,
      type: 'solid',
      color: '#111111ff',
      layout: { padding: 12, cornerRadius: 4 },
    }))
  );
  await act(async () => {
    releaseA();
    await Promise.resolve();
  });
  expect(advanced.advanced.background.enabled).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay + 1));
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(2);
  const op = parseVideoWorkspace(
    deps.saveVideoWorkspaceSnapshot.mock.lastCall?.[0].workspace
  )?.history.at(-1) as {
    after: { zoom: { enabled: boolean }; background: { enabled: boolean } };
  };
  expect(op.after.zoom.enabled).toBe(true);
  expect(op.after.background.enabled).toBe(true);
});

it('keeps the pending edit after a save failure and retries publication', async () => {
  const { deps, session } = setup();
  deps.saveVideoWorkspaceSnapshot
    .mockRejectedValueOnce(new Error('storage'))
    .mockRejectedValueOnce(new Error('storage'));
  act(() => {
    advanced.setWorkspaceColor('light', '#abcdefff');
    advanced.setWorkspaceColor('dark', '#123456ff');
  });
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay + 1));
  expect(session.getSnapshot().error).toBe('storage');
  expect(advanced.advanced.ui.workspaceColors).toEqual({ light: '#abcdefff', dark: '#123456ff' });
  await act(async () => {
    await expect(session.saveBuffered()).rejects.toThrow('storage');
  });
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(2);
  expect(advanced.advanced.ui.workspaceColors).toEqual({ light: '#abcdefff', dark: '#123456ff' });
  await act(async () => session.saveBuffered());
  expect(session.getSnapshot().error).toBeNull();
  expect(advanced.advanced.ui.workspaceColors).toEqual({ light: '#abcdefff', dark: '#123456ff' });
  const write = parseVideoWorkspace(deps.saveVideoWorkspaceSnapshot.mock.lastCall?.[0].workspace);
  expect(write!.advanced.ui.workspaceColors).toEqual({ light: '#abcdefff', dark: '#123456ff' });
  act(() => advanced.setWorkspaceColor('light', null));
  await act(async () => {
    await advanced.flush();
    await session.saveBuffered();
  });
  expect(advanced.advanced.ui.workspaceColors).toEqual({ dark: '#123456ff' });
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
});

it('persists canvas and lane gains through content history and clears an override back to native', async () => {
  const { session, deps, build } = setup();
  act(() => {
    advanced.setCanvas({ width: 1080, height: 1920 });
    advanced.setAudio((audio) => ({ ...audio, laneVolumes: { voiceover: 0.7, music: 0.2 } }));
  });
  await act(async () => advanced.flush());
  expect(session.getSnapshot().document.advancedContent).toMatchObject({
    canvas: { width: 1080, height: 1920 },
    audio: { laneVolumes: { voiceover: 0.7, music: 0.2 } },
  });
  const reopened = createVideoReviewSession(build(), deps);
  expect(reopened.getSnapshot().document.advancedContent.canvas).toEqual({
    width: 1080,
    height: 1920,
  });
  act(() => advanced.setCanvas(undefined));
  await act(async () => advanced.flush());
  expect(advanced.advanced.canvas).toBeUndefined();
  expect(session.getSnapshot().document.advancedContent.canvas).toBeUndefined();
  expect(session.getSnapshot().document.advancedContent.audio.laneVolumes?.music).toBe(0.2);
});

it('flushes a remove/reconnect burst without committing a canonical no-op', async () => {
  const { session, deps } = setup();
  act(() =>
    advanced.setZoom(() => ({
      enabled: true,
      regions: [
        {
          ...createQuickEditZoomRegion({ id: 'a', at: 0, duration: 1 }),
          linkTo: 'b',
          linkEasing: 'linear',
        },
        createQuickEditZoomRegion({ id: 'b', at: 2, duration: 1 }),
      ],
    }))
  );
  await act(async () => {
    await advanced.flush();
    await session.saveBuffered();
  });
  const saved = session.getSnapshot().document.advancedContent;
  act(() => {
    advanced.setZoom((zoom) => ({
      ...zoom,
      regions: updateQuickEditZoomRegion(zoom.regions, 'a', { linkTo: null }),
    }));
    advanced.setZoom((zoom) => ({
      ...zoom,
      regions: updateQuickEditZoomRegion(zoom.regions, 'a', { linkTo: 'b' }),
    }));
  });
  await act(async () => {
    await expect(advanced.flush()).resolves.toBeUndefined();
    await session.saveBuffered();
  });
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot().document.advancedContent).toEqual(saved);
  expect(advanced.saveFailed).toBe(false);
});

it('rejects malformed staged content without losing the pending edit and allows correction', async () => {
  const { session, deps } = setup();
  act(() => advanced.setCanvas({ width: 0, height: 1080 }));
  await act(async () => {
    await expect(advanced.flush()).rejects.toThrow('Advanced content is invalid');
  });
  expect(advanced.saveFailed).toBe(true);
  expect(advanced.advanced.canvas).toEqual({ width: 0, height: 1080 });
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
  act(() => advanced.setCanvas({ width: 1920, height: 1080 }));
  await act(async () => advanced.flush());
  expect(session.getSnapshot().document.advancedContent.canvas).toEqual({
    width: 1920,
    height: 1080,
  });
  expect(advanced.saveFailed).toBe(false);
});

it('keeps background gestures out of history and invalidates them on a committed background change', async () => {
  const { session } = setup();
  const before = session.getSnapshot().document.advancedContent;
  const draft = {
    enabled: true as const,
    type: 'solid' as const,
    color: '#123456ff',
    layout: { padding: 80, cornerRadius: 12 },
  };
  act(() => advanced.previewBackground(draft));
  await act(async () => advanced.flush());
  expect(advanced.backgroundPreview).toEqual(draft);
  expect(session.getSnapshot().document.advancedContent).toEqual(before);
  expect(advanced.advanced.background).toEqual(before.background);
  act(() => advanced.previewBackground(null));
  expect(advanced.backgroundPreview).toBeNull();
  act(() => advanced.previewBackground(draft));
  act(() => advanced.setBackground(() => draft));
  expect(advanced.backgroundPreview).toBeNull();
  await act(async () => advanced.flush());
  expect(session.getSnapshot().document.advancedContent.background).toEqual(draft);
});

it('does not resurrect a removed baseline watermark when another scene setting is edited', async () => {
  const initial = createQuickEditAdvancedState();
  initial.watermark = { ...createQuickEditWatermark('Saved mark'), mode: 'text' };
  const { session } = setup(initial);
  const before = session.getSnapshot().document.advancedContent;
  const { watermark: _removed, ...after } = before;
  await act(async () => {
    await session.commitDurable({
      id: 'remove-watermark',
      at: 2,
      target: 'advancedContent',
      before,
      after,
    });
  });
  expect(advanced.advanced.watermark).toBeUndefined();
  act(() => advanced.setCanvas({ width: 640, height: 360 }));
  await act(async () => advanced.flush());
  expect(session.getSnapshot().document.advancedContent.watermark).toBeUndefined();
  expect(session.getSnapshot().document.advancedContent.canvas).toEqual({
    width: 640,
    height: 360,
  });
});

it('keeps webcam edits in content history and restores them on reopen', async () => {
  const { session, deps, build } = setup();
  const webcam = createQuickEditWebcam(
    'project-asset:camera',
    { width: 640, height: 480 },
    { width: 320, height: 180 }
  );
  act(() => advanced.setWebcam(() => webcam));
  await act(async () => advanced.flush());
  const reopened = createVideoReviewSession(build(), deps);
  expect(reopened.getSnapshot().document.advancedContent.webcam).toEqual(webcam);
  act(() =>
    advanced.setWebcam((current) => (current ? { ...current, enabled: false } : undefined))
  );
  await act(async () => advanced.flush());
  expect(session.getSnapshot().document.advancedContent.webcam).toMatchObject({
    enabled: false,
    assetId: webcam.assetId,
  });
  act(() => advanced.setWebcam(() => undefined));
  await act(async () => advanced.flush());
  expect(advanced.advanced.webcam).toBeUndefined();
  expect(session.getSnapshot().document.advancedContent.webcam).toBeUndefined();
});

it('persists and removes a browser header through the existing content history', async () => {
  const { session, deps, build } = setup();
  act(() =>
    advanced.setWindowHeader({
      ...DEFAULT_WINDOW_HEADER,
      kind: 'browser' as const,
      title: 'A <browser> & title',
      url: 'https://site.test/?a=1&b=2',
    })
  );
  await act(async () => advanced.flush());
  const reopened = createVideoReviewSession(build(), deps);
  expect(reopened.getSnapshot().document.advancedContent.windowHeader).toEqual({
    ...DEFAULT_WINDOW_HEADER,
    kind: 'browser' as const,
    title: 'A <browser> & title',
    url: 'https://site.test/?a=1&b=2',
  });
  act(() => advanced.setWindowHeader(undefined));
  await act(async () => advanced.flush());
  expect(advanced.advanced.windowHeader).toBeUndefined();
  expect(session.getSnapshot().document.advancedContent.windowHeader).toBeUndefined();
  const operation = session.getSnapshot().snapshot.workspace.history.at(-1);
  expect(operation).toMatchObject({
    target: 'advancedContent',
    before: {
      windowHeader: {
        ...DEFAULT_WINDOW_HEADER,
        kind: 'browser' as const,
        title: 'A <browser> & title',
        url: 'https://site.test/?a=1&b=2',
      },
    },
  });
});

it('persists one bulk click patch through history and keeps failed drafts retryable', async () => {
  const { session, deps, build } = setup();
  deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce(new Error('write failed'));
  act(() =>
    advanced.setClickAnimations((current) =>
      patchReviewClicks(current, ['one', 'two'], { effect: 'ripple' })
    )
  );
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay + 1));
  expect(session.getSnapshot().error).toBe('storage');
  expect(advanced.advanced.clickAnimations).toHaveLength(2);
  expect(build().workspace.history).toHaveLength(0);
  await act(async () => session.saveBuffered());
  expect(advanced.saveFailed).toBe(false);
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(session.getSnapshot().document.advancedContent.clickAnimations).toHaveLength(2);
  expect(deps.saveVideoWorkspaceAdvanced).not.toHaveBeenCalled();
});

it('keeps disabled lanes visible, preserves settings, and top-level hide/show restores application', async () => {
  const { session } = setup();
  act(() => {
    advanced.setMode('advanced');
    advanced.setClickAnimations(() => patchReviewClicks([], ['click'], { effect: 'ripple' }));
    advanced.setWebcam(() =>
      createQuickEditWebcam(
        'project-asset:camera',
        { width: 640, height: 480 },
        { width: 1920, height: 1080 }
      )
    );
  });
  await act(async () => advanced.flush());
  act(() => {
    advanced.setActionsEnabled(false);
    advanced.setZoom((zoom) => ({ ...zoom, enabled: false }));
    advanced.setWebcam((camera) => (camera ? { ...camera, enabled: false } : camera));
  });
  await act(async () => advanced.flush());
  expect(advanced.advanced.ui.tracks.actions).toBe(true);
  expect(advanced.advanced.ui.tracks.zoom).toBe(true);
  act(() => advanced.setMode('basic'));
  await act(async () => advanced.flush());
  act(() => advanced.setMode('advanced'));
  await act(async () => advanced.flush());
  expect(advanced.advanced.actionsEnabled).toBe(false);
  expect(advanced.advanced.zoom.enabled).toBe(false);
  act(() => advanced.setMode('basic'));
  await act(async () => advanced.setTrackVisibility('actions', false));
  await act(async () => advanced.setTrackVisibility('actions', true));
  await act(async () => advanced.flush());
  expect(advanced.advanced.actionsEnabled).toBe(false);
  act(() => advanced.setMode('advanced'));
  await act(async () => advanced.flush());
  for (const track of ['actions', 'zoom', 'webcam'] as const) {
    await act(async () => advanced.setTrackVisibility(track, false));
    await act(async () => advanced.flush());
    expect(advanced.advanced.ui.tracks[track]).toBe(false);
    await act(async () => advanced.setTrackVisibility(track, true));
    await act(async () => advanced.flush());
    expect(advanced.advanced.ui.tracks[track]).toBe(true);
  }
  expect(advanced.advanced.actionsEnabled).toBe(true);
  expect(advanced.advanced.zoom.enabled).toBe(true);
  expect(advanced.advanced.webcam).toMatchObject({
    enabled: true,
    assetId: 'project-asset:camera',
  });
  expect(session.getSnapshot().document.advancedContent.clickAnimations).toHaveLength(1);
  expect(session.getSnapshot().document.advancedContent.actionsEnabled).toBe(true);
});

it('does not resurrect removed presentation from persisted baseline during another scene edit', async () => {
  const { createNewWorkspacePresentationSettings } =
    await import('../../features/video/review/advanced/presentation');
  const initial = createQuickEditAdvancedState();
  initial.presentation = createNewWorkspacePresentationSettings();
  const { loadQuickEditAdvancedState } =
    await import('../../features/video/review/advanced/validation');
  const { session } = setup(loadQuickEditAdvancedState(initial)!);
  const before = session.getSnapshot().document.advancedContent;
  const { presentation: _removed, ...after } = before;
  await act(async () =>
    session.commitDurable({
      id: 'remove-presentation',
      at: 2,
      target: 'advancedContent',
      before,
      after,
    })
  );
  expect(advanced.advanced.presentation).toBeUndefined();
  act(() => advanced.setCanvas({ width: 640, height: 360 }));
  await act(async () => advanced.flush());
  expect(session.getSnapshot().document.advancedContent.presentation).toBeUndefined();
});

it('shows watermark and presentation immediately, coalesces rapid edits and retries a failed save', async () => {
  const { deps, session } = setup();
  const mark = { ...createQuickEditWatermark('Author'), mode: 'text' as const };
  const presentation = { ...createNeutralPresentationSettings(), audioFade: true };
  act(() => {
    advanced.setWatermark(mark);
    advanced.setPresentation(presentation);
    advanced.setWatermark({ ...mark, text: { ...mark.text, italic: true } });
  });
  expect(advanced.advanced.watermark?.text.italic).toBe(true);
  expect(advanced.advanced.presentation?.audioFade).toBe(true);
  expect(deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
  deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce(new Error('write failed'));
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay + 1));
  expect(session.getSnapshot().error).toBe('storage');
  expect(advanced.advanced.watermark?.text.italic).toBe(true);
  await act(async () => session.saveBuffered());
  expect(session.getSnapshot().error).toBeNull();
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(2);
  const operation = parseVideoWorkspace(
    deps.saveVideoWorkspaceSnapshot.mock.lastCall?.[0].workspace
  )!.history.at(-1)!;
  expect(operation.target === 'advancedContent' && operation.after.watermark?.text.italic).toBe(
    true
  );
});

it('retains later presentation settings while an earlier watermark write is in flight', async () => {
  const { deps, session } = setup();
  const save = deps.saveVideoWorkspaceSnapshot.getMockImplementation()!;
  let release!: () => void;
  deps.saveVideoWorkspaceSnapshot.mockImplementationOnce(async (args) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return save(args);
  });
  const mark = { ...createQuickEditWatermark('Author'), mode: 'text' as const };
  act(() => advanced.setWatermark(mark));
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay + 1));
  act(() => advanced.setPresentation({ ...createNeutralPresentationSettings(), audioFade: true }));
  await act(async () => {
    release();
    await Promise.resolve();
  });
  await act(async () => {
    await advanced.flush();
    await session.saveBuffered();
  });
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(2);
  const operation = parseVideoWorkspace(
    deps.saveVideoWorkspaceSnapshot.mock.lastCall?.[0].workspace
  )!.history.at(-1)!;
  expect(operation.target === 'advancedContent' && operation.after.watermark?.text.value).toBe(
    'Author'
  );
  expect(operation.target === 'advancedContent' && operation.after.presentation?.audioFade).toBe(
    true
  );
});

it('does not enter the save queue for an unchanged authored proposal', async () => {
  const { deps } = setup();
  act(() => advanced.setZoom((zoom) => ({ ...zoom, regions: [...zoom.regions] })));
  expect(advanced.pending).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
});

it('does not resurrect a removed optional annotation baseline after content replay', async () => {
  const initial = createQuickEditAdvancedState();
  initial.annotationEffects = { enabled: false, instances: [] };
  const { session } = setup(initial);
  act(() => advanced.setAnnotationEffects(() => undefined));
  await act(async () => advanced.flush());
  expect(session.getSnapshot().document.advancedContent.annotationEffects).toBeUndefined();
  expect(advanced.advanced.annotationEffects).toBeUndefined();
});

it('keeps effective content identity through transport-only rerenders and invalidates on an authored revision', () => {
  const fixture = setup();
  const before = advanced.advanced;
  fixture.rerender();
  expect(advanced.advanced).toBe(before);
  act(() => advanced.setZoom((zoom) => ({ ...zoom, enabled: true })));
  const authored = advanced.advanced;
  expect(authored).not.toBe(before);
  fixture.rerender();
  expect(advanced.advanced).toBe(authored);
});

it('drains accepted edits before a control, retries atomically, and ignores retained legacy locks', async () => {
  const initial = createQuickEditAdvancedState();
  initial.ui.lockedTracks = { actions: true };
  const { session, deps } = setup(initial);
  session.setAutosaveEnabled(false);
  act(() => advanced.setMode('advanced'));
  await act(async () => {
    await advanced.flush();
    await session.saveBuffered();
  });
  const stale = structuredClone(session.getSnapshot().snapshot.workspace.advanced);
  act(() =>
    advanced.setClickAnimations(() => patchReviewClicks([], ['click'], { effect: 'ripple' }))
  );
  deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce(
    new DOMException('Retry save', 'QuotaExceededError')
  );
  await act(async () => {
    await advanced.setTrackVisibility('actions', false);
    await expect(session.saveBuffered()).rejects.toThrow('Retry save');
  });
  expect(session.getSnapshot().error).toBe('storage');
  expect(session.getSnapshot().document.advancedContent.clickAnimations).toHaveLength(1);
  const historyLength = session.getSnapshot().snapshot.workspace.history.length;
  await act(async () => session.saveBuffered());
  expect(session.getSnapshot().error).toBeNull();
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(historyLength);
  expect(advanced.advanced.ui.tracks.actions).toBe(false);
  await act(async () => session.saveAdvanced(stale));
  expect(advanced.advanced.ui).toMatchObject({
    tracks: { actions: false },
    lockedTracks: { actions: true },
  });
  act(() => advanced.setClickAnimations(() => []));
  expect(advanced.advanced.clickAnimations).toHaveLength(0);
  await act(async () => advanced.flush());
  expect(session.getSnapshot().document.advancedContent.clickAnimations).toHaveLength(0);
});

it('discards a failed control on Reload and permits flush without replaying it', async () => {
  const { session, deps } = setup();
  deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce(new Error('Control save failed'));
  await act(async () => {
    await advanced.setTrackVisibility('actions', false);
    await expect(session.saveBuffered()).rejects.toThrow('Control save failed');
  });
  expect(session.getSnapshot().error).toBe('storage');
  await act(async () => {
    await session.reload();
    advanced.reset();
  });
  expect(advanced.saveFailed).toBe(false);
  await act(async () => advanced.flush());
  await act(async () => advanced.retry());
  expect(advanced.advanced.ui.tracks.actions).toBe(true);
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledOnce();
});

it('persists source filters and retries a failed capture without losing the stack', async () => {
  const { session, deps, build } = setup();
  session.setAutosaveEnabled(false);
  const stack = {
    version: 1 as const,
    filters: [
      createSourceImageFilter('bloom', 'bloom'),
      { ...createSourceImageFilter('blur', 'blur'), enabled: false },
    ],
  };
  deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce(new Error('Storage unavailable'));
  act(() => advanced.setSourceFilters(stack));
  expect(advanced.advanced.sourceFilters).toEqual(stack);
  await act(async () => {
    await advanced.flush();
    await expect(session.saveBuffered()).rejects.toThrow('Storage unavailable');
  });
  expect(advanced.advanced.sourceFilters).toEqual(stack);
  await act(async () => session.saveBuffered());
  expect(session.getSnapshot().document.advancedContent.sourceFilters).toEqual(stack);
  expect(
    createVideoReviewSession(build(), deps).getSnapshot().document.advancedContent.sourceFilters
  ).toEqual(stack);
  act(() => advanced.setSourceFilters(undefined));
  await act(async () => {
    await advanced.flush();
    await session.saveBuffered();
  });
  expect(session.getSnapshot().document.advancedContent.sourceFilters).toBeUndefined();
  expect(advanced.advanced.sourceFilters).toBeUndefined();
});
it('does not resurrect removed source filters from the persisted baseline', async () => {
  const initial = createQuickEditAdvancedState();
  initial.sourceFilters = { version: 1, filters: [createSourceImageFilter('blur', 'blur')] };
  const { session } = setup(initial),
    before = session.getSnapshot().document.advancedContent;
  const { sourceFilters: _removed, ...after } = before;
  await act(async () => {
    await session.commitDurable({
      id: 'remove-source-filters',
      at: 2,
      target: 'advancedContent',
      before,
      after,
    });
  });
  expect(advanced.advanced.sourceFilters).toBeUndefined();
  act(() => advanced.setCanvas({ width: 640, height: 360 }));
  await act(async () => advanced.flush());
  expect(session.getSnapshot().document.advancedContent.sourceFilters).toBeUndefined();
});
