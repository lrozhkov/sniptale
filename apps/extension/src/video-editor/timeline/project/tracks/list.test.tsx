// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS } from '../../../persistence/track-panel';
import { buildTimelineTrackLayoutModel } from './layout';
import { ProjectTimelineTrackList } from './list';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('renders a compact track header together with track rows and effect lanes', () => {
  const project = createEmptyVideoProject('Track list');
  project.tracks[0]!.name = 'User custom video title';

  renderTrackList(project, { showTelemetryLane: true });

  const header = Array.from(container?.querySelectorAll('div') ?? []).find(
    (item) =>
      item.textContent === 'videoEditor.timeline.tracksTitle' && item.className.includes('h-[30px]')
  );

  expect(header?.className).toContain('h-[30px]');
  expect(header?.className).not.toContain('uppercase');
  expect(container?.textContent).toContain('videoEditor.timeline.telemetryLane');
  expect(container?.textContent).toContain('videoEditor.timeline.motionLane');
  expect(container?.textContent).toContain('videoEditor.timeline.trackKindPrimary');
  expect(container?.textContent).not.toContain('User custom video title');
});

it('omits the telemetry label row when the read-only telemetry lane is hidden', () => {
  const project = createEmptyVideoProject('Track list');

  renderTrackList(project, { showTelemetryLane: false });

  expect(container?.textContent).not.toContain('videoEditor.timeline.telemetryLane');
});

it('keeps the expanded track list within the parent width without horizontal overflow', () => {
  const project = createEmptyVideoProject('Track list');

  renderTrackList(project, { showTelemetryLane: true, panelExpanded: true });

  const scrollArea = container?.querySelector<HTMLElement>('[data-project-timeline-track-list]');

  expect(scrollArea?.className).toContain('overflow-x-hidden');
  expect(scrollArea?.style.gridTemplateColumns).toBe('minmax(0, 1fr) minmax(0, 1fr)');
  expect(
    container?.querySelectorAll('[data-ui="video-editor.timeline.icon-button"]').length
  ).toBeGreaterThan(0);
  expect(
    container?.querySelector<HTMLInputElement>('[data-ui="video-editor.timeline.track-height"]')
      ?.className
  ).toContain('sniptale-range');
});

it('keeps hidden utility lanes visible in the track rail with state controls', () => {
  const project = createEmptyVideoProject('Utility lane visibility');
  project.utilityLanes = {
    actions: { visible: false, locked: false },
    camera: { visible: false, locked: true },
  };

  renderTrackList(project, { showTelemetryLane: true });

  expect(container?.textContent).toContain('videoEditor.timeline.actionsLane');
  expect(container?.textContent).toContain('videoEditor.timeline.motionLane');
  expect(container?.querySelectorAll('[data-ui="timeline.utility-lane-state"]').length).toBe(4);
});

it('shows explicit clip logical lane rails without text labels or a separate add-line button', () => {
  const project = createEmptyVideoProject('Logical lanes');
  project.tracks[0] = {
    ...project.tracks[0]!,
    logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
  };

  renderTrackList(project, { showTelemetryLane: false });

  expect(container?.textContent).not.toContain('videoEditor.timeline.logicalLaneLabel');
  expect(container?.querySelectorAll('[data-project-timeline-logical-lane-rail]')).toHaveLength(2);
  expect(container?.querySelector('[data-ui="video-editor.timeline.add-logical-lane"]')).toBeNull();
});

it('never creates a version-specific rail for effect instances', () => {
  const project = createEmptyVideoProject('Effects use physical clips');
  project.effectInstances = [createEffectInstance()];

  renderTrackList(project, { showTelemetryLane: false });

  expect(container?.textContent).not.toContain('EffectV1');
  expect(container?.textContent).toContain('videoEditor.timeline.trackKindPrimary');
});

it('hides row text in compact track panel mode', () => {
  const project = createEmptyVideoProject('Compact rows');

  renderTrackList(project, { compactRows: true, panelExpanded: true, showTelemetryLane: true });

  const scrollArea = container?.querySelector<HTMLElement>('[data-project-timeline-track-list]');

  expect(scrollArea?.style.gridTemplateColumns).toBe('minmax(0, 1fr)');
  expect(container?.textContent).not.toContain('videoEditor.timeline.trackKindPrimary');
  expect(container?.textContent).not.toContain('videoEditor.timeline.telemetryLane');
  expect(container?.querySelectorAll('[data-ui="timeline.utility-lane-state"]')).toHaveLength(0);
  expect(
    container?.querySelectorAll('[data-ui="timeline.track-kind-icon"]').length
  ).toBeGreaterThan(0);
});

function renderTrackList(
  project: ReturnType<typeof createEmptyVideoProject>,
  options: {
    compactRows?: boolean;
    panelExpanded?: boolean;
    showTelemetryLane: boolean;
    onAddTrackLogicalLane?: (trackId: string) => void;
  }
) {
  act(() => {
    root?.render(
      <ProjectTimelineTrackList
        cursorLaneVisible={true}
        project={project}
        selectedTrackId={project.tracks[0]?.id ?? null}
        showTelemetryLane={options.showTelemetryLane}
        trackLayoutModel={buildTimelineTrackLayoutModel({
          project,
          trackHeightByTrackId: {},
          tracks: project.tracks,
        })}
        trackListRef={{ current: null }}
        trackPanelPrefs={createTrackPanelPrefs({
          compactRows: options.compactRows ?? false,
          panelExpanded: options.panelExpanded ?? false,
        })}
        tracks={project.tracks}
        onClearUtilityLane={vi.fn()}
        onAddTrackLogicalLane={options.onAddTrackLogicalLane ?? vi.fn()}
        onDeleteTrack={vi.fn()}
        onMoveTrack={vi.fn()}
        onScroll={vi.fn()}
        onSelectTrack={vi.fn()}
        onToggleTrackLock={vi.fn()}
        onToggleTrackVisibility={vi.fn()}
        onToggleUtilityLaneLock={vi.fn()}
        onToggleUtilityLaneVisibility={vi.fn()}
      />
    );
  });
}

function createTrackPanelPrefs(options: { compactRows: boolean; panelExpanded: boolean }) {
  return {
    cursorLaneVisible: true,
    prefs: { ...DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS, ...options },
    telemetryLaneVisible: false,
    setCollapsedCursorLaneVisible: vi.fn(),
    setCollapsedTelemetryLaneVisible: vi.fn(),
    setCompactRows: vi.fn(),
    setPanelExpanded: vi.fn(),
    setTrackHeight: vi.fn(),
  };
}

function createEffectInstance() {
  return {
    controls: {},
    duration: 2,
    enabled: true,
    id: 'effect-v1-1',
    kind: 'standalone' as const,
    playbackRate: 1,
    snapshotId: 'effect:missing-test-snapshot',
    startTime: 0,
    target: { kind: 'scene' as const },
  };
}
