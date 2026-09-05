import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { VideoTrackKind } from '../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import { getSelectionMeta, WorkspaceSidebarHeader } from './view';

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
  expect(markup).toContain('videoEditor.timeline.trackKindPrimary');
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
