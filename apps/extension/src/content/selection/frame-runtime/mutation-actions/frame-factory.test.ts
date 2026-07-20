// @vitest-environment jsdom

import type { Dispatch, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BorderPreset,
  BlurSettings,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import type { StepBadgeSettings } from '../../../../features/highlighter/contracts';
import { createFrameDataFixture } from '../react/test-support';
import { createAddFrameHandler } from './frame-factory';

const invalidateFrameCache = vi.hoisted(() => vi.fn());

vi.mock('../../highlighter', () => ({
  invalidateFrameCache,
}));

function createBlurSettings(): BlurSettings {
  return {
    amount: 12,
    blurType: 'gaussian',
    showBorder: true,
  };
}

function createFocusSettings(): FocusSettings {
  return {
    opacity: 0.45,
    showBorder: false,
  };
}

function createStepBadgeTemplate(): StepBadgeSettings {
  return {
    enabled: true,
    anchor: 'top-left',
    type: 'number',
    value: '4',
    auto: true,
    sizeLevel: 2,
    offsetDirections: [],
  };
}

function createHighlighterSettings(): HighlighterSettings {
  return {
    borderPresets: [
      {
        id: 'preset-1',
        name: 'Orange',
        isSystemDefault: true,
        order: 0,
        width: 3,
        color: '#ff671d',
        style: 'solid',
        radius: 8,
        padding: {
          top: 4,
          right: 5,
          bottom: 6,
          left: 7,
        },
        shadow: 30,
        opacity: 90,
        customCss: '',
        fillColor: '#00000000',
        fillOpacity: 0,
        inheritCustomCss: false,
        strokeOpacity: 100,
      },
    ],
    defaultBorderPresetId: 'preset-1',
    defaultEffectMode: 'border',
    defaultBlurSettings: createBlurSettings(),
    defaultFocusSettings: createFocusSettings(),
  };
}

function createOptions() {
  let currentFrames: Array<ReturnType<typeof createFrameDataFixture>> = [];
  const setFrames = vi.fn<Dispatch<SetStateAction<typeof currentFrames>>>((updater) => {
    currentFrames = typeof updater === 'function' ? updater(currentFrames) : updater;
  });
  const linkedElementsRef = { current: new Map<string, HTMLElement>() };
  const recalculateStepBadgesRef = { current: vi.fn<(excludeFrameId?: string) => void>() };

  return {
    currentFrames: () => currentFrames,
    setFrames,
    linkedElementsRef,
    recalculateStepBadgesRef,
    options: {
      setFrames,
      framesRef: { current: currentFrames },
      linkedElementsRef,
      globalEffectModeRef: { current: 'border' as const },
      globalStepBadgeAutoModeRef: { current: true },
      sessionBlurSettingsRef: { current: createBlurSettings() },
      sessionFocusSettingsRef: { current: createFocusSettings() },
      sessionStepBadgeTemplateRef: {
        current: createStepBadgeTemplate() as StepBadgeSettings | null,
      },
      highlighterSettingsCacheRef: { current: createHighlighterSettings() },
      recalculateStepBadgesRef,
      calculateFrameCoords: (element: HTMLElement, borderSettings?: BorderPreset) =>
        createFrameDataFixture('frame-1', {
          linkedElement: element,
          ...(borderSettings === undefined ? {} : { borderSettings }),
          width: 100,
        }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

function verifyAddFrameUsesSessionDefaultsAndBadgeAutoMode() {
  const { currentFrames, linkedElementsRef, recalculateStepBadgesRef, options } = createOptions();
  const addFrame = createAddFrameHandler(options);
  const element = document.createElement('button');

  const frame = addFrame(element);
  vi.runAllTimers();

  expect(frame).toMatchObject({
    id: 'frame-1',
    effectMode: 'border',
    blurSettings: createBlurSettings(),
    focusSettings: createFocusSettings(),
    borderSettings: expect.objectContaining({
      id: 'preset-1',
      name: 'Orange',
    }),
    stepBadge: expect.objectContaining({
      enabled: true,
      value: '',
      auto: true,
    }),
  });
  expect(currentFrames()).toHaveLength(1);
  expect(linkedElementsRef.current.get('frame-1')).toBe(element);
  expect(invalidateFrameCache).toHaveBeenCalledTimes(1);
  expect(recalculateStepBadgesRef.current).toHaveBeenCalledWith();
}

function verifyAddFrameSkipsBadgeRecalcWithoutTemplate() {
  const { currentFrames, recalculateStepBadgesRef, options } = createOptions();
  options.globalStepBadgeAutoModeRef.current = false;
  options.sessionStepBadgeTemplateRef.current = null;
  const addFrame = createAddFrameHandler(options);

  addFrame(document.createElement('div'));
  vi.runAllTimers();

  expect(currentFrames()[0]).not.toHaveProperty('stepBadge');
  expect(recalculateStepBadgesRef.current).not.toHaveBeenCalled();
  expect(invalidateFrameCache).toHaveBeenCalledTimes(1);
}

describe('frame mutation action frame factory', () => {
  it(
    'creates a frame with session defaults, default border settings, and auto badge recalculation',
    verifyAddFrameUsesSessionDefaultsAndBadgeAutoMode
  );

  it(
    'skips step badge scheduling when the session does not provide a badge template',
    verifyAddFrameSkipsBadgeRecalcWithoutTemplate
  );
});
