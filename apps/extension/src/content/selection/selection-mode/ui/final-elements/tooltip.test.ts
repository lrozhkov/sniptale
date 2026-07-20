// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createContentSizeTooltipDomMock, getSelectionModeSizePanelCopyMock } = vi.hoisted(() => ({
  createContentSizeTooltipDomMock: vi.fn(),
  getSelectionModeSizePanelCopyMock: vi.fn(),
}));

vi.mock('@sniptale/ui/content-size-tooltip/dom', () => ({
  ContentSizeTooltipDom: undefined,
  createContentSizeTooltipDom: createContentSizeTooltipDomMock,
  setContentSizeTooltipPosition: vi.fn(),
  syncContentSizeTooltipAspectRatioButtonState: vi.fn(),
  syncContentSizeTooltipValues: vi.fn(),
}));

vi.mock('../constants', () => ({
  getSelectionModeSizePanelCopy: getSelectionModeSizePanelCopyMock,
}));

import {
  createSelectionModeFinalSizeTooltip,
  wireSelectionModeFinalSizeTooltipActions,
} from './tooltip';
import type { ResolvedBorderPresetVisual } from '../../../../../features/highlighter/style';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
  getSelectionModeSizePanelCopyMock.mockReturnValue({ confirm: 'save' });
});

describe('selection-mode final tooltip', () => {
  it('creates the tooltip with the selection-mode copy and limits', () => {
    const mountInto = document.createElement('div');
    const tooltip = createTooltipFixture();
    createContentSizeTooltipDomMock.mockReturnValue(tooltip);

    const result = createSelectionModeFinalSizeTooltip(mountInto, createOptions());

    expect(createContentSizeTooltipDomMock).toHaveBeenCalledWith(
      expect.objectContaining({
        copy: { confirm: 'save' },
        mountInto,
        widthMin: 120,
        widthMax: 1280,
        heightMin: 120,
        heightMax: 720,
        maintainAspectRatio: false,
      })
    );
    expect(result).toBe(tooltip);
  });

  it('wires confirm and cancel callbacks without leaking default events', () => {
    const tooltip = createTooltipFixture();
    const options = createOptions();

    wireSelectionModeFinalSizeTooltipActions(tooltip, options);

    tooltip.cancelButton.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    tooltip.confirmButton.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );

    expect(options.onResetToIdle).toHaveBeenCalledTimes(1);
    expect(options.onConfirm).toHaveBeenCalledTimes(1);
  });
});

function createTooltipFixture() {
  return {
    root: document.createElement('div'),
    widthInput: document.createElement('input'),
    heightInput: document.createElement('input'),
    widthDecreaseButton: document.createElement('button'),
    widthIncreaseButton: document.createElement('button'),
    heightDecreaseButton: document.createElement('button'),
    heightIncreaseButton: document.createElement('button'),
    aspectRatioButton: document.createElement('button'),
    cancelButton: document.createElement('button'),
    confirmButton: document.createElement('button'),
  };
}

function createOptions() {
  return {
    zIndexBase: 600,
    overlayBackground: 'rgba(0, 0, 0, 0.4)',
    minSelectionSize: 120,
    getMaxSelectionWidth: () => 1280,
    getMaxSelectionHeight: () => 720,
    onConfirm: vi.fn(),
    onResetToIdle: vi.fn(),
    onSetupSizePanelListeners: vi.fn(),
    visual: createSelectionVisual(),
  };
}

function createSelectionVisual(): ResolvedBorderPresetVisual {
  return {
    customCss: '',
    customCssStyles: {},
    fillColor: '#22c55e',
    fillOpacity: 20,
    id: 'preset-1',
    inheritCustomCss: false,
    opacity: 100,
    padding: { bottom: 4, left: 4, right: 4, top: 4 },
    radius: 8,
    shadow: 30,
    strokeColor: '#38bdf8',
    strokeOpacity: 100,
    strokeStyle: 'solid',
    strokeWidth: 2,
  };
}
