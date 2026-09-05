import { VideoTrackKind } from '../../../features/video/project/types';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import { DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS } from '../../persistence/track-panel';
import { WorkspaceTrackPresentation, useWorkspaceTrackPresentation } from './track-presentation';
import { TrackLayoutFields } from '../sidebar/selection/track/sections';

const mocks = vi.hoisted(() => ({ controller: null as unknown, load: vi.fn(), save: vi.fn() }));
vi.mock('../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/composition/hooks')>()),
  useVideoEditorTimelineController: () => mocks.controller,
}));
vi.mock('../../persistence/track-panel', async (original) => ({
  ...(await original<typeof import('../../persistence/track-panel')>()),
  loadVideoEditorTrackPanelPrefs: mocks.load,
  saveVideoEditorTrackPanelPrefs: mocks.save,
}));
vi.mock('../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('shares restored heights with the track inspector and routes order to the existing command', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const project = createEmptyVideoProject('Track presentation');
  const track = createVideoProjectTrack('Overlay', 2, VideoTrackKind.OVERLAY);
  project.tracks.push(track);
  const move = vi.fn();
  mocks.controller = { state: { project }, actions: { onMoveTrack: move } };
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
  mocks.controller = null;
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
  mocks.controller = { state: { project }, actions: { onMoveTrack: vi.fn() } };
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
