// @vitest-environment jsdom

import type React from 'react';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createTextClip } from '../../../../features/video/project/factories/overlay-clip';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { bindMotionRegionToClip } from '../../../../features/video/project/motion/source-binding';
import type { TimelineEffectDragTarget } from '../types';
import { useProjectTimelineEffectInteractions } from '../effect-lanes/interactions';
import { useProjectTimelineDrag } from './drag';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function createHistoryTransactionMocks() {
  let currentLease: symbol | null = null;
  const beginProjectHistoryTransaction = vi.fn(() => {
    currentLease = Symbol('test-history-transaction');
    return currentLease;
  });
  const endProjectHistoryTransaction = vi.fn((lease: symbol) => {
    if (currentLease === lease) currentLease = null;
  });
  return {
    beginProjectHistoryTransaction,
    endProjectHistoryTransaction,
    isProjectHistoryTransactionCurrent: (lease: symbol) => lease === currentLease,
  };
}

it('wraps all effect pointer moves in one history transaction', () => {
  const project = createEmptyVideoProject('Effects');
  project.duration = 20;
  const historyTransaction = createHistoryTransactionMocks();
  const onMoveMotionRegion = vi.fn();
  let draft: ReturnType<typeof useProjectTimelineEffectInteractions>['effectDragDraft'] = null;
  let beginEffectInteraction:
    | ReturnType<typeof useProjectTimelineEffectInteractions>['beginEffectInteraction']
    | null = null;

  function Harness() {
    const interaction = useProjectTimelineEffectInteractions({
      historyTransaction,
      magnetEnabled: false,
      pixelsPerSecond: 10,
      project,
      onMoveMotionRegion,
      onMoveCursorSegment: vi.fn(),
      onMoveTransitionSegment: vi.fn(),

      onResizeMotionRegion: vi.fn(),
      onUpdateEffectInstance: vi.fn(),
    });
    beginEffectInteraction = interaction.beginEffectInteraction;
    draft = interaction.effectDragDraft;
    return null;
  }

  act(() => root.render(<Harness />));
  const target: TimelineEffectDragTarget = {
    kind: 'motion',
    mode: 'move',
    segmentId: 'action-1',
    motionRegionId: 'action-1',
    originalDuration: 1,
    originalStart: 2,
  };
  act(() => beginEffectInteraction?.(createPointerEvent(100), target));
  act(() => dispatchPointerMove(120));
  expect(draft).toEqual({ segmentId: 'action-1', startTime: 4 });
  act(() => dispatchPointerMove(140));
  expect(draft).toEqual({ segmentId: 'action-1', startTime: 6 });
  expect(onMoveMotionRegion).not.toHaveBeenCalled();
  act(() => window.dispatchEvent(new Event('pointerup')));
  expect(draft).toBeNull();
  expect(onMoveMotionRegion).toHaveBeenCalledOnce();
  expect(onMoveMotionRegion).toHaveBeenCalledWith('action-1', 6);
  expect(historyTransaction.beginProjectHistoryTransaction).toHaveBeenCalledOnce();
  expect(historyTransaction.endProjectHistoryTransaction).toHaveBeenCalledOnce();
});

it('discards the clip draft before starting an effect transaction', () => {
  const project = createEmptyVideoProject('Superseded interaction');
  project.duration = 20;
  const clip = createTextClip(project.tracks[0]!.id, project.width, project.height, 2);
  project.clips = [clip];
  const historyTransaction = createHistoryTransactionMocks();
  const onMoveClip = vi.fn();
  const onMoveMotionRegion = vi.fn();
  let clipGhost: ReturnType<typeof useProjectTimelineDrag>['dragGhost'] = null;
  let beginClipInteraction:
    | ReturnType<typeof useProjectTimelineDrag>['beginClipInteraction']
    | null = null;
  let beginEffectInteraction:
    | ReturnType<typeof useProjectTimelineEffectInteractions>['beginEffectInteraction']
    | null = null;

  function Harness() {
    const pointerSessionCleanupRef = useRef<(() => void) | null>(null);
    const clipInteraction = useProjectTimelineDrag({
      onSwapClip: vi.fn(),
      currentTime: 0,
      historyTransaction,
      magnetEnabled: false,
      pointerSessionCleanupRef,
      pixelsPerSecond: 10,
      project,
      onMoveClip,
      onSelectClip: vi.fn(),
      onSelectTrack: vi.fn(),
      onTimelinePreviewSuspendedChange: vi.fn(),
      onTrimClipEnd: vi.fn(),
      onTrimClipStart: vi.fn(),
    });
    const effectInteraction = useProjectTimelineEffectInteractions({
      historyTransaction,
      pointerSessionCleanupRef,
      magnetEnabled: false,
      pixelsPerSecond: 10,
      project,
      onMoveMotionRegion,
      onMoveCursorSegment: vi.fn(),
      onMoveTransitionSegment: vi.fn(),

      onResizeMotionRegion: vi.fn(),
      onUpdateEffectInstance: vi.fn(),
    });
    clipGhost = clipInteraction.dragGhost;
    beginClipInteraction = clipInteraction.beginClipInteraction;
    beginEffectInteraction = effectInteraction.beginEffectInteraction;
    return null;
  }

  act(() => root.render(<Harness />));
  act(() => beginClipInteraction?.(createClipPointerEvent(100, 40), clip, 'move'));
  act(() => dispatchPointerMove(120));
  expect(clipGhost).not.toBeNull();
  expect(onMoveClip).not.toHaveBeenCalled();
  act(() => beginEffectInteraction?.(createPointerEvent(100), createMotionTarget()));
  act(() => {
    dispatchPointerMove(130);
    window.dispatchEvent(new Event('pointerup'));
  });

  expect(clipGhost).toBeNull();
  expect(onMoveClip).not.toHaveBeenCalled();
  expect(onMoveMotionRegion).toHaveBeenCalledOnce();
  expect(historyTransaction.beginProjectHistoryTransaction).toHaveBeenCalledTimes(2);
  expect(historyTransaction.endProjectHistoryTransaction).toHaveBeenCalledTimes(2);
});

function createPointerEvent(
  clientX: number
): Pick<React.PointerEvent, 'clientX' | 'preventDefault' | 'stopPropagation'> {
  return {
    clientX,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function createClipPointerEvent(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function createMotionTarget(): TimelineEffectDragTarget {
  return {
    kind: 'motion',
    mode: 'move',
    segmentId: 'action-2',
    motionRegionId: 'action-2',
    originalDuration: 1,
    originalStart: 2,
  };
}

function dispatchPointerMove(clientX: number, clientY = 40): void {
  const event = new Event('pointermove');
  Object.defineProperty(event, 'clientX', { value: clientX });
  Object.defineProperty(event, 'clientY', { value: clientY });
  window.dispatchEvent(event);
}

it('holds a dragged source-bound zoom at the source edge, then follows the pointer back', () => {
  const clip = createVideoClip({ startTime: 2, duration: 8, sourceDuration: 8 });
  const project = createProject([clip]);
  project.duration = 20;
  const region = bindMotionRegionToClip(
    { ...createVideoProjectMotionRegion(project, 3), duration: 2 },
    clip
  );
  project.motionRegions = [region];
  let interaction: ReturnType<typeof useProjectTimelineEffectInteractions>;
  const onMoveMotionRegion = vi.fn();
  function Harness() {
    interaction = useProjectTimelineEffectInteractions({
      historyTransaction: createHistoryTransactionMocks(),
      magnetEnabled: false,
      pixelsPerSecond: 10,
      project,
      onMoveMotionRegion,
      onMoveCursorSegment: vi.fn(),
      onMoveTransitionSegment: vi.fn(),
      onResizeMotionRegion: vi.fn(),
      onUpdateEffectInstance: vi.fn(),
    });
    return null;
  }
  act(() => root.render(<Harness />));
  act(() =>
    interaction.beginEffectInteraction(createPointerEvent(100), {
      kind: 'motion',
      mode: 'move',
      motionRegionId: region.id,
      segmentId: region.id,
      originalDuration: 2,
      originalStart: 3,
    })
  );
  act(() => dispatchPointerMove(300));
  expect(interaction!.effectDragDraft?.startTime).toBe(8);
  act(() => dispatchPointerMove(120));
  expect(interaction!.effectDragDraft?.startTime).toBe(5);
  act(() => window.dispatchEvent(new Event('pointerup')));
  expect(onMoveMotionRegion).toHaveBeenCalledExactlyOnceWith(region.id, 5);
});

it.each(['pointerup', 'Escape'])(
  'stages an action offset with one commit or cancellation: %s',
  (finish) => {
    const project = createEmptyVideoProject('History');
    project.duration = 20;
    const historyTransaction = createHistoryTransactionMocks();
    const onMoveActionOccurrence = vi.fn();
    const onSelectActionOccurrence = vi.fn();
    let interaction: ReturnType<typeof useProjectTimelineEffectInteractions>;
    function Harness() {
      interaction = useProjectTimelineEffectInteractions({
        historyTransaction,
        magnetEnabled: false,
        pixelsPerSecond: 10,
        project,
        onMoveActionOccurrence,
        onSelectActionOccurrence,
        onMoveMotionRegion: vi.fn(),
        onMoveCursorSegment: vi.fn(),
        onMoveTransitionSegment: vi.fn(),
        onResizeMotionRegion: vi.fn(),
        onUpdateEffectInstance: vi.fn(),
      });
      return null;
    }
    act(() => root.render(<Harness />));
    act(() =>
      interaction.beginEffectInteraction(createPointerEvent(100), {
        kind: 'action',
        eventId: 'click',
        clipId: 'source',
        segmentId: 'occurrence',
        originalStart: 4,
        minimumTime: 2,
        maximumTime: 8,
      })
    );
    expect(onSelectActionOccurrence).toHaveBeenCalledWith('click', 'source');
    act(() => dispatchPointerMove(180));
    expect(interaction!.effectDragDraft?.startTime).toBe(8);
    expect(onMoveActionOccurrence).not.toHaveBeenCalled();
    act(() =>
      window.dispatchEvent(
        finish === 'Escape'
          ? new KeyboardEvent('keydown', { key: 'Escape' })
          : new Event('pointerup')
      )
    );
    expect(interaction!.effectDragDraft).toBeNull();
    if (finish === 'Escape') expect(onMoveActionOccurrence).not.toHaveBeenCalled();
    else expect(onMoveActionOccurrence).toHaveBeenCalledExactlyOnceWith('click', 'source', 8);
    expect(historyTransaction.endProjectHistoryTransaction).toHaveBeenCalledOnce();
  }
);
it('includes viewport scrolling in effect movement within one transaction', () => {
  const project = createEmptyVideoProject('Effects');
  project.duration = 20;
  const historyTransaction = createHistoryTransactionMocks();
  const onMoveMotionRegion = vi.fn();
  let draft: ReturnType<typeof useProjectTimelineEffectInteractions>['effectDragDraft'] = null;
  let startTime = 43200;
  let beginEffectInteraction:
    | ReturnType<typeof useProjectTimelineEffectInteractions>['beginEffectInteraction']
    | null = null;

  function Harness() {
    const interaction = useProjectTimelineEffectInteractions({
      historyTransaction,
      magnetEnabled: false,
      pixelsPerSecond: 10,
      readTimelineStartTime: () => startTime,
      project,
      onMoveMotionRegion,
      onMoveCursorSegment: vi.fn(),
      onMoveTransitionSegment: vi.fn(),

      onResizeMotionRegion: vi.fn(),
      onUpdateEffectInstance: vi.fn(),
    });
    beginEffectInteraction = interaction.beginEffectInteraction;
    draft = interaction.effectDragDraft;
    return null;
  }

  act(() => root.render(<Harness />));
  const target: TimelineEffectDragTarget = {
    kind: 'motion',
    mode: 'move',
    segmentId: 'action-1',
    motionRegionId: 'action-1',
    originalDuration: 1,
    originalStart: 2,
  };
  act(() => beginEffectInteraction?.(createPointerEvent(100), target));
  startTime += 3;
  act(() => root.render(<Harness />));
  act(() => dispatchPointerMove(120));
  expect(draft).toEqual({ segmentId: 'action-1', startTime: 7 });
  expect(onMoveMotionRegion).not.toHaveBeenCalled();
  startTime -= 3;
  act(() => root.render(<Harness />));
  expect(draft).toEqual({ segmentId: 'action-1', startTime: 4 });
  act(() => {
    dispatchPointerMove(140);
    window.dispatchEvent(new Event('pointerup'));
  });

  expect(onMoveMotionRegion).toHaveBeenCalledOnce();
  expect(onMoveMotionRegion).toHaveBeenCalledWith('action-1', 6);
  expect(draft).toBeNull();
  expect(historyTransaction.beginProjectHistoryTransaction).toHaveBeenCalledOnce();
  expect(historyTransaction.endProjectHistoryTransaction).toHaveBeenCalledOnce();
});

it.each(['Escape', 'pointercancel', 'blur', 'unmount', 'replacement', 'origin', 'lease'])(
  'discards an effect gesture on %s without committing project changes',
  (cancel) => {
    let project = createEmptyVideoProject('Cancelable effects');
    project.duration = 20;
    const historyTransaction = createHistoryTransactionMocks();
    const onMoveMotionRegion = vi.fn();
    let begin:
      | ReturnType<typeof useProjectTimelineEffectInteractions>['beginEffectInteraction']
      | null = null;
    function Harness() {
      const interaction = useProjectTimelineEffectInteractions({
        historyTransaction,
        magnetEnabled: false,
        pixelsPerSecond: 10,
        project,
        onMoveMotionRegion,
        onMoveCursorSegment: vi.fn(),
        onMoveTransitionSegment: vi.fn(),

        onResizeMotionRegion: vi.fn(),
        onUpdateEffectInstance: vi.fn(),
      });
      begin = interaction.beginEffectInteraction;
      return null;
    }
    act(() => root.render(<Harness />));
    act(() => begin?.(createPointerEvent(100), createMotionTarget()));
    act(() => dispatchPointerMove(140));
    expect(onMoveMotionRegion).not.toHaveBeenCalled();
    act(() => {
      if (cancel === 'lease') {
        historyTransaction.isProjectHistoryTransactionCurrent = () => false;
        dispatchPointerMove(140);
      } else if (cancel === 'origin') {
        dispatchPointerMove(100);
        window.dispatchEvent(new Event('pointerup'));
      } else if (cancel === 'unmount') root.render(null);
      else if (cancel === 'replacement') {
        project = createEmptyVideoProject('Replacement');
        root.render(<Harness />);
      } else if (cancel === 'Escape')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
      else window.dispatchEvent(new Event(cancel));
    });
    act(() => {
      dispatchPointerMove(160);
      window.dispatchEvent(new Event('pointerup'));
    });
    expect(onMoveMotionRegion).not.toHaveBeenCalled();
    expect(historyTransaction.beginProjectHistoryTransaction).toHaveBeenCalledOnce();
    expect(historyTransaction.endProjectHistoryTransaction).toHaveBeenCalledOnce();
  }
);

it.each(['click', 'drag', 'trim', 'cancel'] as const)(
  'selects a motion segment without a playback callback: %s',
  (gesture) => {
    const project = createEmptyVideoProject('Motion click');
    project.duration = 20;
    const onSelectMotionRegion = vi.fn();
    const historyTransaction = createHistoryTransactionMocks();
    let begin:
      | ReturnType<typeof useProjectTimelineEffectInteractions>['beginEffectInteraction']
      | null = null;
    function Harness() {
      const options = {
        historyTransaction,
        project,
        magnetEnabled: false,
        pixelsPerSecond: 10,
        onSelectMotionRegion,
        onMoveMotionRegion: vi.fn(),

        onMoveCursorSegment: vi.fn(),
        onMoveTransitionSegment: vi.fn(),

        onResizeMotionRegion: vi.fn(),
        onUpdateEffectInstance: vi.fn(),
      };
      begin = useProjectTimelineEffectInteractions(options).beginEffectInteraction;
      return null;
    }
    act(() => root.render(<Harness />));
    const target: TimelineEffectDragTarget = {
      kind: 'motion',
      mode: gesture === 'trim' ? 'resize-end' : 'move',
      motionRegionId: 'zoom',
      segmentId: 'zoom',
      originalStart: 2,
      originalDuration: 3,
    };
    act(() => begin?.(createPointerEvent(130), target));
    if (gesture === 'drag') act(() => dispatchPointerMove(180));
    act(() =>
      window.dispatchEvent(new Event(gesture === 'cancel' ? 'pointercancel' : 'pointerup'))
    );
    if (gesture === 'click') {
      expect(onSelectMotionRegion).toHaveBeenCalledExactlyOnceWith('zoom');
      expect(historyTransaction.beginProjectHistoryTransaction).not.toHaveBeenCalled();
    } else {
      expect(onSelectMotionRegion).toHaveBeenCalledExactlyOnceWith('zoom');
    }
  }
);
