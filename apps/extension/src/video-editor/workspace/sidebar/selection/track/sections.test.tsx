// @vitest-environment jsdom
import { useVideoEditorStore } from '../../../../state/store';
import { InspectorLayout } from '../../../../../ui/compact-inspector-controls/layout';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../../../features/video/project/factories/creation';
import { VideoTrackKind } from '../../../../../features/video/project/types';
import { TrackAudioFields, TrackGeneralFields, TrackPanelDeleteButton } from './sections';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('renders only general supported-track metadata and the explicit delete action', () => {
  const track = createVideoProjectTrack('Overlay', 1, VideoTrackKind.PRIMARY);
  const markup = renderToStaticMarkup(
    <>
      <TrackGeneralFields selectedTrack={track} />
      <TrackPanelDeleteButton canDeleteTrack trackId={track.id} onDeleteTrack={vi.fn()} />
    </>
  );

  expect(markup).toContain('videoEditor.sidebar.trackNameLabel');
  expect(markup).not.toContain('videoEditor.timeline.trackKindPrimary');
  expect(markup).not.toContain(`>${VideoTrackKind.PRIMARY}<`);
  expect(markup).toContain('videoEditor.timeline.deleteTrackTitle');
  expect(markup).not.toContain('videoEditor.sidebar.subtitlePlacementLabel');
  expect(markup).not.toContain('type="range"');
});

let root: Root;
let host: HTMLDivElement;
let original: ReturnType<typeof useVideoEditorStore.getState>;
beforeEach(() => {
  original = useVideoEditorStore.getState();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useVideoEditorStore.setState(original, true);
  vi.unstubAllGlobals();
});
function mountTrack() {
  const project = createEmptyVideoProject('Track controls');
  const track = createVideoProjectTrack('Music', 1, 'AUDIO');
  project.tracks.push(track);
  useVideoEditorStore.getState().setProject(project);
  return { project: useVideoEditorStore.getState().project!, track };
}
function commitVolume(value: string) {
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="videoEditor.sidebar.trackVolumeLabel"]'
  )!;
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  return input;
}
it('edits the track master with one history change and restores it through Undo and Redo', () => {
  const { track } = mountTrack();
  function Harness() {
    const project = useVideoEditorStore((state) => state.project)!;
    return (
      <InspectorLayout>
        <TrackAudioFields
          project={project}
          selectedTrack={project.tracks.find((item) => item.id === track.id)!}
        />
      </InspectorLayout>
    );
  }
  act(() => root.render(<Harness />));
  expect(host.querySelector('input')?.value).toBe('100');
  commitVolume('150');
  expect(
    useVideoEditorStore.getState().project!.tracks.find((item) => item.id === track.id)?.audioVolume
  ).toBe(1.5);
  expect(useVideoEditorStore.getState().project!.version).toBe(7);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(host.querySelector('input')?.value).toBe('100');
  act(() => useVideoEditorStore.getState().redoProject());
  expect(host.querySelector('input')?.value).toBe('150');
});
it.each(['parallel', 'removed', 'recreated'] as const)(
  'refuses stale track controls after %s replacement and accepts only a fresh retry',
  (kind) => {
    const { project, track } = mountTrack();
    act(() =>
      root.render(
        <InspectorLayout>
          <TrackAudioFields project={project} selectedTrack={track} />
        </InspectorLayout>
      )
    );
    const replacement = {
      ...project,
      name: 'Current replacement',
      createdAt: project.createdAt + (kind === 'recreated' ? 1 : 0),
      tracks:
        kind === 'removed'
          ? project.tracks.filter((item) => item.id !== track.id)
          : project.tracks.map((item) =>
              item.id === track.id ? { ...item, audioVolume: 0.5 } : item
            ),
    };
    act(() => {
      const store = useVideoEditorStore.getState();
      if (kind === 'recreated') store.setProject(replacement);
      else store.updateProject(() => replacement);
    });
    const current = useVideoEditorStore.getState().project;
    commitVolume('150');
    expect(useVideoEditorStore.getState().project).toBe(current);
    const fresh = {
      ...replacement,
      tracks: project.tracks.map((item) =>
        item.id === track.id ? { ...track, audioVolume: 0.5 } : item
      ),
    };
    act(() => useVideoEditorStore.getState().setProject(fresh));
    const latest = useVideoEditorStore.getState().project!;
    act(() =>
      root.render(
        <InspectorLayout>
          <TrackAudioFields
            project={latest}
            selectedTrack={latest.tracks.find((item) => item.id === track.id)!}
          />
        </InspectorLayout>
      )
    );
    commitVolume('150');
    expect(
      useVideoEditorStore.getState().project!.tracks.find((item) => item.id === track.id)
        ?.audioVolume
    ).toBe(1.5);
  }
);
it('keeps the track master disabled when the track is locked', () => {
  const { project, track } = mountTrack();
  track.locked = true;
  act(() =>
    root.render(
      <InspectorLayout>
        <TrackAudioFields project={project} selectedTrack={track} />
      </InspectorLayout>
    )
  );
  expect(host.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
});
