// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { EffectMode, FrameData } from '../../../../features/highlighter/contracts';
import type { FrameManagerRefs } from '../contracts';
import { createFrameDataFixture } from '../test-support';

const mocks = vi.hoisted(() => ({
  captureFrameSessionSnapshot: vi.fn(),
  hydrateFrameSessionSnapshot: vi.fn(),
  resetFrameUi: vi.fn(),
}));

vi.mock('../../../parser/page-preparation/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../parser/page-preparation/history')>()),
  captureFrameSessionSnapshot: mocks.captureFrameSessionSnapshot,
  hydrateFrameSessionSnapshot: mocks.hydrateFrameSessionSnapshot,
}));

vi.mock('../state/frame-ui.store', () => ({
  useFrameUIStore: {
    getState: () => ({
      reset: mocks.resetFrameUi,
    }),
  },
}));

import { applyHistorySnapshotToFrameManager, createPagePreparationHistoryBridge } from './bridge';

function createFrame(id: string): FrameData {
  return createFrameDataFixture(id);
}

function createRefs(): FrameManagerRefs {
  return {
    containerRef: { current: null },
    rootsRef: { current: new Map() },
    linkedElementsRef: { current: new Map() },
    isClearingRef: { current: false },
    framesRef: { current: [] as FrameData[] },
    frameStatesRef: { current: new Map() },
    prevFramesRef: { current: [] as FrameData[] },
    prevFrameStatesRef: { current: new Map() },
    globalEffectModeRef: { current: 'border' as EffectMode },
    sessionBlurSettingsRef: {
      current: { amount: 8, blurType: 'gaussian' as const, showBorder: true },
    },
    sessionFocusSettingsRef: {
      current: { opacity: 0.5, showBorder: false },
    },
    sessionStepBadgeTemplateRef: { current: null },
    sessionCalloutStyleRef: { current: null as Partial<CalloutSettings> | null },
    stepBadgeOrderRef: { current: new Map<string, number>() },
    globalStepBadgeSettingsRef: { current: { autoMode: true } },
    globalStepBadgeAutoModeRef: { current: true },
    highlighterSettingsCacheRef: { current: null },
  };
}

function createAppliedSnapshot() {
  return {
    frames: [],
    globalEffectMode: 'blur' as const,
    globalStepBadgeSettings: { autoMode: false },
    sessionBlurSettings: { amount: 10, blurType: 'gaussian' as const, showBorder: false },
    sessionCalloutStyle: { bgColor: '#111111' },
    sessionFocusSettings: { opacity: 0.7, showBorder: true },
    sessionStepBadgeTemplate: {
      enabled: true,
      anchor: 'top-left' as const,
      offsetDirections: ['up' as const],
      type: 'number' as const,
      alphabet: 'cyrillic' as const,
      value: '',
      sizeLevel: 3 as const,
    },
    stepBadgeOrder: [],
  };
}

function expectAppliedSnapshotState(args: {
  refs: ReturnType<typeof createRefs>;
  frames: FrameData[];
  linkedElements: Map<string, HTMLDivElement>;
  setFrames: ReturnType<typeof vi.fn>;
  setFrameStates: ReturnType<typeof vi.fn>;
  snapshot: ReturnType<typeof createAppliedSnapshot>;
  stepBadgeOrder: Map<string, number>;
}) {
  expect(args.refs.framesRef.current).toEqual(args.frames);
  expect(args.refs.prevFramesRef.current).toEqual(args.frames);
  expect(args.refs.linkedElementsRef.current).toBe(args.linkedElements);
  expect(args.refs.stepBadgeOrderRef.current).toBe(args.stepBadgeOrder);
  expect(args.refs.globalEffectModeRef.current).toBe('blur');
  expect(args.refs.globalStepBadgeSettingsRef.current).toEqual({ autoMode: false });
  expect(args.refs.globalStepBadgeAutoModeRef.current).toBe(false);
  expect(args.refs.sessionBlurSettingsRef.current).toEqual(args.snapshot.sessionBlurSettings);
  expect(args.refs.sessionFocusSettingsRef.current).toEqual(args.snapshot.sessionFocusSettings);
  expect(args.refs.sessionStepBadgeTemplateRef.current).toEqual(
    args.snapshot.sessionStepBadgeTemplate
  );
  expect(args.refs.sessionStepBadgeTemplateRef.current).not.toBe(
    args.snapshot.sessionStepBadgeTemplate
  );
  expect(args.refs.sessionCalloutStyleRef.current).toEqual(args.snapshot.sessionCalloutStyle);
  expect(args.refs.sessionCalloutStyleRef.current).not.toBe(args.snapshot.sessionCalloutStyle);
  expect(args.setFrames).toHaveBeenCalledWith(args.frames);
  expect(args.setFrameStates).toHaveBeenCalledWith(new Map([['frame-1', 'idle']]));
  expect(mocks.resetFrameUi).toHaveBeenCalledTimes(1);
}

describe('frame-manager-history-bridge', () => {
  it(
    'applies hydrated history snapshots into refs, state setters, and frame-ui reset',
    expectHydratedHistorySnapshotApplication
  );

  it('captures snapshots from the current frame-manager refs', expectBridgeSnapshotCapture);
});

function expectHydratedHistorySnapshotApplication() {
  const refs = createRefs();
  const setFrames = vi.fn();
  const setFrameStates = vi.fn();
  const frames = [createFrame('frame-1')];
  const linkedElements = new Map([['frame-1', document.createElement('div')]]);
  const stepBadgeOrder = new Map([['frame-1', 0]]);
  const snapshot = createAppliedSnapshot();
  mocks.hydrateFrameSessionSnapshot.mockReturnValue({
    frames,
    linkedElements,
    stepBadgeOrder,
  });

  applyHistorySnapshotToFrameManager({
    refs,
    setFrames,
    setFrameStates,
    snapshot,
  });

  expectAppliedSnapshotState({
    refs,
    frames,
    linkedElements,
    setFrames,
    setFrameStates,
    snapshot,
    stepBadgeOrder,
  });
}

function expectBridgeSnapshotCapture() {
  const refs = createRefs();
  const setFrames = vi.fn();
  const setFrameStates = vi.fn();
  const frames = [createFrame('frame-1')];
  const expectedSnapshot = { marker: 'snapshot' };
  refs.framesRef.current = frames;
  refs.globalEffectModeRef.current = 'focus';
  refs.globalStepBadgeSettingsRef.current = { autoMode: false };
  refs.sessionBlurSettingsRef.current = {
    amount: 9,
    blurType: 'gaussian',
    showBorder: true,
  };
  refs.sessionFocusSettingsRef.current = { opacity: 0.4, showBorder: true };
  refs.sessionCalloutStyleRef.current = { bgColor: '#fff' };
  refs.stepBadgeOrderRef.current = new Map([['frame-1', 1]]);
  mocks.captureFrameSessionSnapshot.mockReturnValue(expectedSnapshot);

  const bridge = createPagePreparationHistoryBridge({
    refs,
    setFrames,
    setFrameStates,
  });

  expect(bridge.captureSnapshot()).toBe(expectedSnapshot);
  expect(mocks.captureFrameSessionSnapshot).toHaveBeenCalledWith({
    frames,
    globalEffectMode: 'focus',
    globalStepBadgeSettings: { autoMode: false },
    sessionBlurSettings: refs.sessionBlurSettingsRef.current,
    sessionCalloutStyle: refs.sessionCalloutStyleRef.current,
    sessionFocusSettings: refs.sessionFocusSettingsRef.current,
    sessionStepBadgeTemplate: null,
    stepBadgeOrder: refs.stepBadgeOrderRef.current,
  });
}
