// @vitest-environment jsdom
import { VideoTrackKind } from '../../../features/video/project/types';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVideoEditorStore } from '../../state/store';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import { DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS } from '../../persistence/track-panel';
import { WorkspaceTrackPresentation, useWorkspaceTrackPresentation } from './track-presentation';
import { TrackLayoutFields } from '../sidebar/selection/track/sections';

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('../../persistence/track-panel', async (original) => ({
  ...(await original<typeof import('../../persistence/track-panel')>()),
  loadVideoEditorTrackPanelPrefs: mocks.load,
  saveVideoEditorTrackPanelPrefs: mocks.save,
}));
vi.mock('../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useVideoEditorStore.setState({ ...useVideoEditorStore.getInitialState() }, true);
  mocks.load.mockReset().mockResolvedValue(DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS);
  mocks.save.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('shares restored heights with the track inspector and routes order to the existing command', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const project = createEmptyVideoProject('Track presentation');
  const track = createVideoProjectTrack('Overlay', 2, VideoTrackKind.PRIMARY);
  project.tracks.push(track);
  useVideoEditorStore.getState().setProject(project);
  const move = vi.spyOn(useVideoEditorStore.getState(), 'moveTrack');
  mocks.load.mockResolvedValue({
    ...DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS,
    trackHeightByTrackId: { [track.id]: 1.5 },
  });
  function TimelineConsumer() {
    return (
      <output>
        {useWorkspaceTrackPresentation()?.panelPrefs.prefs.trackHeightByTrackId[track.id]}
      </output>
    );
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <WorkspaceTrackPresentation>
          <TrackLayoutFields track={track} />
          <TimelineConsumer />
        </WorkspaceTrackPresentation>
      )
    );
    const input = container.querySelector<HTMLInputElement>('input')!;
    expect(input.value).toBe('1.5');
    expect(container.querySelector('output')?.textContent).toBe('1.5');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(input, '2');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(container.querySelector('output')?.textContent).toBe('2');
    expect(mocks.save).toHaveBeenLastCalledWith(
      project.id,
      expect.objectContaining({ trackHeightByTrackId: { [track.id]: 2 } })
    );
    const down = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('videoEditor.timeline.moveTrackUp')
    )!;
    act(() => down.click());
    expect(move).toHaveBeenCalledWith(track.id, 'up');
    expect(mocks.load).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
  }
});

it('keeps the empty workspace available without starting project preference persistence', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useVideoEditorStore.setState({ project: null });
  const container = document.createElement('div');
  const root = createRoot(container);
  function EmptyWorkspace() {
    const presentation = useWorkspaceTrackPresentation();
    return <button disabled={presentation !== null}>Import material</button>;
  }
  try {
    await act(async () =>
      root.render(
        <WorkspaceTrackPresentation>
          <EmptyWorkspace />
        </WorkspaceTrackPresentation>
      )
    );
    expect(container.querySelector('button')?.disabled).toBe(false);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
  }
});

it('keeps a manually entered fractional height consistent through real preference save and reload', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const storage: Record<string, unknown> = {};
  const { browserStorage } =
    await import('../../../composition/persistence/infrastructure/browser-storage');
  const get = vi.spyOn(browserStorage.local, 'get').mockImplementation(async () => storage);
  const set = vi.spyOn(browserStorage.local, 'set').mockImplementation(async (values) => {
    Object.assign(storage, values);
  });
  const persistence = await vi.importActual<typeof import('../../persistence/track-panel')>(
    '../../persistence/track-panel'
  );
  mocks.load.mockImplementation(persistence.loadVideoEditorTrackPanelPrefs);
  mocks.save.mockImplementation(persistence.saveVideoEditorTrackPanelPrefs);
  const project = createEmptyVideoProject('Fractional height');
  const track = project.tracks[0]!;
  useVideoEditorStore.getState().setProject(project);
  function TimelineConsumer() {
    return (
      <output>
        {useWorkspaceTrackPresentation()?.panelPrefs.prefs.trackHeightByTrackId[track.id] ?? 1}
      </output>
    );
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = () =>
    root.render(
      <WorkspaceTrackPresentation>
        <TrackLayoutFields track={track} />
        <TimelineConsumer />
      </WorkspaceTrackPresentation>
    );
  try {
    await act(async () => render());
    const input = container.querySelector<HTMLInputElement>('input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(input, '1.1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    );
    expect(container.querySelector('output')?.textContent).toBe('1');
    expect(input.value).toBe('1');
    expect(mocks.save).toHaveBeenLastCalledWith(
      project.id,
      expect.objectContaining({ trackHeightByTrackId: { [track.id]: 1 } })
    );
    await act(async () => root.render(null));
    await act(async () => render());
    expect(container.querySelector<HTMLInputElement>('input')?.value).toBe('1');
    expect(container.querySelector('output')?.textContent).toBe('1');
    expect(mocks.load).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    get.mockRestore();
    set.mockRestore();
  }
});

it('keeps the actual track context consumer idle across time-only store updates', async () => {
  const project = createEmptyVideoProject('Clock isolation');
  project.duration = 10;
  useVideoEditorStore.setState({ project });
  const rendered = vi.fn();
  function Consumer() {
    rendered();
    const presentation = useWorkspaceTrackPresentation();
    return <output>{presentation?.tracks.map((track) => track.id).join(',')}</output>;
  }
  const container = document.createElement('div'),
    root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <WorkspaceTrackPresentation>
          <Consumer />
        </WorkspaceTrackPresentation>
      )
    );
    const before = rendered.mock.calls.length;
    for (let frame = 1; frame <= 8; frame++)
      act(() => useVideoEditorStore.getState().setCurrentTime(frame / 60));
    expect(useVideoEditorStore.getState().currentTime).toBe(8 / 60);
    expect(rendered).toHaveBeenCalledTimes(before);
  } finally {
    act(() => root.unmount());
  }
});

it('publishes real order and preference changes and resets context after project removal and replacement', async () => {
  const project = createEmptyVideoProject('First project');
  const extra = createVideoProjectTrack('Overlay', 2, VideoTrackKind.PRIMARY);
  project.tracks.push(extra);
  useVideoEditorStore.getState().setProject(project);
  const observed: { current: ReturnType<typeof useWorkspaceTrackPresentation> } = { current: null };
  const read = () => {
    const presentation = observed.current;
    if (!presentation) throw new Error('Expected track presentation');
    return presentation;
  };
  function Consumer() {
    const presentation = useWorkspaceTrackPresentation();
    observed.current = presentation;
    return (
      <output>
        {presentation
          ? presentation.tracks
              .map(
                (track) =>
                  `${track.id}:${presentation.panelPrefs.prefs.trackHeightByTrackId[track.id] ?? 1}`
              )
              .join(',')
          : 'empty'}
      </output>
    );
  }
  const container = document.createElement('div'),
    root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <WorkspaceTrackPresentation>
          <Consumer />
        </WorkspaceTrackPresentation>
      )
    );
    const before = read().tracks.map((track) => track.id);
    act(() => read().onMoveTrack(extra.id, 'up'));
    expect(read().tracks.map((track) => track.id)).not.toEqual(before);
    expect(read().tracks.map((track) => track.id)).toEqual(
      useVideoEditorStore
        .getState()
        .project!.tracks.toSorted((a, b) => a.order - b.order)
        .map((track) => track.id)
    );
    act(() => read().panelPrefs.setTrackHeight(extra.id, 2));
    expect(read().panelPrefs.prefs.trackHeightByTrackId[extra.id]).toBe(2);
    act(() => useVideoEditorStore.getState().selectTrack(extra.id));
    expect(read().panelPrefs.prefs.trackHeightByTrackId[extra.id]).toBe(2);
    await act(async () => useVideoEditorStore.setState({ project: null }));
    expect(observed.current).toBeNull();
    expect(container.querySelector('output')?.textContent).toBe('empty');
    const replacement = createEmptyVideoProject('Replacement');
    await act(async () => useVideoEditorStore.getState().setProject(replacement));
    expect(read().tracks.map((track) => track.id)).toEqual(
      replacement.tracks.map((track) => track.id)
    );
    expect(read().panelPrefs.prefs.trackHeightByTrackId[extra.id]).toBeUndefined();
    expect(mocks.load.mock.calls.map(([projectId]) => projectId)).toEqual([
      project.id,
      replacement.id,
    ]);
  } finally {
    act(() => root.unmount());
  }
});
