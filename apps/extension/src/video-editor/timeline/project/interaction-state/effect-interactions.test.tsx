// @vitest-environment jsdom

import type React from 'react';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createTextClip } from '../../../../features/video/project/factories/overlay-clip';
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
  const onMoveActionEvent = vi.fn();
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
      onMoveActionEvent,
      onMoveCursorSegment: vi.fn(),
      onMoveMotionRegion: vi.fn(),
      onMoveTransitionSegment: vi.fn(),
      onResizeActionEvent: vi.fn(),
      onResizeMotionRegion: vi.fn(),
      onUpdateEffectInstance: vi.fn(),
    });
    beginEffectInteraction = interaction.beginEffectInteraction;
    draft = interaction.effectDragDraft;
    return null;
  }

  act(() => root.render(<Harness />));
  const target: TimelineEffectDragTarget = {
    kind: 'action',
    mode: 'move',
    segmentId: 'action-1',
    actionEventId: 'action-1',
    originalDuration: 1,
    originalTime: 2,
  };
  act(() => beginEffectInteraction?.(createPointerEvent(100), target));
  act(() => dispatchPointerMove(120));
  expect(draft).toEqual({ segmentId: 'action-1', startTime: 4 });
  act(() => dispatchPointerMove(140));
  expect(draft).toEqual({ segmentId: 'action-1', startTime: 6 });
  expect(onMoveActionEvent).not.toHaveBeenCalled();
  act(() => window.dispatchEvent(new Event('pointerup')));
  expect(draft).toBeNull();
  expect(onMoveActionEvent).toHaveBeenCalledOnce();
  expect(onMoveActionEvent).toHaveBeenCalledWith('action-1', 6);
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
  const onMoveActionEvent = vi.fn();
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
      onMoveActionEvent,
      onMoveCursorSegment: vi.fn(),
      onMoveMotionRegion: vi.fn(),
      onMoveTransitionSegment: vi.fn(),
      onResizeActionEvent: vi.fn(),
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
  act(() => beginEffectInteraction?.(createPointerEvent(100), createActionTarget()));
  act(() => {
    dispatchPointerMove(130);
    window.dispatchEvent(new Event('pointerup'));
  });

  expect(clipGhost).toBeNull();
  expect(onMoveClip).not.toHaveBeenCalled();
  expect(onMoveActionEvent).toHaveBeenCalledOnce();
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

function createActionTarget(): TimelineEffectDragTarget {
  return {
    kind: 'action',
    mode: 'move',
    segmentId: 'action-2',
    actionEventId: 'action-2',
    originalDuration: 1,
    originalTime: 2,
  };
}

function dispatchPointerMove(clientX: number, clientY = 40): void {
  const event = new Event('pointermove');
  Object.defineProperty(event, 'clientX', { value: clientX });
  Object.defineProperty(event, 'clientY', { value: clientY });
  window.dispatchEvent(event);
}
it('includes viewport scrolling in effect movement within one transaction', () => {
  const project = createEmptyVideoProject('Effects');
  project.duration = 20;
  const historyTransaction = createHistoryTransactionMocks();
  const onMoveActionEvent = vi.fn();
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
      onMoveActionEvent,
      onMoveCursorSegment: vi.fn(),
      onMoveMotionRegion: vi.fn(),
      onMoveTransitionSegment: vi.fn(),
      onResizeActionEvent: vi.fn(),
      onResizeMotionRegion: vi.fn(),
      onUpdateEffectInstance: vi.fn(),
    });
    beginEffectInteraction = interaction.beginEffectInteraction;
    draft = interaction.effectDragDraft;
    return null;
  }

  act(() => root.render(<Harness />));
  const target: TimelineEffectDragTarget = {
    kind: 'action',
    mode: 'move',
    segmentId: 'action-1',
    actionEventId: 'action-1',
    originalDuration: 1,
    originalTime: 2,
  };
  act(() => beginEffectInteraction?.(createPointerEvent(100), target));
  startTime += 3;
  act(() => root.render(<Harness />));
  act(() => dispatchPointerMove(120));
  expect(draft).toEqual({ segmentId: 'action-1', startTime: 7 });
  expect(onMoveActionEvent).not.toHaveBeenCalled();
  startTime -= 3;
  act(() => root.render(<Harness />));
  expect(draft).toEqual({ segmentId: 'action-1', startTime: 4 });
  act(() => {
    dispatchPointerMove(140);
    window.dispatchEvent(new Event('pointerup'));
  });

  expect(onMoveActionEvent).toHaveBeenCalledOnce();
  expect(onMoveActionEvent).toHaveBeenCalledWith('action-1', 6);
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
    const onMoveActionEvent = vi.fn();
    let begin:
      | ReturnType<typeof useProjectTimelineEffectInteractions>['beginEffectInteraction']
      | null = null;
    function Harness() {
      const interaction = useProjectTimelineEffectInteractions({
        historyTransaction,
        magnetEnabled: false,
        pixelsPerSecond: 10,
        project,
        onMoveActionEvent,
        onMoveCursorSegment: vi.fn(),
        onMoveMotionRegion: vi.fn(),
        onMoveTransitionSegment: vi.fn(),
        onResizeActionEvent: vi.fn(),
        onResizeMotionRegion: vi.fn(),
        onUpdateEffectInstance: vi.fn(),
      });
      begin = interaction.beginEffectInteraction;
      return null;
    }
    act(() => root.render(<Harness />));
    act(() => begin?.(createPointerEvent(100), createActionTarget()));
    act(() => dispatchPointerMove(140));
    expect(onMoveActionEvent).not.toHaveBeenCalled();
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
    expect(onMoveActionEvent).not.toHaveBeenCalled();
    expect(historyTransaction.beginProjectHistoryTransaction).toHaveBeenCalledOnce();
    expect(historyTransaction.endProjectHistoryTransaction).toHaveBeenCalledOnce();
  }
);
