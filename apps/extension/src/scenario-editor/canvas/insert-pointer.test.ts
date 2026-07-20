// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  cancelScenarioCanvasInsertPointer,
  finishScenarioCanvasInsertPointer,
  handleScenarioCanvasInsertPointerDown,
  updateScenarioCanvasInsertPointer,
  type ScenarioCanvasInsertSession,
} from './insert-pointer';
import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioCanvasStageProps } from './types';

type InsertSessionRef = { current: ScenarioCanvasInsertSession | null };
type InsertKind = ScenarioCanvasInsertSession['kind'];
type InsertHarness = {
  onInsertElementAtPoint: NonNullable<ScenarioCanvasStageProps['onInsertElementAtPoint']>;
  onInsertElementFromDrag: NonNullable<ScenarioCanvasStageProps['onInsertElementFromDrag']>;
  sessionRef: InsertSessionRef;
  setPreviewFrame: (frame: ScenarioElementFrame | null) => void;
  stage: HTMLDivElement;
};

function createStage() {
  const stage = document.createElement('div');
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    bottom: 100,
    height: 100,
    left: 0,
    right: 100,
    toJSON: () => ({}),
    top: 0,
    width: 100,
    x: 0,
    y: 0,
  });
  return stage;
}

function createPointerEvent(
  stage: HTMLDivElement,
  clientX: number,
  clientY: number,
  pointerId = 1
) {
  return {
    clientX,
    clientY,
    currentTarget: stage,
    pointerId,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as never;
}

function createInsertHarness(): InsertHarness {
  return {
    onInsertElementAtPoint: vi.fn(),
    onInsertElementFromDrag: vi.fn(),
    sessionRef: { current: null },
    setPreviewFrame: vi.fn(),
    stage: createStage(),
  };
}

function beginInsert(harness: InsertHarness, x: number, y: number, kind: InsertKind = 'shape') {
  return handleScenarioCanvasInsertPointerDown({
    activeInsertKind: kind,
    event: createPointerEvent(harness.stage, x, y),
    insertSessionRef: harness.sessionRef,
    scale: 1,
    setPreviewFrame: harness.setPreviewFrame,
    stageRef: { current: harness.stage },
  });
}

function updateInsert(harness: InsertHarness, x: number, y: number) {
  return updateScenarioCanvasInsertPointer({
    event: createPointerEvent(harness.stage, x, y),
    insertSessionRef: harness.sessionRef,
    scale: 1,
    setPreviewFrame: harness.setPreviewFrame,
    stageRef: { current: harness.stage },
  });
}

function finishInsert(harness: InsertHarness, x: number, y: number) {
  return finishScenarioCanvasInsertPointer({
    event: createPointerEvent(harness.stage, x, y),
    insertSessionRef: harness.sessionRef,
    onInsertElementAtPoint: harness.onInsertElementAtPoint,
    onInsertElementFromDrag: harness.onInsertElementFromDrag,
    setPreviewFrame: harness.setPreviewFrame,
  });
}

it('declines scenario insert pointer handling when no active tool exists', () => {
  const stage = createStage();
  const sessionRef = { current: null as ScenarioCanvasInsertSession | null };

  expect(
    handleScenarioCanvasInsertPointerDown({
      activeInsertKind: null,
      event: createPointerEvent(stage, 10, 12),
      insertSessionRef: sessionRef,
      scale: 1,
      setPreviewFrame: vi.fn(),
      stageRef: { current: stage },
    })
  ).toBe(false);
});

it('falls back to the event target rect when the stage ref is not mounted', () => {
  const stage = createStage();
  const sessionRef = { current: null as ScenarioCanvasInsertSession | null };

  expect(
    handleScenarioCanvasInsertPointerDown({
      activeInsertKind: 'shape',
      event: createPointerEvent(stage, 10, 12),
      insertSessionRef: sessionRef,
      scale: 1,
      setPreviewFrame: vi.fn(),
      stageRef: { current: null },
    })
  ).toBe(true);
  expect(sessionRef.current?.origin).toEqual({ x: 10, y: 12 });
});

it('routes scenario insert pointer lifecycle through click and drag commits', () => {
  const harness = createInsertHarness();

  expect(beginInsert(harness, 10, 12)).toBe(true);
  expect(finishInsert(harness, 10, 12)).toBe(true);
  expect(harness.onInsertElementAtPoint).toHaveBeenCalledWith('shape', { x: 10, y: 12 });

  expect(beginInsert(harness, 20, 24)).toBe(true);
  expect(updateInsert(harness, 120, 144)).toBe(true);
  expect(finishInsert(harness, 120, 144)).toBe(true);
  expect(harness.onInsertElementFromDrag).toHaveBeenCalledWith(
    'shape',
    { x: 20, y: 24 },
    { x: 120, y: 144 }
  );
});

it('uses box drag activation for scenario frame tools and single-axis drag for connectors', () => {
  const harness = createInsertHarness();

  beginInsert(harness, 10, 12);
  updateInsert(harness, 60, 12);
  finishInsert(harness, 60, 12);

  expect(harness.onInsertElementAtPoint).toHaveBeenCalledWith('shape', { x: 10, y: 12 });
  expect(harness.onInsertElementFromDrag).not.toHaveBeenCalled();

  beginInsert(harness, 10, 12, 'line');
  updateInsert(harness, 60, 12);
  finishInsert(harness, 60, 12);

  expect(harness.onInsertElementFromDrag).toHaveBeenCalledWith(
    'line',
    { x: 10, y: 12 },
    { x: 60, y: 12 }
  );
});

it('ignores pointer updates and finishes for inactive scenario insert sessions', () => {
  const stage = createStage();
  const sessionRef = {
    current: {
      current: { x: 0, y: 0 },
      kind: 'text',
      origin: { x: 0, y: 0 },
      pointerId: 2,
    } as ScenarioCanvasInsertSession,
  };

  expect(
    updateScenarioCanvasInsertPointer({
      event: createPointerEvent(stage, 10, 12, 1),
      insertSessionRef: sessionRef,
      scale: 1,
      setPreviewFrame: vi.fn(),
      stageRef: { current: stage },
    })
  ).toBe(false);
  expect(
    finishScenarioCanvasInsertPointer({
      event: createPointerEvent(stage, 10, 12, 1),
      insertSessionRef: sessionRef,
      onInsertElementAtPoint: vi.fn(),
      onInsertElementFromDrag: vi.fn(),
      setPreviewFrame: vi.fn(),
    })
  ).toBe(false);
});

it('cancels scenario insert pointer sessions through shared lifecycle cleanup', () => {
  const sessionRef = {
    current: {
      current: { x: 20, y: 24 },
      kind: 'text',
      origin: { x: 10, y: 12 },
      pointerId: 1,
    } as ScenarioCanvasInsertSession,
  };
  const setPreviewFrame = vi.fn();

  cancelScenarioCanvasInsertPointer({ insertSessionRef: sessionRef, setPreviewFrame });

  expect(sessionRef.current).toBeNull();
  expect(setPreviewFrame).toHaveBeenCalledWith(null);
});
