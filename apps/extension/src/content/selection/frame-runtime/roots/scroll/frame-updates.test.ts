// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../../features/highlighter/contracts';
import { createFrameDataFixture, createStepBadgeSettingsFixture } from '../../test-support';

const mocks = vi.hoisted(() => ({
  applyFrameOffsetToElement: vi.fn(),
  calculateFrameViewportCoords: vi.fn(),
  calculateFrameOffsetFromElement: vi.fn(),
  clearAllHighlights: vi.fn(),
  clearFrameEditing: vi.fn(),
  clearFrameTooltipVisible: vi.fn(),
  createFrameDataFromElement: vi.fn(),
  disableHighlighterMode: vi.fn(),
  enableHighlighterMode: vi.fn(),
  invalidateFrameCache: vi.fn(),
  isHighlighterEnabled: vi.fn(),
  isHighlighterPausedState: vi.fn(),
  logger: { debug: vi.fn() },
  pauseHighlighter: vi.fn(),
  registerFrameCallbacks: vi.fn(),
  resumeHighlighter: vi.fn(),
  setFrameEditing: vi.fn(),
  setFrameTooltipVisible: vi.fn(),
  shouldDropLinkedElement: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => mocks.logger,
}));

vi.mock('../../../highlighter', () => ({
  clearAllHighlights: mocks.clearAllHighlights,
  clearFrameEditing: mocks.clearFrameEditing,
  clearFrameTooltipVisible: mocks.clearFrameTooltipVisible,
  disableHighlighterMode: mocks.disableHighlighterMode,
  enableHighlighterMode: mocks.enableHighlighterMode,
  invalidateFrameCache: mocks.invalidateFrameCache,
  isHighlighterEnabled: mocks.isHighlighterEnabled,
  isHighlighterPausedState: mocks.isHighlighterPausedState,
  pauseHighlighter: mocks.pauseHighlighter,
  registerFrameCallbacks: mocks.registerFrameCallbacks,
  resumeHighlighter: mocks.resumeHighlighter,
  setFrameEditing: mocks.setFrameEditing,
  setFrameTooltipVisible: mocks.setFrameTooltipVisible,
}));

vi.mock('../../manager/coords', () => ({
  applyFrameOffsetToElement: mocks.applyFrameOffsetToElement,
  calculateFrameOffsetFromElement: mocks.calculateFrameOffsetFromElement,
  calculateFrameViewportCoords: mocks.calculateFrameViewportCoords,
  createFrameDataFromElement: mocks.createFrameDataFromElement,
}));

vi.mock('./linked-elements', () => ({
  shouldDropLinkedElement: mocks.shouldDropLinkedElement,
}));

import {
  createFrameScrollHandler,
  haveFrameCoordsChanged,
  syncFramePositionOnScroll,
} from './frame-updates';

function createFrame(id: string, stepBadge = false): FrameData {
  return createFrameDataFixture(id, {
    ...(stepBadge ? { stepBadge: createStepBadgeSettingsFixture({ value: '1' }) } : {}),
  });
}

function runSetter(
  setter: (updater: (frames: FrameData[]) => FrameData[]) => void,
  frames: FrameData[]
) {
  const updater = vi.mocked(setter).mock.calls[0]?.[0];
  return typeof updater === 'function' ? updater(frames) : frames;
}

function expectStaleLinkedElementDropped(): void {
  const linkedElement = document.createElement('div');
  const linkedElementsRef = { current: new Map([['frame-1', linkedElement]]) };
  const setFrames = vi.fn();
  const frame = createFrame('frame-1');
  mocks.shouldDropLinkedElement.mockReturnValue(true);

  syncFramePositionOnScroll({
    frame,
    frameState: undefined,
    linkedElement,
    linkedElementsRef,
    setFrames,
  });

  expect(runSetter(setFrames, [frame])).toEqual([]);
  expect(linkedElementsRef.current.has('frame-1')).toBe(false);
  expect(mocks.invalidateFrameCache).toHaveBeenCalledTimes(1);
}

function expectOffsetAwarePositionUpdate(): void {
  const linkedElement = document.createElement('div');
  const linkedElementsRef = { current: new Map([['frame-1', linkedElement]]) };
  const setFrames = vi.fn();
  const frame = {
    ...createFrame('frame-1'),
    offset: { x: 4, y: 5, width: 130, height: 90 },
  };
  mocks.shouldDropLinkedElement.mockReturnValue(false);
  mocks.applyFrameOffsetToElement.mockReturnValue({ height: 90, width: 130, x: 44, y: 55 });

  syncFramePositionOnScroll({
    frame,
    frameState: undefined,
    linkedElement,
    linkedElementsRef,
    setFrames,
  });

  expect(mocks.applyFrameOffsetToElement).toHaveBeenCalledWith(linkedElement, frame.offset);
  expect(runSetter(setFrames, [frame])).toEqual([{ ...frame, x: 44, y: 55 }]);
}

function expectScrollMeasurementsDoNotResizeFrame(): void {
  const linkedElement = document.createElement('div');
  const linkedElementsRef = { current: new Map([['frame-1', linkedElement]]) };
  const setFrames = vi.fn();
  const frame = createFrame('frame-1');
  mocks.shouldDropLinkedElement.mockReturnValue(false);
  mocks.calculateFrameViewportCoords.mockReturnValue({
    x: frame.x,
    y: frame.y - 24,
    width: frame.width,
    height: frame.height + 18,
  });

  syncFramePositionOnScroll({
    frame,
    frameState: undefined,
    linkedElement,
    linkedElementsRef,
    setFrames,
  });

  expect(runSetter(setFrames, [frame])[0]).toMatchObject({
    x: frame.x,
    y: frame.y - 24,
    width: frame.width,
    height: frame.height,
  });
}

describe('syncFramePositionOnScroll updates', () => {
  it(
    'drops stale linked elements and invalidates the frame cache',
    expectStaleLinkedElementDropped
  );
  it(
    'updates frame position through offset-aware coordinate calculation',
    expectOffsetAwarePositionUpdate
  );
  it(
    'keeps stored dimensions when scroll-time GWT layout measurements drift',
    expectScrollMeasurementsDoNotResizeFrame
  );
});

describe('syncFramePositionOnScroll guards', () => {
  it('skips updates when the frame is editing, missing, or coords are unchanged', () => {
    const linkedElement = document.createElement('div');
    const linkedElementsRef = { current: new Map([['frame-1', linkedElement]]) };
    const setFrames = vi.fn();
    const frame = createFrame('frame-1');
    mocks.shouldDropLinkedElement.mockReturnValue(false);
    mocks.calculateFrameViewportCoords.mockReturnValue({
      height: frame.height,
      width: frame.width,
      x: frame.x,
      y: frame.y,
    });

    syncFramePositionOnScroll({
      frame,
      frameState: 'editing',
      linkedElement,
      linkedElementsRef,
      setFrames,
    });
    syncFramePositionOnScroll({
      frame,
      frameState: undefined,
      linkedElement: undefined,
      linkedElementsRef,
      setFrames,
    });
    syncFramePositionOnScroll({
      frame,
      frameState: undefined,
      linkedElement,
      linkedElementsRef,
      setFrames,
    });

    expect(setFrames).not.toHaveBeenCalled();
  });
});

describe('createFrameScrollHandler', () => {
  it('iterates current frames through the shared scroll handler', () => {
    const linkedElement = document.createElement('div');
    const frame = createFrame('frame-1', true);
    const setFrames = vi.fn();
    const handler = createFrameScrollHandler({
      frameStatesRef: { current: new Map() },
      framesRef: { current: [frame] },
      linkedElementsRef: { current: new Map([[frame.id, linkedElement]]) },
      setFrames,
    });
    mocks.shouldDropLinkedElement.mockReturnValue(false);
    mocks.calculateFrameViewportCoords.mockReturnValue({ height: 81, width: 121, x: 11, y: 21 });

    handler();

    expect(mocks.logger.debug).toHaveBeenCalledWith('Handling scroll sync', { frameCount: 1 });
    expect(runSetter(setFrames, [frame])[0]).toMatchObject({
      height: frame.height,
      width: frame.width,
      x: 11,
      y: 21,
    });
  });
});

describe('haveFrameCoordsChanged', () => {
  it('compares frame coords structurally', () => {
    const frame = createFrame('frame-1');

    expect(
      haveFrameCoordsChanged(frame, {
        height: frame.height,
        width: frame.width,
        x: frame.x,
        y: frame.y,
      })
    ).toBe(false);
    expect(
      haveFrameCoordsChanged(frame, {
        height: frame.height + 1,
        width: frame.width,
        x: frame.x,
        y: frame.y,
      })
    ).toBe(true);
  });
});
