import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { createVideoProjectTrack } from '../../../../../features/video/project/factories/creation';
import { VideoTrackKind } from '../../../../../features/video/project/types';
import { TrackGeneralFields, TrackPanelDeleteButton } from './sections';

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
  expect(markup).toContain('videoEditor.timeline.trackKindPrimary');
  expect(markup).not.toContain(`>${VideoTrackKind.PRIMARY}<`);
  expect(markup).toContain('videoEditor.timeline.deleteTrackTitle');
  expect(markup).not.toContain('videoEditor.sidebar.subtitlePlacementLabel');
  expect(markup).not.toContain('type="range"');
});
