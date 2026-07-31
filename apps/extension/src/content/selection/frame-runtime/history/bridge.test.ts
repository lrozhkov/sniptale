// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { EffectMode, FrameData } from '../../../../features/highlighter/contracts';
import type { FrameManagerRefs } from '../contracts';
import { createFrameDataFixture } from '../test-support';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { cloneBorderPreset } from '../../../../features/highlighter/presets/catalog';
import { getFrameSessionBorderPreset, setFrameSessionBorderPreset } from '../session/border-preset';
import { getCurrentBorderPreset as getHoverBorderPreset } from '../../highlighter-hover-preview/session';
import { createFrameHostLayoutService } from '../host-layout/service';

const mocks = vi.hoisted(() => ({
  applyAnnotationSnapshot: vi.fn(),
  captureAnnotationSnapshot: vi.fn(() => ({
    domRecords: [],
    frameOrders: [],
    nextAnnotationId: 1,
    nextMarkerNumber: 1,
    nextCreationOrder: 1,
    schemaVersion: 1 as const,
  })),
  captureFrameSessionSnapshot: vi.fn(),
  hydrateFrameSessionSnapshot: vi.fn(),
  resetFrameUi: vi.fn(),
}));

vi.mock('../../../parser/page-preparation/annotations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../parser/page-preparation/annotations')>()),
  browserAnnotationSession: {
    applySnapshot: mocks.applyAnnotationSnapshot,
    captureSnapshot: mocks.captureAnnotationSnapshot,
  },
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
    hostLayoutServiceRef: { current: createFrameHostLayoutService() },
    isClearingRef: { current: false },
    framesRef: { current: [] as FrameData[] },
    frameStatesRef: { current: new Map() },
    prevFramesRef: { current: [] as FrameData[] },
    prevFrameStatesRef: { current: new Map() },
    globalEffectModeRef: { current: 'border' as EffectMode },
    sessionSettingsRefs: {
      blurSettings: {
        current: { amount: 8, blurType: 'gaussian' as const, showBorder: true },
      },
      defaultsInitialized: { current: false },
      focusSettings: {
        current: { opacity: 0.5, showBorder: false },
      },
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
    sessionBorderPreset: cloneBorderPreset(DEFAULT_BORDER_PRESET),
    sessionBlurSettings: { amount: 10, blurType: 'gaussian' as const, showBorder: false },
    sessionCalloutStyle: { bgColor: '#111111' },
    sessionFocusSettings: { opacity: 0.7, showBorder: true },
    sessionStepBadgeTemplate: {
      enabled: true,
      anchor: 'top-left' as const,
      offsetDirections: ['up' as const],
      manualPlacement: { position: 0.4, side: 'top' as const },
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
  setFrames: ReturnType<typeof vi.fn>;
  setFrameStates: ReturnType<typeof vi.fn>;
  snapshot: ReturnType<typeof createAppliedSnapshot>;
  stepBadgeOrder: Map<string, number>;
}) {
  expect(args.refs.framesRef.current).toEqual(args.frames);
  expect(args.refs.prevFramesRef.current).toEqual(args.frames);
  expect(args.refs.hostLayoutServiceRef.current.getSnapshot()).toBeDefined();
  expect(args.refs.stepBadgeOrderRef.current).toBe(args.stepBadgeOrder);
  expect(args.refs.globalEffectModeRef.current).toBe('blur');
  expect(args.refs.globalStepBadgeSettingsRef.current).toEqual({ autoMode: false });
  expect(args.refs.globalStepBadgeAutoModeRef.current).toBe(false);
  expect(getFrameSessionBorderPreset()).toEqual(args.snapshot.sessionBorderPreset);
  expect(getFrameSessionBorderPreset()).not.toBe(args.snapshot.sessionBorderPreset);
  expect(getHoverBorderPreset()).toEqual(args.snapshot.sessionBorderPreset);
  expect(args.refs.sessionSettingsRefs.blurSettings.current).toEqual(
    args.snapshot.sessionBlurSettings
  );
  expect(args.refs.sessionSettingsRefs.focusSettings.current).toEqual(
    args.snapshot.sessionFocusSettings
  );
  expect(args.refs.sessionSettingsRefs.defaultsInitialized.current).toBe(true);
  expect(args.refs.sessionStepBadgeTemplateRef.current).toEqual(
    args.snapshot.sessionStepBadgeTemplate
  );
  expect(args.refs.sessionStepBadgeTemplateRef.current).not.toBe(
    args.snapshot.sessionStepBadgeTemplate
  );
  expect(args.refs.sessionStepBadgeTemplateRef.current?.manualPlacement).not.toBe(
    args.snapshot.sessionStepBadgeTemplate.manualPlacement
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

  it('restores annotation and frame snapshots through one bridge apply', () => {
    const refs = createRefs();
    const frameSession = createAppliedSnapshot();
    const annotations = mocks.captureAnnotationSnapshot();
    mocks.hydrateFrameSessionSnapshot.mockReturnValue({ frames: [], stepBadgeOrder: new Map() });
    const bridge = createPagePreparationHistoryBridge({
      refs,
      setFrames: vi.fn(),
      setFrameStates: vi.fn(),
    });

    bridge.applySnapshot({ annotations, frameSession });

    expect(mocks.applyAnnotationSnapshot).toHaveBeenCalledWith(annotations);
  });

  it('does not apply annotations when frame restoration fails', () => {
    const refs = createRefs();
    const frameSession = createAppliedSnapshot();
    const annotations = mocks.captureAnnotationSnapshot();
    mocks.applyAnnotationSnapshot.mockClear();
    mocks.hydrateFrameSessionSnapshot.mockReturnValue({ frames: [], stepBadgeOrder: new Map() });
    vi.spyOn(refs.hostLayoutServiceRef.current, 'restoreFrames').mockImplementation(() => {
      throw new Error('frame restore failed');
    });
    const bridge = createPagePreparationHistoryBridge({
      refs,
      setFrames: vi.fn(),
      setFrameStates: vi.fn(),
    });

    expect(() => bridge.applySnapshot({ annotations, frameSession })).toThrow(
      'frame restore failed'
    );
    expect(mocks.applyAnnotationSnapshot).not.toHaveBeenCalled();
  });
});

function expectHydratedHistorySnapshotApplication() {
  const refs = createRefs();
  const restoreFrames = vi.spyOn(refs.hostLayoutServiceRef.current, 'restoreFrames');
  const setFrames = vi.fn();
  const setFrameStates = vi.fn();
  const frames = [createFrame('frame-1')];
  const stepBadgeOrder = new Map([['frame-1', 0]]);
  const snapshot = createAppliedSnapshot();
  mocks.hydrateFrameSessionSnapshot.mockReturnValue({
    frames,
    stepBadgeOrder,
  });

  applyHistorySnapshotToFrameManager({
    refs,
    setFrames,
    setFrameStates,
    snapshot: {
      annotations: mocks.captureAnnotationSnapshot(),
      frameSession: snapshot,
    },
  });
  expect(restoreFrames).toHaveBeenCalledWith(frames);

  expectAppliedSnapshotState({
    refs,
    frames,
    setFrames,
    setFrameStates,
    snapshot,
    stepBadgeOrder,
  });
}

function expectBridgeSnapshotCapture() {
  const refs = createRefs();
  const retireHistoryBindings = vi.spyOn(
    refs.hostLayoutServiceRef.current,
    'retireHistoryBindings'
  );
  const setFrames = vi.fn();
  const setFrameStates = vi.fn();
  const frames = [createFrame('frame-1')];
  const expectedSnapshot = { marker: 'snapshot' };
  refs.framesRef.current = frames;
  refs.globalEffectModeRef.current = 'focus';
  refs.globalStepBadgeSettingsRef.current = { autoMode: false };
  setFrameSessionBorderPreset(DEFAULT_BORDER_PRESET);
  refs.sessionSettingsRefs.blurSettings.current = {
    amount: 9,
    blurType: 'gaussian',
    showBorder: true,
  };
  refs.sessionSettingsRefs.focusSettings.current = { opacity: 0.4, showBorder: true };
  refs.sessionCalloutStyleRef.current = { bgColor: '#fff' };
  refs.stepBadgeOrderRef.current = new Map([['frame-1', 1]]);
  mocks.captureFrameSessionSnapshot.mockReturnValue(expectedSnapshot);

  const bridge = createPagePreparationHistoryBridge({
    refs,
    setFrames,
    setFrameStates,
  });

  expect(bridge.captureSnapshot()).toEqual({
    annotations: mocks.captureAnnotationSnapshot(),
    frameSession: expectedSnapshot,
  });
  bridge.onHistoryCleared?.();
  expect(retireHistoryBindings).toHaveBeenCalledTimes(1);
  bridge.onHistoryReachabilityChanged?.(['frame-1']);
  expect(retireHistoryBindings).toHaveBeenLastCalledWith(['frame-1']);
  expect(mocks.captureFrameSessionSnapshot).toHaveBeenCalledWith({
    frames,
    globalEffectMode: 'focus',
    globalStepBadgeSettings: { autoMode: false },
    sessionBorderPreset: getFrameSessionBorderPreset(),
    sessionBlurSettings: refs.sessionSettingsRefs.blurSettings.current,
    sessionCalloutStyle: refs.sessionCalloutStyleRef.current,
    sessionFocusSettings: refs.sessionSettingsRefs.focusSettings.current,
    sessionStepBadgeTemplate: null,
    stepBadgeOrder: refs.stepBadgeOrderRef.current,
  });
}
