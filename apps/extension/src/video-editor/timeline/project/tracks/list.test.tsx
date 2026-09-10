// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS } from '../../../persistence/track-panel';
import { buildTimelineTrackLayoutModel } from './layout';
import { ProjectTimelineTrackList } from './list';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import {
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoProjectTrackRole,
} from '../../../../features/video/project/types';

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
      item.textContent?.startsWith('videoEditor.timeline.tracksTitle') &&
      item.className.includes('h-[30px]')
  );

  expect(header?.className).toContain('h-[30px]');
  expect(header?.className).not.toContain('uppercase');
  expect(container?.textContent).toContain('videoEditor.timeline.historyLaneShort');
  expect(container?.textContent).not.toContain('videoEditor.timeline.motionLane');
  expect(container?.textContent).toContain('User custom video title');
  expect(container?.textContent).toContain('V1');
  expect(container?.textContent).not.toContain('O1');
});

it('omits the telemetry label row when the read-only telemetry lane is hidden', () => {
  const project = createEmptyVideoProject('Track list');

  renderTrackList(project, { showTelemetryLane: false });

  expect(container?.textContent).not.toContain('videoEditor.timeline.historyLaneShort');
});

it('keeps a single track rail without duplicate height or ordering controls', () => {
  const project = createEmptyVideoProject('Track list');

  renderTrackList(project, { showTelemetryLane: true });

  const scrollArea = container?.querySelector<HTMLElement>('[data-project-timeline-track-list]');

  expect(scrollArea?.className).toContain('overflow-x-hidden');
  expect(scrollArea?.style.gridTemplateColumns).toBe('');
  expect(
    container?.querySelectorAll('[data-ui="video-editor.timeline.icon-button"]').length
  ).toBeGreaterThan(0);
  expect(container?.querySelector('[data-ui="video-editor.timeline.track-height"]')).toBeNull();
});

it('keeps hidden utility lanes visible in the track rail with state controls', () => {
  const project = createEmptyVideoProject('Utility lane visibility');
  project.motionRegions = [createVideoProjectMotionRegion(project, 12)];
  project.actionEvents = [
    {
      id: 'click',
      kind: VideoProjectActionEventKind.CLICK,

      anchor: { kind: 'project', time: 12 },

      label: 'Click',
      point: { x: 10, y: 10 },
      data: {},
      presentation: { duration: 1, preset: VideoProjectActionPreset.CLICK_RIPPLE },
    },
  ];
  project.utilityLanes = {
    actions: { visible: false, locked: false },
    camera: { visible: false, locked: true },
  };

  renderTrackList(project, { showTelemetryLane: true });

  expect(container?.textContent).not.toContain('videoEditor.timeline.actionsLane');
  expect(container?.querySelector('[data-ui="video-editor.timeline.history-lane"]')).not.toBeNull();
  expect(container?.textContent).toContain('videoEditor.timeline.motionLane');
  expect(container?.querySelectorAll('[data-ui="timeline.utility-lane-state"]').length).toBe(4);
  expect(container?.querySelector('[data-ui="video-editor.timeline.add-zoom"]')).toBeNull();
});

it('keeps zoom creation out of the track rail', () => {
  const project = createEmptyVideoProject();
  project.motionRegions = [createVideoProjectMotionRegion(project, 0)];
  renderTrackList(project, { showTelemetryLane: true });
  expect(container?.querySelector('[data-ui="video-editor.timeline.add-zoom"]')).toBeNull();
  expect(container?.textContent).toContain('Z1');
  expect(container?.textContent).toContain('H1');
});

it('keeps persisted clip logical lanes inside one physical track row', () => {
  const project = createEmptyVideoProject('Logical lanes');
  project.tracks[0] = {
    ...project.tracks[0]!,
    logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
  };

  renderTrackList(project, { showTelemetryLane: false });

  expect(container?.querySelectorAll('[data-project-timeline-logical-lane-rail]')).toHaveLength(0);
  expect(
    buildTimelineTrackLayoutModel({
      project,
      trackHeightByTrackId: {},
      tracks: project.tracks,
    }).layoutByTrackId.get(project.tracks[0]!.id)?.logicalRows
  ).toBe(1);
  expect(container?.querySelector('[data-ui="video-editor.timeline.add-logical-lane"]')).toBeNull();
});

it('omits the unavailable cursor lane', () => {
  const project = createEmptyVideoProject('No cursor lane');

  renderTrackList(project, {
    cursorLaneVisible: false,
    showTelemetryLane: false,
  });

  expect(container?.textContent).not.toContain('videoEditor.timeline.cursorLane');
});

it('never creates a version-specific rail for effect instances', () => {
  const project = createEmptyVideoProject('Effects use physical clips');
  project.effectInstances = [createEffectInstance()];

  renderTrackList(project, { showTelemetryLane: false });

  expect(container?.textContent).not.toContain('EffectV1');
  expect(container?.textContent).toContain(project.tracks[0]!.name);
});

it('keeps track names and state controls readable in compact mode', () => {
  const project = createEmptyVideoProject('Compact rows');

  renderTrackList(project, { compactRows: true, showTelemetryLane: true });

  const scrollArea = container?.querySelector<HTMLElement>('[data-project-timeline-track-list]');

  expect(scrollArea?.style.gridTemplateColumns).toBe('');
  expect(container?.textContent).toContain(project.tracks[0]!.name);
  expect(container?.textContent).toContain('videoEditor.timeline.historyLaneShort');
  expect(container?.querySelectorAll('[data-ui="timeline.utility-lane-state"]')).toHaveLength(2);
  expect(
    container?.querySelectorAll('[data-ui="timeline.track-kind-icon"]').length
  ).toBeGreaterThan(0);
});

it('distinguishes a camera source track from the motion camera utility lane', () => {
  const project = createEmptyVideoProject('Camera source');
  const screenTrack = { ...project.tracks[0]!, id: 'screen-track', name: 'Screen' };
  project.tracks[0] = {
    ...project.tracks[0]!,
    name: 'Webcam',
    role: VideoProjectTrackRole.CAMERA,
  };
  project.tracks.push(screenTrack);

  renderTrackList(project, { showTelemetryLane: false });

  expect(container?.textContent).toContain('C1');
  expect(container?.textContent).toContain('V1');
  expect(container?.textContent).toContain('Webcam');
  expect(container?.querySelector('[data-camera-track-icon]')).not.toBeNull();
  expect(container?.textContent).not.toContain('videoEditor.timeline.motionLane');
});

it('numbers multiple explicit camera sources independently from video tracks', () => {
  const project = createEmptyVideoProject('Multiple cameras');
  project.tracks = [
    { ...project.tracks[0]!, name: 'Camera A', role: VideoProjectTrackRole.CAMERA },
    {
      ...project.tracks[0]!,
      id: 'camera-b',
      name: 'Camera B',
      order: 2,
      role: VideoProjectTrackRole.CAMERA,
    },
  ];

  renderTrackList(project, { showTelemetryLane: false });

  expect(container?.textContent).toContain('C1');
  expect(container?.textContent).toContain('C2');
});

function renderTrackList(
  project: ReturnType<typeof createEmptyVideoProject>,
  options: {
    compactRows?: boolean;
    hideTrackNames?: boolean;
    cursorLaneVisible?: boolean;
    showTelemetryLane: boolean;
    onAddMotionRegion?: () => void;
    onSelectMotionLane?: () => void;
    motionLaneSelected?: boolean;
  }
) {
  const trackPanelPrefs = createTrackPanelPrefs({
    compactRows: options.compactRows ?? false,
    hideTrackNames: options.hideTrackNames ?? false,
  });
  act(() => {
    root?.render(
      <ProjectTimelineTrackList
        onSelectMotionLane={options.onSelectMotionLane}
        motionLaneSelected={options.motionLaneSelected}
        canShowTelemetryLane={options.showTelemetryLane}
        cursorLaneVisible={options.cursorLaneVisible ?? true}
        project={project}
        selectedTrackId={project.tracks[0]?.id ?? null}
        showTelemetryLane={options.showTelemetryLane}
        trackLayoutModel={buildTimelineTrackLayoutModel({
          project,
          trackHeightByTrackId: {},
          tracks: project.tracks,
        })}
        trackListRef={{ current: null }}
        trackPanelPrefs={trackPanelPrefs}
        tracks={project.tracks}
        onAddTrack={vi.fn()}
        onClearUtilityLane={vi.fn()}
        onScroll={vi.fn()}
        onSelectTrack={vi.fn()}
        onToggleTrackLock={vi.fn()}
        onToggleTrackVisibility={vi.fn()}
        onToggleUtilityLaneLock={vi.fn()}
        onToggleUtilityLaneVisibility={vi.fn()}
      />
    );
  });
  return trackPanelPrefs;
}

function createTrackPanelPrefs(options: { compactRows: boolean; hideTrackNames: boolean }) {
  return {
    cursorLaneVisible: true,
    prefs: { ...DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS, ...options },
    telemetryLaneVisible: false,
    setCollapsedCursorLaneVisible: vi.fn(),
    setCollapsedTelemetryLaneVisible: vi.fn(),
    setCompactRows: vi.fn(),
    setHideTrackNames: vi.fn(),
    setFxCollapsed: () => undefined,
    setClipNamesHidden: vi.fn(),
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

it('routes compact rows and action history from the track header and disables unavailable cursor', () => {
  const project = createEmptyVideoProject('Tracks');
  const prefs = renderTrackList(project, { showTelemetryLane: true });
  const header = container!.querySelector(
    '[data-ui="video-editor.timeline.track-header-controls"]'
  )!;
  const button = (id: string) =>
    header.querySelector<HTMLButtonElement>(`[data-ui="video-editor.timeline.toolbar.${id}"]`)!;
  expect(button('compact-tracks').getAttribute('aria-pressed')).toBe('false');
  expect(button('cursor-lane')).toBeNull();
  act(() => {
    button('compact-tracks').click();
    button('telemetry-lane').click();
  });
  expect(prefs.setCompactRows).toHaveBeenCalledWith(true);
  expect(prefs.setCollapsedTelemetryLaneVisible).toHaveBeenCalledWith(
    !prefs.prefs.collapsedTelemetryLaneVisible
  );
  expect(prefs.setCollapsedCursorLaneVisible).not.toHaveBeenCalled();
});

it('exposes a separate selected Zoom lane button and keeps Add region independent', () => {
  const project = createEmptyVideoProject('Zoom lane');
  project.motionRegions = [createVideoProjectMotionRegion(project, 0)];
  const onSelectMotionLane = vi.fn();
  const onAddMotionRegion = vi.fn();
  renderTrackList(project, {
    showTelemetryLane: false,
    compactRows: true,
    motionLaneSelected: true,
    onSelectMotionLane,
    onAddMotionRegion,
  });
  const label = container!.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.timeline.motion-lane-select"]'
  )!;
  expect(label.getAttribute('aria-pressed')).toBe('true');
  act(() => label.click());
  expect(onSelectMotionLane).toHaveBeenCalledOnce();
  expect(container?.querySelector('[data-ui="video-editor.timeline.add-zoom"]')).toBeNull();
  expect(onAddMotionRegion).not.toHaveBeenCalled();
});

it('keeps destructive zoom cleanup in the inspector instead of the track header', () => {
  const project = createEmptyVideoProject('Zoom controls');
  project.motionRegions = [createVideoProjectMotionRegion(project, 0)];
  renderTrackList(project, { showTelemetryLane: false });
  expect(container?.querySelector('[data-ui="video-editor.timeline.add-zoom"]')).toBeNull();
  expect(
    container?.querySelector('[data-ui="video-editor.timeline.clear-utility-lane"]')
  ).toBeNull();
});

it('toggles track names independently of compact row heights', () => {
  const project = createEmptyVideoProject('Names');
  const prefs = renderTrackList(project, { compactRows: true, showTelemetryLane: true });
  const toggle = container?.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.timeline.toolbar.hide-track-names"]'
  );
  expect(toggle).not.toBeNull();
  act(() => toggle?.click());
  expect(prefs.setHideTrackNames).toHaveBeenCalledWith(true);
  expect(prefs.setCompactRows).not.toHaveBeenCalled();
  expect(
    container?.querySelector('[data-ui="video-editor.timeline.track-select"]')?.textContent
  ).toContain('V1');
});

it('keeps all four header controls available with either compact display option', () => {
  const project = createEmptyVideoProject('Compact rail');
  for (const [compactRows, hideTrackNames] of [
    [false, true],
    [true, false],
    [true, true],
  ] as const) {
    renderTrackList(project, { showTelemetryLane: true, compactRows, hideTrackNames });
    const header = container!.querySelector(
      '[data-ui="video-editor.timeline.track-header-controls"]'
    )!;
    expect(header.querySelectorAll('button')).toHaveLength(4);
    expect(
      header.querySelector('[data-ui="video-editor.timeline.toolbar.add-track"]')
    ).not.toBeNull();
    expect(
      container!.querySelector('[data-ui="video-editor.timeline.track-select"]')?.textContent
    ).toContain('V1');
    expect(
      container!.querySelector('[data-project-timeline-track-list]')?.querySelectorAll('button')
        .length
    ).toBeGreaterThanOrEqual(3);
  }
});

it('keeps auto processing out of the history track header', () => {
  const project = createEmptyVideoProject('History');
  renderTrackList(project, { showTelemetryLane: true, compactRows: true, hideTrackNames: true });
  expect(document.querySelector('[data-ui="video-editor.auto.open"]')).toBeNull();
});
