import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { VideoTrackKind } from '../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import { getSelectionMeta, WorkspaceSidebarHeader } from './view';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

it('renders the inspector group switch below the title row', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceSidebarHeader
      inspectorMode="selection"
      inspectorHeaderSlot={{
        activeGroupId: 'canvas',
        ariaLabel: 'Groups',
        groups: [
          { id: 'info', label: 'Сведения', content: null },
          { id: 'canvas', label: 'Холст', content: null },
          { id: 'background', label: 'Фон', content: null },
        ],
        onChange: vi.fn(),
      }}
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
  expect(markup).toContain('data-ui="video-editor.workspace.sidebar-header-groups-row"');
  expect(markup).toContain('videoEditor.timeline.trackKindPrimary');
  expect(markup).not.toContain('videoEditor.sidebar.trackPrefix Primary');
  expect(markup).toContain('Сведения');
  expect(markup).toContain('Холст');
  expect(markup).toContain('Фон');
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
