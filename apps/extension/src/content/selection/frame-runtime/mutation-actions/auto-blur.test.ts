// @vitest-environment jsdom

import type { Dispatch, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  createBlurSettingsFixture,
  createBorderSettingsFixture,
  createFocusSettingsFixture,
  createFrameDataFixture,
} from '../react/test-support';

const iframeUtilsMocks = vi.hoisted(() => ({
  createCompositeSelector: vi.fn(),
  getAbsolutePosition: vi.fn(),
  invalidateFrameCache: vi.fn(),
}));

vi.mock('../../../platform/frame', () => ({
  getAbsolutePosition: iframeUtilsMocks.getAbsolutePosition,
}));

vi.mock('../../../platform/frame/selectors', () => ({
  createCompositeSelector: iframeUtilsMocks.createCompositeSelector,
}));

vi.mock('../../highlighter', () => ({
  invalidateFrameCache: iframeUtilsMocks.invalidateFrameCache,
}));

import {
  createAddAutoBlurFramesHandler,
  createClearAutoBlurFramesHandler,
  createSyncAutoBlurFramesHandler,
} from './auto-blur';

type HandlerArgs = Parameters<typeof createAddAutoBlurFramesHandler>[0];

function createHandlerScenario() {
  const element = document.createElement('span');
  const existingFrame = createFrameDataFixture('existing-blur', {
    effectMode: 'blur',
    height: 20,
    width: 80,
    x: 10,
    y: 20,
  });
  let frames: FrameData[] = [existingFrame];
  const setFrames = vi.fn<Dispatch<SetStateAction<FrameData[]>>>((updater) => {
    frames = typeof updater === 'function' ? updater(frames) : updater;
  });
  const args: HandlerArgs = {
    framesRef: { current: frames },
    highlighterSettingsCacheRef: {
      current: {
        borderPresets: [createBorderSettingsFixture({ id: 'preset-1', color: '#ff0000' })],
        defaultBlurSettings: createBlurSettingsFixture(),
        defaultBorderPresetId: 'preset-1',
        defaultEffectMode: 'border',
        defaultFocusSettings: createFocusSettingsFixture(),
      },
    },
    linkedElementsRef: { current: new Map() },
    sessionFocusSettingsRef: { current: createFocusSettingsFixture({ opacity: 0.7 }) },
    setFrames,
  };

  return {
    args,
    element,
    getFrames: () => frames,
  };
}

function createAutoBlurInput(element: HTMLElement) {
  return {
    blurSettings: createBlurSettingsFixture({ amount: 22, blurType: 'solid' }),
    targets: [
      {
        element,
        id: 'duplicate',
        rect: { height: 20, width: 80, x: 10, y: 20 },
      },
      {
        element,
        id: 'new',
        rect: { height: 18, width: 70, x: 100, y: 120 },
      },
    ],
  };
}

function expectAddedFrame(frame: FrameData | undefined, element: HTMLElement) {
  expect(frame).toMatchObject({
    blurSettings: { amount: 22, blurType: 'solid', showBorder: true },
    createdBy: 'auto-blur',
    effectMode: 'blur',
    height: 18,
    linkedElement: element,
    linkedElementSelector: '#target',
    offset: { height: -12, width: -20, x: 95, y: 110 },
    width: 70,
    x: 100,
    y: 120,
  });
}

function expectAutoBlurFramesAdded() {
  const scenario = createHandlerScenario();
  const addAutoBlurFrames = createAddAutoBlurFramesHandler(scenario.args);

  const result = addAutoBlurFrames(createAutoBlurInput(scenario.element));

  const addedFrame = scenario.getFrames()[1];
  expect(result).toEqual({ addedCount: 1, skippedCount: 1 });
  expectAddedFrame(addedFrame, scenario.element);
  expect(scenario.args.linkedElementsRef.current.get(addedFrame?.id ?? '')).toBe(scenario.element);
  expect(iframeUtilsMocks.invalidateFrameCache).toHaveBeenCalledTimes(1);
}

function expectOnlyAutoBlurFramesCleared() {
  const scenario = createHandlerScenario();
  const manualBlur = createFrameDataFixture('manual-blur', {
    effectMode: 'blur',
    height: 18,
    width: 70,
    x: 100,
    y: 120,
  });
  const autoBlur = createFrameDataFixture('auto-blur', {
    createdBy: 'auto-blur',
    effectMode: 'blur',
    height: 18,
    width: 70,
    x: 100,
    y: 120,
  });
  scenario.args.linkedElementsRef.current.set(autoBlur.id, scenario.element);
  scenario.args.setFrames([manualBlur, autoBlur]);

  const clearAutoBlurFrames = createClearAutoBlurFramesHandler(scenario.args);
  const result = clearAutoBlurFrames({
    targets: [
      {
        element: scenario.element,
        id: 'target',
        rect: { height: 18, width: 70, x: 100, y: 120 },
      },
    ],
  });

  expect(result).toEqual({ removedCount: 1 });
  expect(scenario.getFrames()).toEqual([manualBlur]);
  expect(scenario.args.linkedElementsRef.current.has(autoBlur.id)).toBe(false);
}

function expectAutoBlurFramesSyncedToCurrentTargets() {
  const scenario = createHandlerScenario();
  const detachedElement = document.createElement('span');
  const staleAutoBlur = createFrameDataFixture('stale-auto-blur', {
    createdBy: 'auto-blur',
    effectMode: 'blur',
    height: 18,
    linkedElement: detachedElement,
    width: 70,
    x: 300,
    y: 320,
  });
  scenario.args.linkedElementsRef.current.set(staleAutoBlur.id, detachedElement);
  scenario.args.setFrames([staleAutoBlur]);

  const syncAutoBlurFrames = createSyncAutoBlurFramesHandler(scenario.args);
  const result = syncAutoBlurFrames(createAutoBlurInput(scenario.element));

  expect(result).toEqual({ addedCount: 2, removedCount: 1, skippedCount: 0 });
  expect(scenario.getFrames().some((frame) => frame.id === staleAutoBlur.id)).toBe(false);
  expect(scenario.args.linkedElementsRef.current.has(staleAutoBlur.id)).toBe(false);
  expect(scenario.getFrames()).toHaveLength(2);
}

describe('createAddAutoBlurFramesHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    iframeUtilsMocks.createCompositeSelector.mockReturnValue({
      elementSelector: '#target',
      iframeSelector: null,
    });
    iframeUtilsMocks.getAbsolutePosition.mockReturnValue({
      height: 30,
      width: 90,
      x: 5,
      y: 10,
    });
  });

  it('adds blur frames for selected targets and skips duplicate blur rectangles', () => {
    expectAutoBlurFramesAdded();
  });

  it('clears only auto-blur frames for matching scan targets', () => {
    expectOnlyAutoBlurFramesCleared();
  });

  it('syncs auto-blur frames to the current scan and drops stale page frames', () => {
    expectAutoBlurFramesSyncedToCurrentTargets();
  });
});
