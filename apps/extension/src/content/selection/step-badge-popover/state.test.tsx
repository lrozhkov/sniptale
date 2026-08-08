// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { addFrameStepBadgeChangedListener } from '../../platform/page-context/frame-events';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import { useStepBadgePopoverState } from './state';
import { createSystemStepBadgePresetCatalog } from '../../../features/highlighter/step-badge-presets/catalog';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useStepBadgePopoverState> | null = null;
let onCloseSpy: Mock<() => void> | null = null;
let isOpen = true;
let currentStepBadge: StepBadgeSettings | undefined;

function Harness() {
  const props = {
    anchorEl: null,
    frameId: 'frame-1',
    isOpen,
    onClose: () => onCloseSpy?.(),
    ...(currentStepBadge === undefined ? {} : { stepBadge: currentStepBadge }),
  };

  latestState = useStepBadgePopoverState({
    ...props,
    locale: 'ru',
  });

  return null;
}

function renderHarness(stepBadge?: StepBadgeSettings, nextIsOpen = true) {
  currentStepBadge = stepBadge;
  isOpen = nextIsOpen;
  onCloseSpy = vi.fn<() => void>();

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestState = null;
  currentStepBadge = undefined;
  isOpen = true;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  onCloseSpy = null;
  vi.restoreAllMocks();
});

function verifyDisablesBadgeAndCloses() {
  const listener = vi.fn();
  const cleanup = addFrameStepBadgeChangedListener(listener);

  renderHarness();
  act(() => {
    latestState?.handleEnabledChange(false);
  });

  expect(listener).toHaveBeenCalledWith({
    frameId: 'frame-1',
    settings: { enabled: false },
  });
  expect(onCloseSpy).toHaveBeenCalledTimes(1);

  cleanup();
}

function verifyManualValueDispatch() {
  const listener = vi.fn();
  const cleanup = addFrameStepBadgeChangedListener(listener);

  renderHarness({
    alphabet: 'latin',
    anchor: 'top-left',
    auto: false,
    enabled: true,
    offsetDirections: [],
    sizeLevel: 2,
    sourcePresetId: 'system-letters',
    type: 'letter',
    value: 'A',
  } as StepBadgeSettings);

  act(() => {
    latestState?.handleValueChange('B');
  });

  expect(listener).toHaveBeenCalledWith({
    frameId: 'frame-1',
    settings: { value: 'B' },
  });
  expect(latestState?.localStepBadgeSettings.sourcePresetId).toBeUndefined();
  expect(onCloseSpy).not.toHaveBeenCalled();

  act(() => {
    latestState?.handleValueChange('');
  });

  expect(listener).toHaveBeenLastCalledWith({
    frameId: 'frame-1',
    settings: { value: '' },
  });
  expect(latestState?.localStepBadgeSettings.value).toBe('');
  expect(onCloseSpy).not.toHaveBeenCalled();

  cleanup();
}

function verifyHistoryCommitOnClose() {
  const beginTransactionSpy = vi.spyOn(pagePreparationHistory, 'beginTransaction');
  const commitTransactionSpy = vi.spyOn(pagePreparationHistory, 'commitTransaction');

  renderHarness();
  expect(beginTransactionSpy).toHaveBeenCalledWith('step-badge:frame-1');
  renderHarness(undefined, false);

  expect(commitTransactionSpy).toHaveBeenCalledWith('step-badge:frame-1');
}

function verifyHistoryCancelOnUnmount() {
  const cancelTransactionSpy = vi.spyOn(pagePreparationHistory, 'cancelTransaction');

  renderHarness();

  act(() => {
    root?.unmount();
  });

  root = null;

  expect(cancelTransactionSpy).toHaveBeenCalledWith('step-badge:frame-1');
}

function verifyCanonicalPositionClearsManualPlacement() {
  const listener = vi.fn();
  const cleanup = addFrameStepBadgeChangedListener(listener);

  renderHarness({
    anchor: 'top-left',
    enabled: true,
    manualPlacement: { position: 0.6, side: 'bottom' },
    offsetDirections: [],
    type: 'number',
    value: '2',
  });

  act(() => latestState?.handleAnchorChange('top-right'));

  expect(listener).toHaveBeenCalledWith({
    frameId: 'frame-1',
    settings: { anchor: 'top-right', manualPlacement: undefined },
  });

  cleanup();
}

function verifyPresetApplicationPreservesExistingPlacement() {
  const listener = vi.fn();
  const cleanup = addFrameStepBadgeChangedListener(listener);
  renderHarness({
    anchor: 'bottom-center',
    enabled: true,
    manualPlacement: { position: 0.6, side: 'right' },
    offsetDirections: ['down'],
    type: 'number',
    value: '2',
  });
  const preset = createSystemStepBadgePresetCatalog().find(
    (candidate) => candidate.id === 'system-outline'
  )!;

  act(() => latestState?.applyPreset(preset));

  expect(listener).toHaveBeenCalledWith({
    frameId: 'frame-1',
    settings: expect.objectContaining({
      anchor: 'bottom-center',
      manualPlacement: { position: 0.6, side: 'right' },
      offsetDirections: ['down'],
      sourcePresetId: preset.id,
      value: '2',
    }),
  });
  expect(latestState?.localStepBadgeSettings.value).toBe('2');
  expect(onCloseSpy).not.toHaveBeenCalled();
  cleanup();
}

function verifyInactivePresetForkUsesTheRequestedTemplate() {
  const listener = vi.fn();
  const cleanup = addFrameStepBadgeChangedListener(listener);
  renderHarness({
    anchor: 'bottom-center',
    enabled: true,
    offsetDirections: ['down'],
    sourcePresetId: 'system-classic',
    type: 'number',
    value: '2',
  });
  const preset = createSystemStepBadgePresetCatalog().find(
    (candidate) => candidate.id === 'system-outline'
  )!;

  act(() => latestState?.forkPreset(preset));

  expect(latestState?.localStepBadgeSettings).toEqual(
    expect.objectContaining({
      anchor: 'bottom-center',
      offsetDirections: ['down'],
      style: preset.settings.style,
      value: '2',
    })
  );
  expect(latestState?.localStepBadgeSettings.sourcePresetId).toBeUndefined();
  expect(listener).toHaveBeenCalledWith({
    frameId: 'frame-1',
    settings: expect.objectContaining({
      style: preset.settings.style,
    }),
  });
  expect(listener.mock.calls[0]?.[0].settings.sourcePresetId).toBeUndefined();
  cleanup();
}

function verifyLocaleDefaultAlphabet() {
  const listener = vi.fn();
  const cleanup = addFrameStepBadgeChangedListener(listener);
  renderHarness({ enabled: true, type: 'number', value: '2' });

  act(() => latestState?.handleTypeChange('letter'));

  expect(listener).toHaveBeenCalledWith({
    frameId: 'frame-1',
    settings: { alphabet: 'cyrillic', sourcePresetId: undefined, type: 'letter' },
  });
  cleanup();
}

describe('useStepBadgePopoverState', () => {
  it('dispatches frame step-badge changes and closes when disabled', verifyDisablesBadgeAndCloses);
  it('dispatches manual value changes through the shared event seam', verifyManualValueDispatch);
  it(
    'forks an inactive preset into an unsaved copy',
    verifyInactivePresetForkUsesTheRequestedTemplate
  );
  it(
    'returns to canonical placement when the anchor changes',
    verifyCanonicalPositionClearsManualPlacement
  );
  it(
    'preserves an existing badge placement when a preset is applied',
    verifyPresetApplicationPreservesExistingPlacement
  );
  it(
    'uses the interface locale as the default alphabet for letter numbering',
    verifyLocaleDefaultAlphabet
  );
  it(
    'opens and commits a grouped history transaction around the popover session',
    verifyHistoryCommitOnClose
  );
  it(
    'cancels an open history transaction when the popover unmounts mid-session',
    verifyHistoryCancelOnUnmount
  );
});
