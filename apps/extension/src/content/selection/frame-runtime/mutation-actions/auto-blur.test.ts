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
  createDocumentPagePlacement: vi.fn((_doc: Document, x: number, y: number) => ({
    iframePath: [],
    pageX: x,
    pageY: y,
  })),
  getAbsolutePosition: vi.fn(),
  getContainingIframe: vi.fn(),
  getDocumentViewportBounds: vi.fn(),
  getTopViewportPoint: vi.fn(),
  invalidateFrameCache: vi.fn(),
  resolveDocumentPagePlacement: vi.fn(),
}));

vi.mock('../../../platform/frame', () => ({
  createDocumentPagePlacement: iframeUtilsMocks.createDocumentPagePlacement,
  getAbsolutePosition: iframeUtilsMocks.getAbsolutePosition,
  getContainingIframe: iframeUtilsMocks.getContainingIframe,
  getDocumentViewportBounds: iframeUtilsMocks.getDocumentViewportBounds,
  getTopViewportPoint: iframeUtilsMocks.getTopViewportPoint,
  resolveDocumentPagePlacement: iframeUtilsMocks.resolveDocumentPagePlacement,
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
import { useFrameUIStore } from '../state/frame-ui.store';
import { getBlurOverlayBox } from '../effects/geometry';
import { createFrameHostLayoutService } from '../host-layout/service';

type HandlerArgs = Parameters<typeof createAddAutoBlurFramesHandler>[0];

function createRectList(rect: DOMRect): DOMRectList {
  return {
    0: rect,
    [Symbol.iterator]: () => [rect][Symbol.iterator](),
    item: (index) => (index === 0 ? rect : null),
    length: 1,
  };
}

function createHandlerScenario() {
  const element = document.createElement('span');
  document.body.appendChild(element);
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() =>
    DOMRect.fromRect(
      iframeUtilsMocks.getAbsolutePosition() ?? {
        height: 30,
        width: 90,
        x: 5,
        y: 10,
      }
    )
  );
  vi.spyOn(element, 'getClientRects').mockImplementation(() =>
    createRectList(element.getBoundingClientRect())
  );
  const existingFrame = createFrameDataFixture('existing-blur', {
    effectMode: 'blur',
    height: 20,
    width: 80,
    x: 10,
    y: 20,
  });
  let frames: FrameData[] = [existingFrame];
  const framesRef = { current: frames };
  const setFrames = vi.fn<Dispatch<SetStateAction<FrameData[]>>>((updater) => {
    frames = typeof updater === 'function' ? updater(frames) : updater;
    framesRef.current = frames;
  });
  const args: HandlerArgs = {
    framesRef,
    highlighterSettingsCacheRef: {
      current: {
        borderPresets: [createBorderSettingsFixture({ id: 'preset-1', color: '#ff0000' })],
        defaultBlurSettings: createBlurSettingsFixture(),
        defaultBorderPresetId: 'preset-1',
        defaultEffectMode: 'border',
        systemPresetCatalogRevision: 1,
        defaultFocusSettings: createFocusSettingsFixture(),
      },
    },
    hostLayoutServiceRef: { current: createFrameHostLayoutService() },
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

function expectAddedFrame(frame: FrameData | undefined, _element: HTMLElement) {
  expect(frame).toMatchObject({
    blurSettings: { amount: 22, blurType: 'solid', showBorder: true },
    createdBy: 'auto-blur',
    effectMode: 'blur',
    height: 22,
    linkedElementSelector: '#target',
    offset: { height: -8, width: -16, x: 93, y: 108 },
    width: 74,
    x: 98,
    y: 118,
  });
  expect(getBlurOverlayBox(frame!)).toEqual({ height: 22, width: 74, x: 98, y: 118 });
}

function expectAutoBlurFramesAdded() {
  const scenario = createHandlerScenario();
  const addAutoBlurFrames = createAddAutoBlurFramesHandler(scenario.args);

  const result = addAutoBlurFrames(createAutoBlurInput(scenario.element));

  const addedFrame = scenario.getFrames()[1];
  expect(result).toEqual({ addedCount: 1, skippedCount: 1 });
  expectAddedFrame(addedFrame, scenario.element);
  expect(scenario.args.hostLayoutServiceRef.current.getNode(addedFrame?.id ?? '')).toBe(
    scenario.element
  );
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
  scenario.args.hostLayoutServiceRef.current.link(autoBlur.id, scenario.element, '#target');
  scenario.args.setFrames([manualBlur, autoBlur]);
  useFrameUIStore.getState().selectFrame(autoBlur.id, { x: 12, y: 16 });
  useFrameUIStore.getState().togglePopover(autoBlur.id, 'frame-settings');

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
  expect(scenario.args.hostLayoutServiceRef.current.getNode(autoBlur.id)).toBeNull();
  expect(useFrameUIStore.getState()).toMatchObject({
    activePopover: null,
    selectedFrameId: null,
    toolbarAnchorOffset: null,
  });
}

function expectAutoBlurFramesSyncedToCurrentTargets() {
  const scenario = createHandlerScenario();
  const detachedElement = document.createElement('span');
  const staleAutoBlur = createFrameDataFixture('stale-auto-blur', {
    createdBy: 'auto-blur',
    effectMode: 'blur',
    height: 18,
    linkedElementSelector: '#stale-target',
    width: 70,
    x: 300,
    y: 320,
  });
  scenario.args.hostLayoutServiceRef.current.link(
    staleAutoBlur.id,
    detachedElement,
    '#stale-target'
  );
  scenario.args.setFrames([staleAutoBlur]);
  useFrameUIStore.getState().selectFrame(staleAutoBlur.id, { x: 8, y: 10 });
  useFrameUIStore.getState().togglePopover(staleAutoBlur.id, 'frame-settings');

  const syncAutoBlurFrames = createSyncAutoBlurFramesHandler(scenario.args);
  const result = syncAutoBlurFrames(createAutoBlurInput(scenario.element));

  expect(result).toEqual({ addedCount: 2, removedCount: 1, skippedCount: 0 });
  expect(scenario.getFrames().some((frame) => frame.id === staleAutoBlur.id)).toBe(false);
  expect(scenario.args.hostLayoutServiceRef.current.getNode(staleAutoBlur.id)).toBeNull();
  expect(scenario.getFrames()).toHaveLength(2);
  expect(useFrameUIStore.getState()).toMatchObject({
    activePopover: null,
    selectedFrameId: null,
    toolbarAnchorOffset: null,
  });
}

describe('createAddAutoBlurFramesHandler', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    useFrameUIStore.getState().reset();
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
    iframeUtilsMocks.getContainingIframe.mockReturnValue(null);
    iframeUtilsMocks.getDocumentViewportBounds.mockReturnValue({
      height: window.innerHeight,
      width: window.innerWidth,
      x: 0,
      y: 0,
    });
    iframeUtilsMocks.getTopViewportPoint.mockImplementation(
      (_document: Document, x: number, y: number) => ({ x, y })
    );
    iframeUtilsMocks.resolveDocumentPagePlacement.mockImplementation((placement) => ({
      x: placement.pageX,
      y: placement.pageY,
    }));
  });

  it('adds blur frames for selected targets and skips duplicate blur rectangles', () => {
    expectAutoBlurFramesAdded();
  });

  it('expands the blur overlay by the configured frame padding', () => {
    const scenario = createHandlerScenario();
    const preset = scenario.args.highlighterSettingsCacheRef.current!.borderPresets[0]!;
    preset.padding = { bottom: 3, left: 2, right: 4, top: 1 };

    createAddAutoBlurFramesHandler(scenario.args)(createAutoBlurInput(scenario.element));

    expect(getBlurOverlayBox(scenario.getFrames()[1]!)).toEqual({
      height: 26,
      width: 80,
      x: 96,
      y: 117,
    });
  });

  it('clears only auto-blur frames for matching scan targets', () => {
    expectOnlyAutoBlurFramesCleared();
  });

  it('syncs auto-blur frames to the current scan and drops stale page frames', () => {
    expectAutoBlurFramesSyncedToCurrentTargets();
  });

  it('rejects an offscreen DOM anchor before frame state is published', () => {
    const scenario = createHandlerScenario();
    const committedBeforeAdd = scenario.getFrames();
    const pendingUpdates: SetStateAction<FrameData[]>[] = [];
    scenario.args.setFrames = vi.fn((update) => pendingUpdates.push(update));
    iframeUtilsMocks.getAbsolutePosition.mockReturnValue({
      height: 30,
      width: 90,
      x: 5,
      y: 2400,
    });

    const result = createAddAutoBlurFramesHandler(scenario.args)({
      blurSettings: createBlurSettingsFixture({ amount: 22, blurType: 'solid' }),
      targets: [
        {
          element: scenario.element,
          id: 'offscreen',
          rect: { height: 18, width: 70, x: 100, y: 2420 },
        },
      ],
    });

    expect(result).toEqual({ addedCount: 0, skippedCount: 1 });
    expect(scenario.getFrames()).toBe(committedBeforeAdd);
    expect(pendingUpdates).toEqual([]);
    expect(scenario.args.hostLayoutServiceRef.current.getSnapshot().presentations.size).toBe(0);
  });

  it('cleans transient UI before a deferred React frame updater is flushed', () => {
    const element = document.createElement('span');
    const autoBlur = createFrameDataFixture('auto-blur', {
      createdBy: 'auto-blur',
      linkedElementSelector: '#target',
    });
    let committedFrames = [autoBlur];
    const pendingUpdates: SetStateAction<FrameData[]>[] = [];
    const framesRef = { current: committedFrames };
    const hostLayoutService = createFrameHostLayoutService();
    hostLayoutService.link(autoBlur.id, element, '#target');
    const hostLayoutServiceRef = { current: hostLayoutService };
    const setFrames = vi.fn<Dispatch<SetStateAction<FrameData[]>>>((update) => {
      pendingUpdates.push(update);
    });
    useFrameUIStore.getState().selectFrame(autoBlur.id, { x: 4, y: 6 });
    useFrameUIStore.getState().togglePopover(autoBlur.id, 'frame-settings');

    const result = createClearAutoBlurFramesHandler({
      framesRef,
      hostLayoutServiceRef,
      setFrames,
    })({ targets: [] });

    expect(result).toEqual({ removedCount: 1 });
    expect(committedFrames).toEqual([autoBlur]);
    expect(framesRef.current).toEqual([]);
    expect(hostLayoutService.getNode(autoBlur.id)).toBeNull();
    expect(useFrameUIStore.getState()).toMatchObject({
      activePopover: null,
      selectedFrameId: null,
      toolbarAnchorOffset: null,
    });

    const pendingUpdate = pendingUpdates[0];
    expect(pendingUpdate).toBeTypeOf('function');
    committedFrames =
      typeof pendingUpdate === 'function' ? pendingUpdate(committedFrames) : pendingUpdate!;
    expect(committedFrames).toEqual([]);
  });
});
