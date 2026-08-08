// @vitest-environment jsdom

import type { Dispatch, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AppliedBorderSettings,
  BlurSettings,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import type { StepBadgeSettings } from '../../../../features/highlighter/contracts';
import { createFrameDataFixture } from '../react/test-support';
import { createAddFrameHandler, createAddFreeFrameHandler } from './frame-factory';
import { consumeFrameCalloutEditRequest, useFrameUIStore } from '../state/frame-ui.store';
import { setFrameSessionBorderPreset } from '../session/border-preset';
import { createFrameHostLayoutService } from '../host-layout/service';
import { createDefaultCalloutSettings } from '../../../../features/highlighter/frame-annotation/callout/model';
import { setFutureFrameCallout } from '../session/future-callout';
import { applyAutoStepBadgeValues } from '../../../../features/highlighter/frame-annotation/step-badge/auto-values';

const invalidateFrameCache = vi.hoisted(() => vi.fn());

vi.mock('../../highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../highlighter')>()),
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
        customCss: '',
        fillPaint: { kind: 'solid' as const, color: '#00000000' },
        inheritCustomCss: false,
      },
    ],
    defaultBorderPresetId: 'preset-1',
    defaultEffectMode: 'border',
    systemPresetCatalogRevision: 1,
    defaultBlurSettings: createBlurSettings(),
    defaultFocusSettings: createFocusSettings(),
  };
}

function createOptions(initialFrames: Array<ReturnType<typeof createFrameDataFixture>> = []) {
  let currentFrames = [...initialFrames];
  const setFrames = vi.fn<Dispatch<SetStateAction<typeof currentFrames>>>((updater) => {
    currentFrames = typeof updater === 'function' ? updater(currentFrames) : updater;
  });
  const hostLayoutServiceRef = { current: createFrameHostLayoutService() };
  const recalculateStepBadgesRef = {
    current: vi.fn<(excludeFrameId?: string) => void>((excludeFrameId) => {
      setFrames((frames) => applyAutoStepBadgeValues(frames, new Map(), excludeFrameId));
    }),
  };
  const highlighterSettings = createHighlighterSettings();
  setFrameSessionBorderPreset(highlighterSettings.borderPresets[0]!);

  return {
    currentFrames: () => currentFrames,
    setFrames,
    hostLayoutServiceRef,
    recalculateStepBadgesRef,
    options: {
      setFrames,
      framesRef: { current: currentFrames },
      hostLayoutServiceRef,
      globalEffectModeRef: { current: 'border' as const },
      globalStepBadgeAutoModeRef: { current: true },
      sessionBlurSettingsRef: { current: createBlurSettings() },
      sessionFocusSettingsRef: { current: createFocusSettings() },
      sessionStepBadgeTemplateRef: {
        current: createStepBadgeTemplate() as StepBadgeSettings | null,
      },
      highlighterSettingsCacheRef: { current: highlighterSettings },
      recalculateStepBadgesRef,
      calculateFrameCoords: (_element: HTMLElement, borderSettings?: AppliedBorderSettings) =>
        createFrameDataFixture('frame-1', {
          ...(borderSettings === undefined ? {} : { borderSettings }),
          pagePlacement: { iframePath: [], pageX: 10, pageY: 20 },
          width: 100,
        }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  document.body.replaceChildren();
  useFrameUIStore.getState().reset();
  setFutureFrameCallout(null);
});

function createVisibleElement(tagName = 'button') {
  const element = document.createElement(tagName);
  const rect = DOMRect.fromRect({ x: 10, y: 20, width: 120, height: 80 });
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect);
  vi.spyOn(element, 'getClientRects').mockReturnValue({
    0: rect,
    [Symbol.iterator]: () => [rect][Symbol.iterator](),
    item: (index) => (index === 0 ? rect : null),
    length: 1,
  });
  document.body.append(element);
  return element;
}

function verifyAddFrameUsesSessionDefaultsAndBadgeAutoMode() {
  const { currentFrames, hostLayoutServiceRef, recalculateStepBadgesRef, options } =
    createOptions();
  const addFrame = createAddFrameHandler(options);
  const element = createVisibleElement();

  const frame = addFrame(element);
  vi.runAllTimers();

  expect(frame).not.toBeNull();
  expect(frame).toMatchObject({
    id: 'frame-1',
    effectMode: 'border',
    blurSettings: createBlurSettings(),
    focusSettings: createFocusSettings(),
    borderSettings: expect.objectContaining({
      sourcePresetId: 'preset-1',
      sourcePresetName: 'Orange',
    }),
    stepBadge: expect.objectContaining({
      enabled: true,
      value: '',
      auto: true,
    }),
  });
  expect(currentFrames()).toHaveLength(1);
  expect(hostLayoutServiceRef.current.getNode('frame-1')).toBe(element);
  expect(invalidateFrameCache).toHaveBeenCalledTimes(1);
  expect(recalculateStepBadgesRef.current).toHaveBeenCalledWith();
}

function verifyAddFrameSkipsBadgeRecalcWithoutTemplate() {
  const { currentFrames, recalculateStepBadgesRef, options } = createOptions();
  options.globalStepBadgeAutoModeRef.current = false;
  options.sessionStepBadgeTemplateRef.current = null;
  const addFrame = createAddFrameHandler(options);

  addFrame(createVisibleElement('div'));
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

  it('uses explicit session settings instead of the last existing frame', () => {
    const previousFrame = createFrameDataFixture('previous-frame', {
      effectMode: 'focus',
      blurSettings: { amount: 30, blurType: 'pixelate', showBorder: false },
      focusSettings: { opacity: 0.9, showBorder: true },
    });
    const { options } = createOptions([previousFrame]);

    const frame = createAddFrameHandler(options)(createVisibleElement());

    expect(frame).not.toBeNull();
    if (!frame) throw new Error('Expected accepted linked frame');
    expect(frame.effectMode).toBe('border');
    expect(frame.blurSettings).toEqual(createBlurSettings());
    expect(frame.focusSettings).toEqual(createFocusSettings());
  });

  it('accepts a visible aria-hidden label that proxies an interactive checkbox', () => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'p-lang-btn-checkbox';
    const label = createVisibleElement('label') as HTMLLabelElement;
    label.htmlFor = input.id;
    label.setAttribute('aria-hidden', 'true');
    document.body.prepend(input);
    const { currentFrames, hostLayoutServiceRef, options } = createOptions();

    const frame = createAddFrameHandler(options)(label);

    expect(frame).not.toBeNull();
    expect(currentFrames()).toHaveLength(1);
    expect(hostLayoutServiceRef.current.getNode('frame-1')).toBe(label);
  });

  it('selects a newly drawn free frame and closes the previous toolbar owner', () => {
    const { options } = createOptions();
    useFrameUIStore.getState().selectFrame('previous-frame');
    const { calculateFrameCoords: _calculateFrameCoords, ...freeOptions } = options;
    const addFreeFrame = createAddFreeFrameHandler({
      ...freeOptions,
      generateFrameId: () => 'free-frame',
    });

    addFreeFrame({
      x: 20,
      y: 30,
      width: 120,
      height: 90,
      pagePlacement: { pageX: 20, pageY: 30, iframePath: [] },
    });

    expect(useFrameUIStore.getState()).toMatchObject({
      hoveredFrameId: null,
      selectedFrameId: 'free-frame',
    });
  });

  it('copies the enabled session comment into a new frame and requests immediate editing', () => {
    const { currentFrames, options, recalculateStepBadgesRef } = createOptions();
    const settings = createDefaultCalloutSettings();
    setFutureFrameCallout(settings);
    const frame = createAddFrameHandler(options)(createVisibleElement());

    expect(frame?.callout).toEqual(settings);
    expect(frame?.callout).not.toBe(settings);
    expect(recalculateStepBadgesRef.current).toHaveBeenCalledOnce();
    expect(currentFrames()[0]?.stepBadge?.value).toBe('1');
    expect(consumeFrameCalloutEditRequest('frame-1')).toBe(true);
    expect(consumeFrameCalloutEditRequest('frame-1')).toBe(false);
  });

  it.each([
    ['hidden target', (element: HTMLElement) => (element.hidden = true)],
    ['detached target', (element: HTMLElement) => element.remove()],
  ])('does not append linked intent with unaccepted geometry for a %s', (_label, invalidate) => {
    const { currentFrames, hostLayoutServiceRef, options } = createOptions();
    const element = createVisibleElement();
    invalidate(element);

    const frame = createAddFrameHandler(options)(element);

    expect(frame).toBeNull();
    expect(currentFrames()).toEqual([]);
    expect(hostLayoutServiceRef.current.getNode('frame-1')).toBeNull();
    expect(invalidateFrameCache).not.toHaveBeenCalled();
  });

  it.each([
    ['zero width', { kind: 'width', value: 0 }],
    ['non-finite x', { kind: 'x', value: Number.NaN }],
  ])('does not append linked intent with %s geometry', (_label, invalidGeometry) => {
    const { currentFrames, hostLayoutServiceRef, options } = createOptions();
    options.calculateFrameCoords = (_element, borderSettings) =>
      createFrameDataFixture('frame-1', {
        ...(borderSettings ? { borderSettings } : {}),
        pagePlacement: {
          iframePath: [],
          pageX: invalidGeometry.kind === 'x' ? invalidGeometry.value : 10,
          pageY: 20,
        },
        ...(invalidGeometry.kind === 'x'
          ? { x: invalidGeometry.value }
          : { width: invalidGeometry.value }),
      });

    const frame = createAddFrameHandler(options)(createVisibleElement());

    expect(frame).toBeNull();
    expect(currentFrames()).toEqual([]);
    expect(hostLayoutServiceRef.current.getNode('frame-1')).toBeNull();
  });
});
