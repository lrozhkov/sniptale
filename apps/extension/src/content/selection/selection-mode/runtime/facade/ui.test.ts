import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COLOR_INFO_STRONG } from '@sniptale/ui/default-colors/constants';
import { MIN_SELECTION_SIZE, OVERLAY_BACKGROUND, Z_INDEX_BASE } from '../../constants';
import { createSelectionModeState } from '../../session/state';

const { createSelectionModeUiRuntimeMock } = vi.hoisted(() => ({
  createSelectionModeUiRuntimeMock: vi.fn(),
}));

vi.mock('../../ui/runtime', () => ({
  createSelectionModeUiRuntime: createSelectionModeUiRuntimeMock,
}));

import { createSelectionModeFacadeUi } from './ui';

beforeEach(() => {
  vi.clearAllMocks();
});

function expectCanonicalSelectionModeConfig() {
  const state = createSelectionModeState();
  const uiRuntime = {
    createHoverElements: vi.fn(),
    createOverlayContainer: vi.fn(),
    prepare: vi.fn(),
  };
  const cancelSelection = vi.fn();
  const confirmSelection = vi.fn();
  const getDom = vi.fn(() => state.dom);
  const resetToIdleState = vi.fn();
  const onSetupSizePanelListeners = vi.fn();

  createSelectionModeUiRuntimeMock.mockReturnValue(uiRuntime);

  expect(
    createSelectionModeFacadeUi({
      cancelSelection,
      confirmSelection,
      getDom,
      getMaxSelectionHeight: () => 720,
      getMaxSelectionWidth: () => 1280,
      onSetupSizePanelListeners,
      resetToIdleState,
    })
  ).toBe(uiRuntime);

  expectUiRuntimeConfig({
    cancelSelection,
    confirmSelection,
    getDom,
    onSetupSizePanelListeners,
    resetToIdleState,
  });
}

async function expectFixedBlueSelectionVisual() {
  const state = createSelectionModeState();

  createSelectionModeFacadeUi({
    cancelSelection: vi.fn(),
    confirmSelection: vi.fn(),
    getDom: () => state.dom,
    getMaxSelectionHeight: () => 720,
    getMaxSelectionWidth: () => 1280,
    onSetupSizePanelListeners: vi.fn(),
    resetToIdleState: vi.fn(),
  });

  const config = createSelectionModeUiRuntimeMock.mock.calls[0]?.[0];

  await config.prepareVisual();

  expect(config.getVisual()).toMatchObject({
    strokeColor: DEFAULT_COLOR_INFO_STRONG,
    strokeStyle: 'solid',
    strokeWidth: 2,
    fillOpacity: 0,
  });
}

describe('selection-mode runtime facade ui', () => {
  it(
    'creates the facade ui runtime with the canonical selection-mode constants',
    expectCanonicalSelectionModeConfig
  );
  it(
    'keeps a fixed blue selection visual instead of inheriting highlighter presets',
    expectFixedBlueSelectionVisual
  );
});

function expectUiRuntimeConfig(args: {
  cancelSelection: () => void;
  confirmSelection: () => void;
  getDom: () => ReturnType<typeof createSelectionModeState>['dom'];
  onSetupSizePanelListeners: () => void;
  resetToIdleState: () => void;
}) {
  expect(createSelectionModeUiRuntimeMock).toHaveBeenCalledWith({
    getDom: args.getDom,
    getVisual: expect.any(Function),
    getMaxSelectionHeight: expect.any(Function),
    getMaxSelectionWidth: expect.any(Function),
    minSelectionSize: MIN_SELECTION_SIZE,
    onCancel: args.cancelSelection,
    onConfirm: args.confirmSelection,
    onResetToIdle: args.resetToIdleState,
    onSetupSizePanelListeners: args.onSetupSizePanelListeners,
    overlayBackground: OVERLAY_BACKGROUND,
    prepareVisual: expect.any(Function),
    zIndexBase: Z_INDEX_BASE,
  });
}
