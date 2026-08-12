import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS } from '../../../persistence/track-panel';
import { buildTimelineTrackLayoutModel } from '../tracks/layout';
import { ProjectTimelineExpandedRows } from './index';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('renders optional expanded telemetry and cursor controls only when available', () => {
  const hiddenMarkup = renderExpandedRows(false, false);
  expect(hiddenMarkup).not.toContain('videoEditor.timeline.telemetryLane');
  expect(hiddenMarkup).not.toContain('videoEditor.timeline.cursorLane');

  const visibleMarkup = renderExpandedRows(true, true);
  expect(visibleMarkup).toContain('videoEditor.timeline.telemetryLane');
  expect(visibleMarkup).toContain('videoEditor.timeline.cursorLane');
});

function renderExpandedRows(cursorLaneVisible: boolean, showTelemetryLane: boolean) {
  const project = createEmptyVideoProject('Expanded rows');
  return renderToStaticMarkup(
    <ProjectTimelineExpandedRows
      cursorLaneVisible={cursorLaneVisible}
      onClearUtilityLane={vi.fn()}
      onDeleteTrack={vi.fn()}
      onMoveTrack={vi.fn()}
      onToggleUtilityLaneLock={vi.fn()}
      onToggleUtilityLaneVisibility={vi.fn()}
      project={project}
      showTelemetryLane={showTelemetryLane}
      trackLayoutModel={buildTimelineTrackLayoutModel({
        project,
        trackHeightByTrackId: {},
        tracks: project.tracks,
      })}
      trackPanelPrefs={createPanelPrefs()}
      tracks={project.tracks}
    />
  );
}

function createPanelPrefs() {
  return {
    cursorLaneVisible: true,
    prefs: DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS,
    setCollapsedCursorLaneVisible: vi.fn(),
    setCollapsedTelemetryLaneVisible: vi.fn(),
    setCompactRows: vi.fn(),
    setPanelExpanded: vi.fn(),
    setTrackHeight: vi.fn(),
    telemetryLaneVisible: true,
  };
}
