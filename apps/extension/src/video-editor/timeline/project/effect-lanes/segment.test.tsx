// @vitest-environment jsdom
import { useProjectTimelineEffectInteractions } from './interactions';
import { ProjectTimelineTelemetryLane } from './telemetry-lane';
import { ProjectTimelineEffectCanvasRows } from './utility-lanes';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { VideoTemporalEasing } from '../../../../features/video/project/types';

it('adds a framing connection from the gap and selects the connection independently', () => {
  const project = createEmptyVideoProject();
  project.duration = 8;
  const first = { ...createVideoProjectMotionRegion(project, 0), id: 'first', duration: 2 };
  const second = { ...createVideoProjectMotionRegion(project, 4), id: 'second', duration: 2 };
  project.motionRegions = [first, second];
  const props = {
    project,
    pixelsPerSecond: 100,
    selectedEffectSelection: null,
    onBeginRangeSelection: vi.fn(),
    onBeginEffectInteraction: vi.fn(),

    onResizeMotionRegion: vi.fn(),
    onConnectMotionRegions: vi.fn(),
    onSelectMotionRegion: vi.fn(),
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  const gap = () =>
    container.querySelector<HTMLElement>('[data-ui="video-editor.timeline.framing-connection"]')!;
  const button = () =>
    container.querySelector<HTMLButtonElement>(
      '[data-ui="video-editor.timeline.add-framing-connection"]'
    )!;
  try {
    act(() => root.render(<ProjectTimelineEffectCanvasRows {...props} />));
    expect(gap().style.left).toBe('200px');
    expect(gap().style.width).toBe('200px');
    act(() => button().click());
    expect(props.onConnectMotionRegions).toHaveBeenCalledWith('first', 'second');
    expect(props.onBeginRangeSelection).not.toHaveBeenCalled();
    project.motionRegions[1] = {
      ...second,
      incomingConnection: { fromRegionId: 'first', easing: VideoTemporalEasing.LINEAR },
    };
    act(() =>
      root.render(
        <ProjectTimelineEffectCanvasRows
          {...props}
          selection={{ kind: 'motion-connection', motionRegionId: 'second' }}
        />
      )
    );
    expect(gap().getAttribute('aria-pressed')).toBe('true');
    act(() => gap().click());
    expect(props.onSelectMotionRegion).toHaveBeenCalledWith('second', 'connection');
    project.utilityLanes = {
      actions: { visible: true, locked: false },
      camera: { visible: true, locked: true },
    };
    project.motionRegions = [first, second];
    act(() => root.render(<ProjectTimelineEffectCanvasRows {...props} />));
    expect(button().disabled).toBe(true);
  } finally {
    act(() => root.unmount());
  }
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createTimelineProjection } from '../interaction-state/projection';
import { ProjectTimelineEffectSegment, TimelineEffectDraftContext } from './segment';
import { ProjectTimelineCursorLane } from './cursor-lane';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createVideoProjectCursorTrack } from '../../../../features/video/project/defaults';
import {
  VideoCursorCaptureMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
} from '../../../../features/video/project/types';

it('clips a long effect without inventing resize handles at viewport boundaries', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const projection = createTimelineProjection({
    extentSeconds: 86400,
    pixelsPerSecond: 23040,
    viewportWidth: 1000,
    startTime: 43200,
  });
  const props = {
    segmentId: 'test-segment',
    className: '',
    isSelected: false,
    label: 'Zoom',
    startTime: 0,
    endTime: 86400,
    pixelsPerSecond: 23040,
    projection,
    onBeginEffectInteraction: vi.fn(),
    onBeginTrimStartInteraction: vi.fn(),
    onBeginTrimEndInteraction: vi.fn(),
  };
  try {
    act(() => root.render(<ProjectTimelineEffectSegment {...props} />));
    expect(container.querySelector('[aria-label="Zoom"]')).not.toBeNull();
    const geometry = container.querySelector('div');
    expect(parseFloat(geometry?.style.width ?? '')).toBeCloseTo(1240, 4);
    expect(container.querySelector('[aria-label="Zoom:resize-start"]')).toBeNull();
    expect(container.querySelector('[aria-label="Zoom:resize-end"]')).toBeNull();
    act(() => root.render(<ProjectTimelineEffectSegment {...props} endTime={1} />));
    expect(container.childElementCount).toBe(0);
  } finally {
    act(() => root.unmount());
  }
});

it('selects the cursor sample under the pointer after clipping the beginning of its merged segment', () => {
  const project = createEmptyVideoProject('Cursor');
  project.duration = 86400;
  project.cursorTrack = {
    ...createVideoProjectCursorTrack(VideoCursorCaptureMode.SEPARATE),
    samples: [
      { id: 'early', time: 0, visible: true, x: 10, y: 10 },
      { id: 'late', time: 43200, visible: true, x: 20, y: 20 },
      { id: 'terminal', time: 86400, visible: true, x: 30, y: 30 },
    ],
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  const onBeginEffectInteraction = vi.fn();
  try {
    act(() =>
      root.render(
        <ProjectTimelineCursorLane
          project={project}
          selectedEffectSelection={null}
          pixelsPerSecond={280}
          projection={createTimelineProjection({
            extentSeconds: 86400,
            pixelsPerSecond: 280,
            viewportWidth: 1000,
            startTime: 43200,
          })}
          onBeginEffectInteraction={onBeginEffectInteraction}
        />
      )
    );
    const button = container.querySelector('[data-timeline-effect-segment="early"] button');
    expect(button).not.toBeNull();
    // jsdom reports left=0 for the clipped button; 121px includes the 120px overscan.
    act(() =>
      button?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 121 }))
    );
    expect(onBeginEffectInteraction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sampleId: 'late' })
    );
  } finally {
    act(() => root.unmount());
  }
});

it('renders proposed effect timing and restores its original geometry when the draft clears', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const props = {
    segmentId: 'zoom-1',
    className: '',
    isSelected: true,
    label: 'Zoom',
    startTime: 2,
    endTime: 5,
    pixelsPerSecond: 100,
    onBeginEffectInteraction: vi.fn(),
  };
  try {
    act(() =>
      root.render(
        <TimelineEffectDraftContext.Provider
          value={{ segmentId: 'zoom-1', startTime: 4, duration: 2 }}
        >
          <ProjectTimelineEffectSegment {...props} />
        </TimelineEffectDraftContext.Provider>
      )
    );
    const draft = container.querySelector<HTMLElement>('[data-timeline-effect-draft]');
    expect(draft?.style.left).toBe('400px');
    expect(draft?.style.width).toBe('200px');
    act(() =>
      root.render(
        <TimelineEffectDraftContext.Provider value={null}>
          <ProjectTimelineEffectSegment {...props} />
        </TimelineEffectDraftContext.Provider>
      )
    );
    expect(container.querySelector('[data-timeline-effect-draft]')).toBeNull();
    const restored = container.querySelector<HTMLElement>('[data-timeline-effect-segment]');
    expect(restored?.style.left).toBe('200px');
    expect(restored?.style.width).toBe('300px');
  } finally {
    act(() => root.unmount());
  }
});

function createDraftSemanticsProject() {
  const project = createEmptyVideoProject('Draft semantics');
  project.duration = 10;
  project.cursorTrack = {
    ...createVideoProjectCursorTrack(VideoCursorCaptureMode.SEPARATE),
    samples: [
      { id: 'c0', time: 0, visible: true, x: 0, y: 0 },
      { id: 'c2', time: 2, visible: true, x: 10, y: 10 },
      { id: 'c4', time: 4, visible: true, x: 20, y: 20 },
      { id: 'c6', time: 6, visible: false, x: 30, y: 30 },
    ],
  };
  project.actionEvents = [
    {
      id: 'a',
      anchor: { kind: 'project', time: 2 },

      data: {},
      label: 'Click',
      kind: VideoProjectActionEventKind.CLICK,

      point: { x: 10, y: 20 },
      presentation: { duration: 0.4, preset: VideoProjectActionPreset.CLICK_RIPPLE },
    },
  ];
  return { ...project, cursorTrack: project.cursorTrack };
}

function EffectLaneHarness({
  project,
  cursorMove,

  historyTransaction,
}: {
  project: ReturnType<typeof createEmptyVideoProject>;
  cursorMove: (
    sampleId: string,
    nextSampleId: string | null,
    startTime: number,
    endTime: number | null
  ) => void;

  historyTransaction: {
    beginProjectHistoryTransaction: () => symbol;
    endProjectHistoryTransaction: (lease: symbol) => void;
    isProjectHistoryTransactionCurrent: (lease: symbol) => boolean;
  };
}) {
  const state = useProjectTimelineEffectInteractions({
    project,
    pixelsPerSecond: 100,
    magnetEnabled: false,
    historyTransaction,

    onMoveCursorSegment: cursorMove,

    onMoveMotionRegion: vi.fn(),
    onMoveTransitionSegment: vi.fn(),
    onResizeMotionRegion: vi.fn(),
    onUpdateEffectInstance: vi.fn(),
  });
  return (
    <TimelineEffectDraftContext.Provider value={state.effectDragDraft}>
      <ProjectTimelineCursorLane
        project={project}
        pixelsPerSecond={100}
        selectedEffectSelection={null}
        onBeginEffectInteraction={state.beginEffectInteraction}
      />
    </TimelineEffectDraftContext.Provider>
  );
}

it('keeps cursor draft geometry equal to composed commit and restores on Escape', () => {
  for (const finish of ['commit', 'cancel']) {
    let project = createDraftSemanticsProject();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const cursorMove = vi.fn();

    const lease = Symbol('draft');
    const historyTransaction = {
      beginProjectHistoryTransaction: () => lease,
      endProjectHistoryTransaction: vi.fn(),
      isProjectHistoryTransactionCurrent: () => true,
    };
    try {
      act(() =>
        root.render(<EffectLaneHarness {...{ project, cursorMove, historyTransaction }} />)
      );
      const button = container.querySelector('[data-timeline-effect-segment="c0"] button');
      act(() =>
        button?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 250 }))
      );
      act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350 })));
      const geometry = () =>
        container.querySelector<HTMLElement>('[data-timeline-effect-segment="c0"]');
      expect(geometry()?.style.left).toBe('0px');
      expect(parseFloat(geometry()?.style.width ?? '')).toBeCloseTo(500, 5);
      expect(cursorMove).not.toHaveBeenCalled();

      act(() =>
        window.dispatchEvent(
          finish === 'cancel'
            ? new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
            : new Event('pointerup')
        )
      );
      if (finish === 'commit') {
        expect(cursorMove).toHaveBeenCalledWith('c2', 'c4', 3, 5);
        project = {
          ...project,
          cursorTrack: {
            ...project.cursorTrack,
            samples: project.cursorTrack.samples.map((sample, index) =>
              index === 1 ? { ...sample, time: 3 } : index === 2 ? { ...sample, time: 5 } : sample
            ),
          },
        };
        act(() =>
          root.render(<EffectLaneHarness {...{ project, cursorMove, historyTransaction }} />)
        );
      }
      expect(parseFloat(geometry()?.style.width ?? '')).toBeCloseTo(
        finish === 'commit' ? 500 : 400,
        5
      );
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  }
});

it('renders action history once without a duplicate duration-bar utility lane', () => {
  const project = createDraftSemanticsProject();
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        <>
          <ProjectTimelineTelemetryLane
            project={project}
            recordingTelemetry={[]}
            pixelsPerSecond={100}
            onSeek={vi.fn()}
            onSelectActionOccurrence={vi.fn()}
          />
          <ProjectTimelineEffectCanvasRows
            project={project}
            pixelsPerSecond={100}
            cursorLaneVisible={false}
            selectedEffectSelection={null}
            onBeginRangeSelection={vi.fn()}
            onBeginEffectInteraction={vi.fn()}

            onResizeMotionRegion={vi.fn()}
          />
        </>
      )
    );
    expect(container.querySelectorAll('[data-action-id="a"]')).toHaveLength(1);
    expect(container.querySelector('[data-timeline-effect-segment="a"]')).toBeNull();
    expect(container.querySelectorAll('[data-project-timeline-effect-lane-row]')).toHaveLength(0);
  } finally {
    act(() => root.unmount());
  }
});

it('keeps simultaneous framing, border and spotlight pointer targets in separate rows', () => {
  const project = createEmptyVideoProject();
  project.duration = 8;
  const camera = { ...createVideoProjectMotionRegion(project, 0), id: 'camera', duration: 1 };
  const next = {
    ...createVideoProjectMotionRegion(project, 4),
    id: 'next',
    duration: 1,
    incomingConnection: { fromRegionId: camera.id, easing: VideoTemporalEasing.LINEAR },
  };
  project.motionRegions = [
    camera,
    next,
    { ...camera, id: 'border', border: createQuickEditBorder(), borderTarget: 'window' },
    {
      ...camera,
      id: 'spotlight',
      spotlight: createQuickEditSpotlight(),
      spotlightTarget: 'viewport',
    },
    {
      ...camera,
      id: 'gap-border',
      startTime: 2,
      border: createQuickEditBorder(),
      borderTarget: 'window',
    },
  ];
  const snapshot = structuredClone(project);
  const onBeginEffectInteraction = vi.fn();
  const props = {
    project,
    pixelsPerSecond: 100,
    selectedEffectSelection: null,
    onBeginRangeSelection: vi.fn(),
    onBeginEffectInteraction,
    onResizeMotionRegion: vi.fn(),
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    act(() => root.render(<ProjectTimelineEffectCanvasRows {...props} />));
    const segment = (id: string) =>
      container.querySelector<HTMLElement>(`[data-timeline-effect-segment="${id}"]`)!;
    const tops = ['camera', 'border', 'spotlight'].map((id) => segment(id).style.top);
    expect(new Set(tops).size).toBe(3);
    expect(segment('next').style.top).toBe(segment('camera').style.top);
    expect(segment('gap-border').style.top).not.toBe(segment('camera').style.top);
    expect(
      container.querySelector<HTMLElement>('[data-project-timeline-effect-lane-row]')!.style.height
    ).toBe('138px');
    for (const id of ['camera', 'border', 'spotlight']) {
      act(() =>
        segment(id)
          .querySelector('button[data-timeline-object]')!
          .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      );
      expect(onBeginEffectInteraction.mock.lastCall?.[1].motionRegionId).toBe(id);
    }
    expect(project).toEqual(snapshot);
  } finally {
    act(() => root.unmount());
  }
});

import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../../../features/video/project/scene/focus-appearance';

it.each([false, true])(
  'labels the actual manual-area fit and follows resize without changing stored scale: oriented=%s',
  (oriented) => {
    const project = createEmptyVideoProject('Area label', 400, 400);
    project.duration = 3;
    project.version = 34;
    const c = Math.cos(Math.PI / 6),
      s = Math.sin(Math.PI / 6);
    const region = {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 3,
      id: 'area-label',
      scale: oriented ? 0.5 : 3,
      focusMode: 'MANUAL_AREA' as const,
      focusArea: {
        x: 40,
        y: 40,
        width: oriented ? 220 : 200,
        height: oriented ? 200 : 100,
        ...(oriented ? { axes: { x: { x: c, y: s }, y: { x: -s, y: c } } } : {}),
      },
    };
    project.motionRegions = [region];
    const container = document.createElement('div');
    const root = createRoot(container);
    const props = {
      project,
      pixelsPerSecond: 100,
      selectedEffectSelection: null,
      onBeginRangeSelection: vi.fn(),
      onBeginEffectInteraction: vi.fn(),
      onResizeMotionRegion: vi.fn(),
    };
    const segment = () =>
      container.querySelector<HTMLElement>('[data-timeline-effect-segment="area-label"]')!;
    try {
      act(() => root.render(<ProjectTimelineEffectCanvasRows {...props} />));
      expect(segment().textContent).toContain(oriented ? '1.38x' : '2.00x');
      expect(segment().querySelector('svg.lucide-zoom-in')).not.toBeNull();
      expect(
        segment().querySelector('button[aria-label*=" · "]')!.getAttribute('aria-label')
      ).toContain(oriented ? '1.38x' : '2.00x');
      project.motionRegions = [
        { ...region, focusArea: { ...region.focusArea, width: oriented ? 320 : 100 } },
      ];
      const accepted = structuredClone(project);
      act(() => root.render(<ProjectTimelineEffectCanvasRows {...props} />));
      expect(segment().textContent).toContain(oriented ? '1.06x' : '4.00x');
      expect(project).toEqual(accepted);
      expect(project.motionRegions[0]!.scale).toBe(oriented ? 0.5 : 3);
    } finally {
      act(() => root.unmount());
    }
  }
);
