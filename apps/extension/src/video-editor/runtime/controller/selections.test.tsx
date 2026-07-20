import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import { useVideoEditorSelections, type VideoEditorSelections } from './selections';

function renderSelections(
  args: Parameters<typeof useVideoEditorSelections>
): VideoEditorSelections {
  let result: VideoEditorSelections | null = null;

  function Probe() {
    result = useVideoEditorSelections(...args);
    return null;
  }

  renderToStaticMarkup(<Probe />);
  if (result === null) {
    throw new Error('Selection probe did not render.');
  }
  return result;
}

describe('video editor selection derivation', () => {
  it('derives the selected track from the current project snapshot', () => {
    const project = createEmptyVideoProject('Selection test');
    const selectedTrack = project.tracks[0];
    if (!selectedTrack) {
      throw new Error('Expected the factory to create a track.');
    }

    expect(
      renderSelections([
        project,
        { kind: VideoEditorSelectionKind.TRACK, trackId: selectedTrack.id },
        null,
        selectedTrack.id,
      ])
    ).toMatchObject({
      selectedClip: null,
      selectedTrack,
      selection: { kind: VideoEditorSelectionKind.TRACK, trackId: selectedTrack.id },
    });
  });

  it('returns null derived entities for a stale selection after project teardown', () => {
    expect(
      renderSelections([
        null,
        { kind: VideoEditorSelectionKind.CURSOR_SEGMENT, sampleId: 'stale-sample' },
        'stale-clip',
        'stale-track',
      ])
    ).toEqual({
      selection: { kind: VideoEditorSelectionKind.CURSOR_SEGMENT, sampleId: 'stale-sample' },
      selectedActionEvent: null,
      selectedClip: null,
      selectedCursorSample: null,
      selectedMotionRegion: null,
      selectedObjectTrack: null,
      selectedTrack: null,
      selectedTransition: null,
    });
  });
});
