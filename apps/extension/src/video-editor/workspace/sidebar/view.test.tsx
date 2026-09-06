import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { VideoProjectTrackRole, VideoTrackKind } from '../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import { getSelectionMeta, WorkspaceSidebarHeader } from './view';

it.each([
  [VideoTrackKind.AUDIO, undefined, 'lucide-volume-2'],
  [VideoTrackKind.PRIMARY, VideoProjectTrackRole.CAMERA, 'lucide-camera'],
  [VideoTrackKind.PRIMARY, undefined, 'lucide-film'],
])('identifies selected %s / %s tracks by their media icon', (kind, role, icon) => {
  const track = {
    id: 'selected-track',
    kind,
    ...(role ? { role } : {}),
    isRoot: false,
    locked: false,
    name: 'Selected track',
    order: 1,
    visible: true,
  };
  const meta = getSelectionMeta(
    { kind: VideoEditorSelectionKind.TRACK, trackId: track.id },
    null,
    track
  );
  expect(renderToStaticMarkup(<>{meta.icon}</>)).toContain(icon);
  expect(meta.title).toBe(track.name);
});

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('keeps the inspector header focused on the selected object', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceSidebarHeader
      inspectorMode="selection"
      selectedTrack={{
        id: 'track-1',
        isRoot: true,
        kind: VideoTrackKind.PRIMARY,
        locked: false,
        name: 'Primary',
        order: 0,
        visible: true,
      }}
      selectionIcon={<span>icon</span>}
      selectionTitle="Свойства дорожки"
    />
  );

  expect(markup).toContain('data-ui="video-editor.workspace.sidebar-header-title-row"');
  expect(markup).not.toContain('data-ui="video-editor.workspace.sidebar-header-groups-row"');
  expect(markup).toContain('Свойства дорожки');
  expect(markup).not.toContain('videoEditor.sidebar.trackPrefix');
  expect(markup).not.toContain('videoEditor.sidebar.trackPrefix Primary');
});

it('resolves static and empty clip selection metadata through descriptor helpers', () => {
  expect(getSelectionMeta({ kind: VideoEditorSelectionKind.SCENE }, null).title).toBe(
    'videoEditor.sidebar.sceneProperties'
  );
  expect(
    getSelectionMeta({ kind: VideoEditorSelectionKind.MOTION_REGION, motionRegionId: 'm1' }, null)
      .label
  ).toBe('videoEditor.timeline.motionLane');
  expect(
    getSelectionMeta({ kind: VideoEditorSelectionKind.CLIP, clipId: 'clip-1' }, null).title
  ).toBe('videoEditor.sidebar.sceneProperties');
});

it('uses the selected track name as its inspector identity', () => {
  const selectedTrack = {
    id: 'track-1',
    isRoot: false,
    kind: VideoTrackKind.OVERLAY,
    locked: false,
    name: 'Callouts',
    order: 1,
    visible: true,
  };

  expect(
    getSelectionMeta(
      { kind: VideoEditorSelectionKind.TRACK, trackId: selectedTrack.id },
      null,
      selectedTrack
    )
  ).toMatchObject({ label: 'Callouts', title: 'Callouts' });
});
