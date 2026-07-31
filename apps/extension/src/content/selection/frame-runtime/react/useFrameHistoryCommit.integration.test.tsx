// @vitest-environment jsdom

import { act, useEffect, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import {
  createBlurSettingsFixture,
  createBorderSettingsFixture,
  createCalloutSettingsFixture,
  createFocusSettingsFixture,
  createFrameDataFixture,
} from './test-support';

const framePlatformMocks = vi.hoisted(() => ({
  createCompositeSelector: vi.fn(),
  createDocumentPagePlacement: vi.fn(),
  getAbsolutePosition: vi.fn(),
  invalidateFrameCache: vi.fn(),
}));

vi.mock('../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/frame')>()),
  createDocumentPagePlacement: framePlatformMocks.createDocumentPagePlacement,
  getAbsolutePosition: framePlatformMocks.getAbsolutePosition,
}));

vi.mock('../../../platform/frame/selectors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/frame/selectors')>()),
  createCompositeSelector: framePlatformMocks.createCompositeSelector,
}));

vi.mock('../../highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../highlighter')>()),
  invalidateFrameCache: framePlatformMocks.invalidateFrameCache,
}));

import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { createAddAutoBlurFramesHandler } from '../mutation-actions/auto-blur';
import type { FrameManagerRefs, FrameSetter } from '../contracts';
import { createPagePreparationHistoryBridge } from '../history/bridge';
import { useHistoryCommitCoordinator } from './useFrameHistoryCommit';
import {
  createSynchronizedFrameSetter,
  syncFrameManagerStateRefs,
  useFrameManagerRefs,
} from './useFrameManagerRefs';

interface FrameHarnessState {
  frames: FrameData[];
  refs: FrameManagerRefs;
  setFrames: FrameSetter;
  withHistoryCommit: ReturnType<typeof useHistoryCommitCoordinator>;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestHarness: FrameHarnessState | null = null;

function Harness() {
  const [frames, setFrameState] = useState<FrameData[]>([]);
  const [frameStates, setFrameStates] = useState<Map<string, FrameState>>(new Map());
  const refs = useFrameManagerRefs();
  syncFrameManagerStateRefs(frames, frameStates, refs);
  const setFrames = useMemo(
    () => createSynchronizedFrameSetter(setFrameState, refs.framesRef),
    [refs.framesRef]
  );
  const withHistoryCommit = useHistoryCommitCoordinator({
    framesRef: refs.framesRef,
    setFrames,
  });
  const bridge = useMemo(
    () => createPagePreparationHistoryBridge({ refs, setFrames, setFrameStates }),
    [refs, setFrames, setFrameStates]
  );

  useEffect(() => {
    pagePreparationHistory.registerBridge(bridge);
    return () => pagePreparationHistory.unregisterBridge(bridge);
  }, [bridge]);

  latestHarness = { frames, refs, setFrames, withHistoryCommit };
  return null;
}

async function renderHarness() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<Harness />));
}

function requireHarness(): FrameHarnessState {
  if (!latestHarness) {
    throw new Error('Expected frame harness to be mounted');
  }
  return latestHarness;
}

describe('frame annotation producer history integration', () => {
  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    document.body.innerHTML = '';
    browserAnnotationSession.resetForDocument();
    pagePreparationHistory.clear();
    framePlatformMocks.createCompositeSelector.mockReset();
    framePlatformMocks.createDocumentPagePlacement.mockReset();
    framePlatformMocks.getAbsolutePosition.mockReset();
    framePlatformMocks.invalidateFrameCache.mockReset();
    framePlatformMocks.createCompositeSelector.mockReturnValue({
      elementSelector: '#target',
      iframeSelector: null,
    });
    framePlatformMocks.createDocumentPagePlacement.mockImplementation((_doc, x, y) => ({
      iframePath: [],
      pageX: x,
      pageY: y,
    }));
    framePlatformMocks.getAbsolutePosition.mockReturnValue({
      height: 30,
      width: 90,
      x: 5,
      y: 10,
    });
    await renderHarness();
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    latestHarness = null;
    pagePreparationHistory.clear();
    browserAnnotationSession.resetForDocument();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('commits frame data and annotation evidence atomically inside an explicit transaction', () => {
    const frame = createFrameDataFixture('frame-1', {
      borderSettings: createBorderSettingsFixture({ name: 'Review' }),
      callout: createCalloutSettingsFixture({ htmlContent: '<p>Check alignment</p>' }),
      height: 140,
      linkedElementSelector: '#target',
      width: 220,
      x: 30,
      y: 40,
    });
    const harness = requireHarness();
    const mutate = harness.withHistoryCommit(() => harness.setFrames([frame]));

    expect(pagePreparationHistory.beginTransaction('frame-settings:frame-1')).toBe(true);
    act(() => mutate());
    expect(browserAnnotationSession.captureSnapshot().frameOrders).toEqual([
      expect.objectContaining({
        borderPresetName: 'Review',
        comment: 'Check alignment',
        frameId: 'frame-1',
        kind: 'linked',
        linkedElementSelector: '#target',
        rect: { height: 140, width: 220, x: 30, y: 40 },
      }),
    ]);
    expect(pagePreparationHistory.commitTransaction('frame-settings:frame-1')).toBe(true);
    expect(pagePreparationHistory.getState().canUndo).toBe(true);

    act(() => pagePreparationHistory.undo());
    expect(requireHarness().refs.framesRef.current).toEqual([]);
    expect(browserAnnotationSession.captureSnapshot().frameOrders).toEqual([]);

    act(() => pagePreparationHistory.redo());
    expect(requireHarness().refs.framesRef.current).toEqual([
      expect.objectContaining({ id: 'frame-1' }),
    ]);
    expect(browserAnnotationSession.captureSnapshot().frameOrders).toEqual([
      expect.objectContaining({ frameId: 'frame-1', frameName: 'Frame 1' }),
    ]);
  });

  it('does not rewrite historical user evidence through the production auto-blur writer', async () => {
    const harness = requireHarness();
    const capturedUserFrame = createFrameDataFixture('user-frame', { x: 10 });
    const addUserFrame = harness.withHistoryCommit(() => harness.setFrames([capturedUserFrame]));
    expect(pagePreparationHistory.beginTransaction('add-user-frame')).toBe(true);
    act(() => addUserFrame());
    expect(pagePreparationHistory.commitTransaction('add-user-frame')).toBe(true);
    expect(browserAnnotationSession.captureSnapshot().frameOrders).toEqual([
      expect.objectContaining({ frameId: 'user-frame', rect: expect.objectContaining({ x: 10 }) }),
    ]);

    const liveDrift = { ...capturedUserFrame, x: 50 };
    act(() => harness.setFrames([liveDrift]));
    const annotationRevisionBeforeAutoBlur = browserAnnotationSession.getState().revision;
    expect(requireHarness().refs.framesRef.current[0]?.x).toBe(50);

    const element = document.createElement('span');
    element.id = 'target';
    document.body.appendChild(element);
    const elementRect = DOMRect.fromRect({ height: 30, width: 90, x: 5, y: 10 });
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(elementRect);
    vi.spyOn(element, 'getClientRects').mockReturnValue({
      0: elementRect,
      [Symbol.iterator]: () => [elementRect][Symbol.iterator](),
      item: (index) => (index === 0 ? elementRect : null),
      length: 1,
    });
    const addAutoBlurFrames = createAddAutoBlurFramesHandler({
      framesRef: harness.refs.framesRef,
      highlighterSettingsCacheRef: {
        current: {
          borderPresets: [createBorderSettingsFixture({ id: 'preset' })],
          defaultBlurSettings: createBlurSettingsFixture(),
          defaultBorderPresetId: 'preset',
          defaultEffectMode: 'border',
          defaultFocusSettings: createFocusSettingsFixture(),
          systemPresetCatalogRevision: 1,
        },
      },
      hostLayoutServiceRef: harness.refs.hostLayoutServiceRef,
      sessionFocusSettingsRef: { current: createFocusSettingsFixture() },
      setFrames: harness.setFrames,
    });
    const mutate = harness.withHistoryCommit(addAutoBlurFrames);

    let result: ReturnType<typeof addAutoBlurFrames> | undefined;
    act(() => {
      result = mutate({
        blurSettings: createBlurSettingsFixture(),
        targets: [
          {
            element,
            id: 'target',
            rect: { height: 30, width: 90, x: 5, y: 10 },
          },
        ],
      });
    });

    expect(result).toEqual({ addedCount: 1, skippedCount: 0 });
    expect(requireHarness().refs.framesRef.current).toHaveLength(2);
    expect(requireHarness().frames).toHaveLength(2);
    expect(new Set(requireHarness().frames.map((frame) => frame.id)).size).toBe(2);
    expect(browserAnnotationSession.getState().revision).toBe(annotationRevisionBeforeAutoBlur);
    expect(browserAnnotationSession.captureSnapshot().frameOrders).toEqual([
      expect.objectContaining({ frameId: 'user-frame', rect: expect.objectContaining({ x: 10 }) }),
    ]);

    await act(async () => vi.runAllTimersAsync());
    expect(pagePreparationHistory.getState().canUndo).toBe(true);

    act(() => pagePreparationHistory.undo());
    expect(requireHarness().refs.framesRef.current).toEqual([
      expect.objectContaining({ id: 'user-frame', x: 50 }),
    ]);
    expect(requireHarness().frames).toEqual([expect.objectContaining({ id: 'user-frame', x: 50 })]);

    act(() => pagePreparationHistory.redo());
    expect(requireHarness().refs.framesRef.current).toHaveLength(2);
    expect(requireHarness().frames).toHaveLength(2);
    expect(browserAnnotationSession.captureSnapshot().frameOrders).toEqual([
      expect.objectContaining({ frameId: 'user-frame', rect: expect.objectContaining({ x: 10 }) }),
    ]);
  });

  it('cancels a deferred transaction and restores frame authority after mutate-then-throw', () => {
    const harness = requireHarness();
    const failedFrame = createFrameDataFixture('failed');
    const mutate = harness.withHistoryCommit(() => {
      harness.setFrames([failedFrame]);
      throw new Error('frame mutation failed');
    });

    expect(() => act(() => mutate())).toThrow('frame mutation failed');

    expect(requireHarness().refs.framesRef.current).toEqual([]);
    expect(requireHarness().frames).toEqual([]);
    expect(browserAnnotationSession.captureSnapshot().frameOrders).toEqual([]);
    expect(pagePreparationHistory.getState()).toMatchObject({ canRedo: false, canUndo: false });
  });
});
