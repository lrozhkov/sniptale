// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  bindAdjustmentButtonsMock,
  bindAspectRatioToggleMock,
  bindSelectionHeightInputMock,
  bindSelectionWidthInputMock,
  createAdjustSizeMock,
  createSelectionSyncMock,
} = vi.hoisted(() => ({
  bindAdjustmentButtonsMock: vi.fn(),
  bindAspectRatioToggleMock: vi.fn(),
  bindSelectionHeightInputMock: vi.fn(),
  bindSelectionWidthInputMock: vi.fn(),
  createAdjustSizeMock: vi.fn(),
  createSelectionSyncMock: vi.fn(),
}));

vi.mock('./inputs', () => ({
  bindSelectionHeightInput: bindSelectionHeightInputMock,
  bindSelectionWidthInput: bindSelectionWidthInputMock,
}));

vi.mock('./buttons', () => ({
  bindAdjustmentButtons: bindAdjustmentButtonsMock,
}));

vi.mock('./helpers', () => ({
  bindAspectRatioToggle: bindAspectRatioToggleMock,
  createAdjustSize: createAdjustSizeMock,
  createSelectionSync: createSelectionSyncMock,
}));

import { setupSelectionModeSizePanelListeners } from '.';

function createDomFixture() {
  return {
    widthInput: document.createElement('input'),
    heightInput: document.createElement('input'),
    aspectRatioButton: document.createElement('button'),
    sizePanel: document.createElement('div'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function expectIncompleteSizePanelDomEarlyReturn() {
  setupSelectionModeSizePanelListeners({
    dom: {
      widthInput: null,
      heightInput: document.createElement('input'),
      aspectRatioButton: document.createElement('button'),
      sizePanel: document.createElement('div'),
    } as never,
    minSelectionSize: 100,
    getMaxSelectionWidth: vi.fn(() => 800),
    getMaxSelectionHeight: vi.fn(() => 600),
    getCurrentSelection: vi.fn(),
    setCurrentSelection: vi.fn(),
    getAspectRatio: vi.fn(),
    setAspectRatio: vi.fn(),
    getMaintainAspectRatio: vi.fn(),
    setMaintainAspectRatio: vi.fn(),
    constrainSelection: vi.fn(),
    updateFinalFrame: vi.fn(),
  });

  expect(createSelectionSyncMock).not.toHaveBeenCalled();
  expect(bindAdjustmentButtonsMock).not.toHaveBeenCalled();
}

function createSizePanelWiringFixture() {
  const dom = createDomFixture();
  const getCurrentSelection = vi.fn(() => ({ x: 20, y: 30, width: 300, height: 180 }));
  const setCurrentSelection = vi.fn();
  const constrainSelection = vi.fn();
  const updateFinalFrame = vi.fn();
  const getAspectRatio = vi.fn(() => 1.5);
  const setAspectRatio = vi.fn();
  const getMaintainAspectRatio = vi.fn(() => true);
  const setMaintainAspectRatio = vi.fn();
  const syncSelection = vi.fn();
  const adjustSize = vi.fn();
  createSelectionSyncMock.mockReturnValue(syncSelection);
  createAdjustSizeMock.mockReturnValue(adjustSize);

  return {
    adjustSize,
    constrainSelection,
    dom,
    getAspectRatio,
    getCurrentSelection,
    getMaintainAspectRatio,
    setAspectRatio,
    setCurrentSelection,
    setMaintainAspectRatio,
    syncSelection,
    updateFinalFrame,
  };
}

function runSizePanelWiring(fixture: ReturnType<typeof createSizePanelWiringFixture>) {
  setupSelectionModeSizePanelListeners({
    dom: fixture.dom as never,
    minSelectionSize: 100,
    getMaxSelectionWidth: vi.fn(() => 1200),
    getMaxSelectionHeight: vi.fn(() => 700),
    getCurrentSelection: fixture.getCurrentSelection,
    setCurrentSelection: fixture.setCurrentSelection,
    getAspectRatio: fixture.getAspectRatio,
    setAspectRatio: fixture.setAspectRatio,
    getMaintainAspectRatio: fixture.getMaintainAspectRatio,
    setMaintainAspectRatio: fixture.setMaintainAspectRatio,
    constrainSelection: fixture.constrainSelection,
    updateFinalFrame: fixture.updateFinalFrame,
  });
}

function expectSizePanelHelperWiring(fixture: ReturnType<typeof createSizePanelWiringFixture>) {
  expect(fixture.dom.widthInput).toBeInstanceOf(HTMLInputElement);
  expect(createSelectionSyncMock).toHaveBeenCalledWith(
    fixture.setCurrentSelection,
    fixture.constrainSelection,
    fixture.updateFinalFrame
  );
  expect(createAdjustSizeMock).toHaveBeenCalledWith(
    expect.objectContaining({
      aspectRatio: fixture.getAspectRatio,
      getCurrentSelection: fixture.getCurrentSelection,
      maintainAspectRatio: fixture.getMaintainAspectRatio,
      maxWidth: 1200,
      maxHeight: 700,
      minSelectionSize: 100,
      syncSelection: fixture.syncSelection,
    })
  );
  expect(bindAdjustmentButtonsMock).toHaveBeenCalledWith(
    fixture.dom.sizePanel,
    fixture.adjustSize,
    10
  );
}

function expectSizePanelInputAndToggleWiring(
  fixture: ReturnType<typeof createSizePanelWiringFixture>
) {
  expect(bindSelectionWidthInputMock).toHaveBeenCalledWith(
    fixture.dom.widthInput,
    fixture.dom.heightInput,
    fixture.syncSelection,
    expect.objectContaining({
      minSelectionSize: 100,
      maxWidth: 1200,
      maxHeight: 700,
      getCurrentSelection: fixture.getCurrentSelection,
      getMaintainAspectRatio: fixture.getMaintainAspectRatio,
      getAspectRatio: fixture.getAspectRatio,
    })
  );
  expect(bindSelectionHeightInputMock).toHaveBeenCalledWith(
    fixture.dom.heightInput,
    fixture.dom.widthInput,
    fixture.syncSelection,
    expect.objectContaining({
      minSelectionSize: 100,
      maxWidth: 1200,
      maxHeight: 700,
      getCurrentSelection: fixture.getCurrentSelection,
      getMaintainAspectRatio: fixture.getMaintainAspectRatio,
      getAspectRatio: fixture.getAspectRatio,
    })
  );
  expect(bindAspectRatioToggleMock).toHaveBeenCalledWith(
    fixture.dom.aspectRatioButton,
    fixture.getCurrentSelection,
    fixture.setAspectRatio,
    fixture.setMaintainAspectRatio,
    fixture.getMaintainAspectRatio
  );
}

function expectSizePanelWiringLifecycle() {
  const fixture = createSizePanelWiringFixture();

  runSizePanelWiring(fixture);
  expectSizePanelHelperWiring(fixture);
  expectSizePanelInputAndToggleWiring(fixture);
}

describe('selection-mode size-panel early return', () => {
  it(
    'returns early when the size-panel DOM is incomplete',
    expectIncompleteSizePanelDomEarlyReturn
  );
});

describe('selection-mode size-panel orchestration', () => {
  it(
    'wires buttons, inputs, and aspect-ratio toggle through the local helper seams',
    expectSizePanelWiringLifecycle
  );
});
