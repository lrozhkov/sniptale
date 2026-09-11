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
    const button = container.querySelector('button');
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
    const project = createDraftSemanticsProject();
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
      const button = container.querySelector('button');
      act(() =>
        button?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 250 }))
      );
      act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350 })));
      const geometry = () =>
        container.querySelector<HTMLElement>('[data-timeline-effect-segment="c0"]');
      expect(geometry()?.style.left).toBe('0px');
      expect(parseFloat(geometry()?.style.width ?? '')).toBeCloseTo(600, 5);
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
        project.cursorTrack.samples[1]!.time = 3;
        project.cursorTrack.samples[2]!.time = 5;
        act(() =>
          root.render(<EffectLaneHarness {...{ project, cursorMove, historyTransaction }} />)
        );
      }
      expect(parseFloat(geometry()?.style.width ?? '')).toBeCloseTo(600, 5);
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
