// @vitest-environment jsdom
import { act, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  normalizeEditorFrameSettings,
} from '../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { useCommittedFrameDraft } from './frame-commit';

vi.mock('../../runtime/async-actions', () => ({ reportEditorActionFailure: vi.fn() }));
let callbacks: Map<number, FrameRequestCallback>;
let nextId = 0;
beforeEach(() => {
  callbacks = new Map();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
});
afterEach(() => vi.unstubAllGlobals());
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flushFrame() {
  await act(async () => {
    const batch = [...callbacks.values()];
    callbacks.clear();
    batch.forEach((callback) => callback(0));
  });
}
type TestFrameApply = (
  frame: EditorFrameSettings,
  options?: { preview?: boolean; quality?: 'preview' | 'final'; signal?: AbortSignal }
) => void | boolean | Promise<void | boolean>;
function setup(apply = vi.fn<TestFrameApply>(() => Promise.resolve())) {
  const activity = vi.fn<(active: boolean) => void>();
  const host = document.createElement('div');
  const root = createRoot(host);
  let controls!: ReturnType<typeof useCommittedFrameDraft>;
  let draft!: EditorFrameSettings;
  let replace!: (frame: EditorFrameSettings) => void;
  let activate!: (active: boolean) => void;
  function Harness() {
    const [frame, setFrame] = useState(DEFAULT_EDITOR_FRAME_SETTINGS);
    const [localDraft, setDraft] = useState(frame);
    const [active, setActive] = useState(true);
    replace = setFrame;
    activate = setActive;
    draft = localDraft;
    useLayoutEffect(() => setDraft(normalizeEditorFrameSettings(frame)), [frame]);
    controls = useCommittedFrameDraft({
      frame,
      setDraft,
      apply,
      active,
      onPreviewActivityChange: activity,
    });
    return <span>{localDraft.backgroundColor}</span>;
  }
  act(() => root.render(<Harness />));
  return {
    apply,
    activity,
    get controls() {
      return controls;
    },
    get draft() {
      return draft;
    },
    replace: (frame: EditorFrameSettings) => act(() => replace(frame)),
    deactivate: () => act(() => activate(false)),
    unmount: () => act(() => root.unmount()),
  };
}
it('updates local controls immediately and coalesces previews after input', async () => {
  const h = setup();
  act(() => {
    h.controls.previewFrameDraft((frame) => ({ ...frame, backgroundColor: '#111111' }));
    h.controls.previewFrameDraft((frame) => ({ ...frame, backgroundColor: '#222222' }));
  });
  expect(h.draft.backgroundColor).toBe('#222222');
  expect(h.apply).not.toHaveBeenCalled();
  await flushFrame();
  expect(h.apply).toHaveBeenCalledTimes(1);
  expect(h.apply.mock.lastCall?.[0].backgroundColor).toBe('#222222');
  expect(h.apply.mock.lastCall?.[1]?.preview).toBe(true);
  h.unmount();
});
it('aborts an active preview and waits before rendering only the latest pending preview', async () => {
  const pending = deferred();
  const apply = vi
    .fn((_frame: EditorFrameSettings, _options?: { preview?: boolean; signal?: AbortSignal }) =>
      Promise.resolve()
    )
    .mockImplementationOnce(() => pending.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  const signal = apply.mock.calls[0]?.[1]?.signal;
  act(() => {
    h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 80 }));
    h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 90 }));
  });
  expect(signal?.aborted).toBe(true);
  await flushFrame();
  expect(apply).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve());
  expect(apply).toHaveBeenCalledTimes(2);
  expect(apply.mock.lastCall?.[0].paddingTop).toBe(90);
  h.unmount();
});
it('keeps completed edits in order and records each once after the preview settles', async () => {
  const preview = deferred();
  const firstCommit = deferred();
  const apply = vi
    .fn((_frame: EditorFrameSettings, _options?: { preview?: boolean; signal?: AbortSignal }) =>
      Promise.resolve()
    )
    .mockImplementationOnce(() => preview.promise)
    .mockImplementationOnce(() => firstCommit.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  act(() => {
    h.controls.setFrameDraft((frame) => ({ ...frame, paddingTop: 80 }));
    h.controls.setFrameDraft((frame) => ({ ...frame, paddingBottom: 90 }));
  });
  expect(h.draft).toMatchObject({ paddingTop: 80, paddingBottom: 90 });
  expect(apply).toHaveBeenCalledTimes(1);
  await act(async () => preview.resolve());
  expect(apply).toHaveBeenCalledTimes(2);
  expect(apply.mock.calls[1]?.[1]?.preview).toBe(false);
  h.replace(normalizeEditorFrameSettings({ ...DEFAULT_EDITOR_FRAME_SETTINGS, paddingTop: 80 }));
  expect(h.draft.paddingBottom).toBe(90);
  await act(async () => firstCommit.resolve());
  expect(apply).toHaveBeenCalledTimes(3);
  expect(apply.mock.lastCall?.[0]).toMatchObject({ paddingTop: 80, paddingBottom: 90 });
  expect(apply.mock.lastCall?.[1]?.preview).toBe(false);
  h.unmount();
});
it('restores the cancel baseline after obsolete preview work settles', async () => {
  const preview = deferred();
  const apply = vi
    .fn((_frame: EditorFrameSettings, _options?: { preview?: boolean; signal?: AbortSignal }) =>
      Promise.resolve()
    )
    .mockImplementationOnce(() => preview.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  act(() => h.controls.previewFrameDraft(DEFAULT_EDITOR_FRAME_SETTINGS));
  await flushFrame();
  await act(async () => preview.resolve());
  expect(apply.mock.lastCall?.[0]).toEqual(
    normalizeEditorFrameSettings(DEFAULT_EDITOR_FRAME_SETTINGS)
  );
  expect(apply.mock.calls.every((call) => call[1]?.preview)).toBe(true);
  h.unmount();
});
it('rebases after external undo and prevents old work from replacing it', async () => {
  const preview = deferred();
  const apply = vi
    .fn((_frame: EditorFrameSettings, _options?: { preview?: boolean; signal?: AbortSignal }) =>
      Promise.resolve()
    )
    .mockImplementationOnce(() => preview.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  h.replace({ ...DEFAULT_EDITOR_FRAME_SETTINGS, paddingTop: 12 });
  expect(h.draft.paddingTop).toBe(12);
  expect(apply.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  await act(async () => preview.resolve());
  expect(apply.mock.lastCall?.[0].paddingTop).toBe(12);
  act(() => h.controls.setFrameDraft((frame) => ({ ...frame, paddingRight: 60 })));
  await act(async () => {});
  expect(apply.mock.lastCall?.[0]).toMatchObject({ paddingTop: 12, paddingRight: 60 });
  h.unmount();
});
it.each(['deactivate', 'unmount'] as const)(
  'cancels preview and restores accepted canvas on %s',
  async (action) => {
    const preview = deferred();
    const apply = vi
      .fn((_frame: EditorFrameSettings, _options?: { preview?: boolean; signal?: AbortSignal }) =>
        Promise.resolve()
      )
      .mockImplementationOnce(() => preview.promise);
    const h = setup(apply);
    act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
    await flushFrame();
    h[action]();
    expect(apply.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await act(async () => preview.resolve());
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.lastCall?.[0]).toEqual(
      normalizeEditorFrameSettings(DEFAULT_EDITOR_FRAME_SETTINGS)
    );
    expect(apply.mock.lastCall?.[1]?.preview).toBe(true);
    if (action !== 'unmount') h.unmount();
  }
);
it('preserves completed edits when leaving while a preview is still settling', async () => {
  const preview = deferred();
  const apply = vi
    .fn((_frame: EditorFrameSettings, _options?: { preview?: boolean; signal?: AbortSignal }) =>
      Promise.resolve()
    )
    .mockImplementationOnce(() => preview.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  act(() => {
    h.controls.setFrameDraft((frame) => ({ ...frame, paddingTop: 80 }));
    h.controls.setFrameDraft((frame) => ({ ...frame, paddingBottom: 90 }));
  });
  h.unmount();
  await act(async () => preview.resolve());
  const commits = apply.mock.calls.filter((call) => call[1]?.preview === false);
  expect(commits).toHaveLength(2);
  expect(commits[0]?.[0]).toMatchObject({ paddingTop: 80, paddingBottom: 32 });
  expect(commits[1]?.[0]).toMatchObject({ paddingTop: 80, paddingBottom: 90 });
  expect(apply.mock.lastCall?.[0]).toMatchObject({ paddingTop: 80, paddingBottom: 90 });
});
it('reports preview failure, preserves input data, and restores without a history commit', async () => {
  const { reportEditorActionFailure } = await import('../../runtime/async-actions');
  const failure = deferred();
  const apply = vi
    .fn((_frame: EditorFrameSettings, _options?: { preview?: boolean; signal?: AbortSignal }) =>
      Promise.resolve()
    )
    .mockImplementationOnce(() => failure.promise);
  const h = setup(apply);
  const backgroundImageData = 'data:image/png;base64,retained';
  act(() =>
    h.controls.previewFrameDraft((frame) => ({
      ...frame,
      backgroundImageData,
      backgroundMode: 'image',
    }))
  );
  await flushFrame();
  const error = new Error('render failed');
  await act(async () => failure.reject(error));
  expect(reportEditorActionFailure).toHaveBeenCalledWith('frame-settings', error);
  expect(h.draft.backgroundImageData).toBe(backgroundImageData);
  expect(apply.mock.calls.every((call) => call[1]?.preview)).toBe(true);
  expect(apply.mock.lastCall?.[0]).toEqual(
    normalizeEditorFrameSettings(DEFAULT_EDITOR_FRAME_SETTINGS)
  );
  act(() => h.controls.setFrameDraft((frame) => ({ ...frame, paddingTop: 50 })));
  await act(async () => {});
  expect(apply.mock.lastCall?.[0].backgroundImageData).toBe(backgroundImageData);
  expect(apply.mock.lastCall?.[1]?.preview).toBe(false);
  h.unmount();
});
it('removes a scheduled preview on unmount before any render starts', async () => {
  const h = setup();
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  h.unmount();
  await flushFrame();
  expect(h.apply).not.toHaveBeenCalled();
});

it('holds preview activity across idle drafts and releases only after cancel baseline renders', async () => {
  const canceled = deferred();
  const apply = vi
    .fn((_frame: EditorFrameSettings, _options?: { preview?: boolean; signal?: AbortSignal }) =>
      Promise.resolve()
    )
    .mockImplementationOnce(() => Promise.resolve())
    .mockImplementationOnce(() => canceled.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  expect(h.activity.mock.calls).toEqual([[true]]);
  await flushFrame();
  expect(h.activity.mock.calls).toEqual([[true]]);
  act(() => h.controls.previewFrameDraft(DEFAULT_EDITOR_FRAME_SETTINGS));
  await flushFrame();
  expect(h.activity.mock.calls).toEqual([[true]]);
  await act(async () => canceled.resolve());
  expect(h.activity.mock.calls).toEqual([[true], [false]]);
  h.unmount();
});
it('keeps activity through queued commits and a newer pending preview during commit', async () => {
  const firstCommit = deferred();
  const secondCommit = deferred();
  const apply = vi
    .fn((_frame: EditorFrameSettings, _options?: { preview?: boolean; signal?: AbortSignal }) =>
      Promise.resolve()
    )
    .mockImplementationOnce(() => Promise.resolve())
    .mockImplementationOnce(() => firstCommit.promise)
    .mockImplementationOnce(() => secondCommit.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  act(() => {
    h.controls.setFrameDraft((frame) => ({ ...frame, paddingTop: 80 }));
    h.controls.setFrameDraft((frame) => ({ ...frame, paddingBottom: 90 }));
    h.controls.previewFrameDraft((frame) => ({ ...frame, paddingLeft: 60 }));
  });
  await flushFrame();
  await act(async () => firstCommit.resolve());
  expect(h.activity.mock.calls).toEqual([[true]]);
  await act(async () => secondCommit.resolve());
  expect(h.activity.mock.calls).toEqual([[true]]);
  act(() => h.controls.setFrameDraft((frame) => frame));
  await act(async () => {});
  expect(h.activity.mock.calls).toEqual([[true], [false]]);
  h.unmount();
});
it('holds activity after a failed preview until accepted baseline restoration settles', async () => {
  const failed = deferred();
  const restoration = deferred();
  const apply = vi
    .fn((_frame: EditorFrameSettings, _options?: { preview?: boolean; signal?: AbortSignal }) =>
      Promise.resolve()
    )
    .mockImplementationOnce(() => failed.promise)
    .mockImplementationOnce(() => restoration.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  await act(async () => failed.reject(new Error('preview failed')));
  expect(h.activity.mock.calls).toEqual([[true]]);
  await act(async () => restoration.resolve());
  expect(h.activity.mock.calls).toEqual([[true], [false]]);
  h.unmount();
});
it('holds activity after unmount until active work and restoration settle', async () => {
  const preview = deferred();
  const restoration = deferred();
  const apply = vi
    .fn((_frame: EditorFrameSettings, _options?: { preview?: boolean; signal?: AbortSignal }) =>
      Promise.resolve()
    )
    .mockImplementationOnce(() => preview.promise)
    .mockImplementationOnce(() => restoration.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  h.unmount();
  await act(async () => preview.resolve());
  expect(h.activity.mock.calls).toEqual([[true]]);
  await act(async () => restoration.resolve());
  expect(h.activity.mock.calls).toEqual([[true], [false]]);
});
it('keeps the activity gate after failed restoration until a baseline retry succeeds', async () => {
  const preview = deferred();
  const restoration = deferred();
  const retry = deferred();
  const apply = vi
    .fn((_frame: EditorFrameSettings, _options?: { preview?: boolean; signal?: AbortSignal }) =>
      Promise.resolve()
    )
    .mockImplementationOnce(() => preview.promise)
    .mockImplementationOnce(() => restoration.promise)
    .mockImplementationOnce(() => retry.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  await act(async () => preview.reject(new Error('preview failed')));
  await act(async () => restoration.reject(new Error('restoration failed')));
  expect(h.activity.mock.calls).toEqual([[true]]);
  act(() => h.controls.previewFrameDraft(DEFAULT_EDITOR_FRAME_SETTINGS));
  await flushFrame();
  expect(h.activity.mock.calls).toEqual([[true]]);
  await act(async () => retry.resolve());
  expect(h.activity.mock.calls).toEqual([[true], [false]]);
  h.unmount();
});
it('releases scheduled activity on unmount when no canvas render has started', () => {
  const h = setup();
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  expect(h.activity.mock.calls).toEqual([[true]]);
  h.unmount();
  expect(h.activity.mock.calls).toEqual([[true], [false]]);
  expect(h.apply).not.toHaveBeenCalled();
});
it('requests reduced preview quality and final quality for completed edits', async () => {
  const h = setup();
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  expect(h.apply.mock.lastCall?.[1]).toMatchObject({ preview: true, quality: 'preview' });
  act(() => h.controls.setFrameDraft((frame) => frame));
  await act(async () => {});
  expect(h.apply.mock.lastCall?.[1]).toMatchObject({ preview: false, quality: 'final' });
  h.unmount();
});
it.each(['cancel', 'deactivate', 'unmount'] as const)(
  'uses final quality without history for %s and holds activity until restoration settles',
  async (action) => {
    const restoration = deferred();
    const apply = vi
      .fn((_frame: EditorFrameSettings, _options?: { preview?: boolean; signal?: AbortSignal }) =>
        Promise.resolve()
      )
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => restoration.promise);
    const h = setup(apply);
    act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
    await flushFrame();
    if (action === 'cancel') {
      act(() => h.controls.previewFrameDraft(DEFAULT_EDITOR_FRAME_SETTINGS));
      await flushFrame();
    } else {
      h[action]();
    }
    expect(apply.mock.lastCall?.[0]).toEqual(
      normalizeEditorFrameSettings(DEFAULT_EDITOR_FRAME_SETTINGS)
    );
    expect(apply.mock.lastCall?.[1]).toMatchObject({ preview: true, quality: 'final' });
    expect(h.activity.mock.calls).toEqual([[true]]);
    await act(async () => restoration.resolve());
    expect(h.activity.mock.calls).toEqual([[true], [false]]);
    if (action !== 'unmount') h.unmount();
  }
);

it('does not accept a false commit and restores the prior accepted baseline once', async () => {
  const { reportEditorActionFailure } = await import('../../runtime/async-actions');
  vi.mocked(reportEditorActionFailure).mockClear();
  const commit = deferred<boolean>();
  const restoration = deferred<boolean>();
  const apply = vi
    .fn<TestFrameApply>(() => true)
    .mockImplementationOnce(() => true)
    .mockImplementationOnce(() => commit.promise)
    .mockImplementationOnce(() => restoration.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  act(() => h.controls.setFrameDraft((frame) => ({ ...frame, paddingTop: 80 })));
  await act(async () => commit.resolve(false));
  expect(apply.mock.lastCall?.[0].paddingTop).toBe(32);
  expect(apply.mock.lastCall?.[1]).toMatchObject({ preview: true, quality: 'final' });
  expect(h.activity.mock.calls).toEqual([[true]]);
  expect(reportEditorActionFailure).toHaveBeenCalled();
  expect(h.draft.paddingTop).toBe(80);
  await act(async () => restoration.resolve(true));
  expect(h.activity.mock.calls).toEqual([[true], [false]]);
  expect(apply).toHaveBeenCalledTimes(3);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingRight: 60 })));
  h.replace({ ...DEFAULT_EDITOR_FRAME_SETTINGS, paddingTop: 80 });
  expect(h.draft).toMatchObject({ paddingTop: 80, paddingRight: 32 });
  h.unmount();
});
it('restores accepted final quality after a false preview result', async () => {
  const restoration = deferred<boolean>();
  const apply = vi
    .fn<TestFrameApply>(() => true)
    .mockImplementationOnce(() => false)
    .mockImplementationOnce(() => restoration.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  expect(apply).toHaveBeenCalledTimes(2);
  expect(apply.mock.lastCall?.[0].paddingTop).toBe(32);
  expect(apply.mock.lastCall?.[1]).toMatchObject({ preview: true, quality: 'final' });
  expect(h.activity.mock.calls).toEqual([[true]]);
  await act(async () => restoration.resolve(true));
  expect(h.activity.mock.calls).toEqual([[true], [false]]);
  h.unmount();
});
it('keeps activity after a false restoration without an automatic retry loop', async () => {
  const apply = vi
    .fn<TestFrameApply>(() => true)
    .mockImplementationOnce(() => true)
    .mockImplementationOnce(() => false);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  h.deactivate();
  await act(async () => {});
  expect(h.activity.mock.calls).toEqual([[true]]);
  expect(apply).toHaveBeenCalledTimes(2);
  h.unmount();
  await act(async () => {});
});
it('rebases an authoritative edit while a false commit settles without restoring stale drafts', async () => {
  const commit = deferred<boolean>();
  const apply = vi
    .fn<TestFrameApply>(() => true)
    .mockImplementationOnce(() => true)
    .mockImplementationOnce(() => commit.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  act(() => h.controls.setFrameDraft((frame) => ({ ...frame, paddingTop: 80 })));
  h.replace({ ...DEFAULT_EDITOR_FRAME_SETTINGS, paddingTop: 12 });
  await act(async () => commit.resolve(false));
  expect(h.draft.paddingTop).toBe(12);
  expect(apply.mock.lastCall?.[0].paddingTop).toBe(12);
  expect(apply.mock.lastCall?.[1]).toMatchObject({ preview: true, quality: 'final' });
  expect(h.activity.mock.calls).toEqual([[true], [false]]);
  h.unmount();
});
it('does not report false unmounted work or release activity after false restoration', async () => {
  const { reportEditorActionFailure } = await import('../../runtime/async-actions');
  vi.mocked(reportEditorActionFailure).mockClear();
  const commit = deferred<boolean>();
  const apply = vi
    .fn<TestFrameApply>(() => false)
    .mockImplementationOnce(() => true)
    .mockImplementationOnce(() => commit.promise);
  const h = setup(apply);
  act(() => h.controls.previewFrameDraft((frame) => ({ ...frame, paddingTop: 70 })));
  await flushFrame();
  act(() => h.controls.setFrameDraft((frame) => ({ ...frame, paddingTop: 80 })));
  h.unmount();
  await act(async () => commit.resolve(false));
  expect(apply).toHaveBeenCalledTimes(3);
  expect(apply.mock.lastCall?.[0].paddingTop).toBe(32);
  expect(h.activity.mock.calls).toEqual([[true]]);
  expect(reportEditorActionFailure).not.toHaveBeenCalled();
});
