// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';

const { createContentSizeTooltipDomMock, syncContentSizeTooltipAspectRatioButtonStateMock } =
  vi.hoisted(() => ({
    createContentSizeTooltipDomMock: vi.fn(),
    syncContentSizeTooltipAspectRatioButtonStateMock: vi.fn(),
  }));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/content-size-tooltip/dom', () => ({
  ContentSizeTooltipDom: undefined,
  createContentSizeTooltipDom: createContentSizeTooltipDomMock,
  setContentSizeTooltipPosition: vi.fn(),
  syncContentSizeTooltipAspectRatioButtonState: syncContentSizeTooltipAspectRatioButtonStateMock,
  syncContentSizeTooltipValues: vi.fn(),
}));

import { createRegionSelectorTooltip as createTooltip } from './tooltip';

const mounted: ReturnType<typeof createTooltip>[] = [];
function createRegionSelectorTooltip(args: Parameters<typeof createTooltip>[0]) {
  let tooltip: ReturnType<typeof createTooltip>;
  act(() => {
    tooltip = createTooltip(args);
  });
  mounted.push(tooltip!);
  return tooltip!;
}
afterEach(() => {
  for (const tooltip of mounted.splice(0)) {
    act(() => tooltip.dispose());
    tooltip.root.remove();
  }
});

it('shares preset and lock state with pointer resizing and keeps numeric dimensions even', async () => {
  vi.stubGlobal('innerWidth', 1001);
  vi.stubGlobal('innerHeight', 799);
  const tooltip = createTooltipDom();
  createContentSizeTooltipDomMock.mockReturnValue(tooltip);
  let current = { x: 100, y: 100, width: 320, height: 180 };
  const aspectRatioState = { maintainAspectRatio: false, aspectRatio: null as number | null };
  const mountedTooltip = createRegionSelectorTooltip({
    aspectRatioState,
    getCurrentRegion: () => current,
    mountInto: document.body,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    onRegionChange: (next) => {
      current = next;
    },
  });
  expect(tooltip.root.querySelector('select')).toBeNull();
  const select = tooltip.root.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
  await act(async () => select.click());
  const option = document.querySelector<HTMLButtonElement>('[role="option"]:nth-child(3)')!;
  await act(async () => option.click());
  expect(aspectRatioState.maintainAspectRatio).toBe(true);
  expect(aspectRatioState).toEqual({ maintainAspectRatio: true, aspectRatio: 16 / 9 });
  await act(async () => select.click());
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  act(() => mountedTooltip.dismissMenu());
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(tooltip.root.querySelector('[aria-haspopup="listbox"]')?.textContent).toBe('16:9');
  expect(aspectRatioState).toEqual({ maintainAspectRatio: true, aspectRatio: 16 / 9 });
  act(() => mountedTooltip.dismissMenu());
  tooltip.widthInput.value = '517';
  tooltip.widthInput.dispatchEvent(new Event('change'));
  expect(current.width % 2).toBe(0);
  expect(current.height % 2).toBe(0);
  expect(Math.abs(current.width - (current.height * 16) / 9)).toBeLessThanOrEqual(2);
  tooltip.aspectRatioButton.click();
  expect(aspectRatioState.maintainAspectRatio).toBe(false);
  expect(tooltip.root.querySelector('[aria-haspopup="listbox"]')?.textContent).toBe(
    'content.overlayControls.regionAspectFree'
  );
});

function createTooltipDom() {
  const root = document.createElement('div');
  document.body.append(root);
  const actions = document.createElement('div');
  const minusWidth = document.createElement('button');
  minusWidth.className = 'sniptale-size-btn-minus';
  minusWidth.dataset['target'] = 'width';
  const plusHeight = document.createElement('button');
  plusHeight.className = 'sniptale-size-btn-plus';
  plusHeight.dataset['target'] = 'height';
  root.append(minusWidth, plusHeight);

  const widthInput = document.createElement('input');
  const heightInput = document.createElement('input');
  const aspectRatioButton = document.createElement('button');
  const cancelButton = document.createElement('button');
  const confirmButton = document.createElement('button');

  return {
    actions,
    aspectRatioButton,
    cancelButton,
    confirmButton,
    heightInput,
    root,
    widthInput,
  };
}

it('preserves input commits and keyboard focus while preventing pointer button focus', () => {
  const tooltip = createTooltipDom();
  createContentSizeTooltipDomMock.mockReturnValue(tooltip);
  const onRegionChange = vi.fn();
  createRegionSelectorTooltip({
    getCurrentRegion: () => ({ x: 100, y: 100, width: 320, height: 180 }),
    mountInto: document.body,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    onRegionChange,
  });
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(tooltip.root);
  tooltip.root.append(tooltip.widthInput, tooltip.aspectRatioButton);
  const press = (target: Node, button = 0) => {
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  tooltip.widthInput.value = '400';
  tooltip.widthInput.focus();
  expect(press(tooltip.aspectRatioButton)).toBe(true);
  expect(shadow.activeElement).not.toBe(tooltip.widthInput);
  expect(onRegionChange).toHaveBeenCalled();
  tooltip.aspectRatioButton.focus();
  expect(shadow.activeElement).toBe(tooltip.aspectRatioButton);
  expect(press(tooltip.aspectRatioButton, 2)).toBe(false);
  expect(shadow.activeElement).toBe(tooltip.aspectRatioButton);
  expect(press(tooltip.root)).toBe(false);
  tooltip.aspectRatioButton.disabled = true;
  expect(press(tooltip.aspectRatioButton)).toBe(false);
  tooltip.aspectRatioButton.disabled = false;
  const text = document.createTextNode('text');
  tooltip.root.append(text);
  expect(press(text)).toBe(false);
  expect(press(tooltip.aspectRatioButton)).toBe(true);
  document.body.append(tooltip.root);
  tooltip.widthInput.focus();
  expect(press(tooltip.aspectRatioButton)).toBe(true);
  host.remove();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('innerWidth', 1200);
  vi.stubGlobal('innerHeight', 900);
});

function registerDimensionBindingsTest() {
  it('binds dimension buttons and inputs to region updates', () => {
    const tooltip = createTooltipDom();
    createContentSizeTooltipDomMock.mockReturnValue(tooltip);
    let currentRegion = { x: 100, y: 120, width: 320, height: 240 };
    const onRegionChange = vi.fn((nextRegion) => {
      currentRegion = nextRegion;
    });

    createRegionSelectorTooltip({
      getCurrentRegion: () => currentRegion,
      mountInto: document.body,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      onRegionChange,
    });

    tooltip.root
      .querySelector<HTMLElement>('.sniptale-size-btn-minus')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    tooltip.root
      .querySelector<HTMLElement>('.sniptale-size-btn-plus')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    tooltip.widthInput.value = '450';
    tooltip.widthInput.dispatchEvent(new Event('change', { bubbles: true }));
    tooltip.heightInput.value = '510';
    tooltip.heightInput.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(createContentSizeTooltipDomMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canToggleAspectRatio: true,
        copy: expect.objectContaining({
          confirm: 'content.overlayControls.regionConfirm',
          widthField: 'content.overlayControls.widthField',
        }),
      })
    );
    expect(onRegionChange).toHaveBeenCalledTimes(4);
    expect(currentRegion.width).toBe(450);
    expect(currentRegion.height).toBe(510);
  });
}

function registerAspectRatioBindingsTest() {
  it('enables the ratio button and keeps paired region dimensions while locked', () => {
    const tooltip = createTooltipDom();
    createContentSizeTooltipDomMock.mockReturnValue(tooltip);
    let currentRegion = { x: 100, y: 120, width: 320, height: 160 };
    const onRegionChange = vi.fn((nextRegion) => {
      currentRegion = nextRegion;
    });

    createRegionSelectorTooltip({
      getCurrentRegion: () => currentRegion,
      mountInto: document.body,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      onRegionChange,
    });

    tooltip.aspectRatioButton.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    tooltip.widthInput.value = '400';
    tooltip.widthInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(syncContentSizeTooltipAspectRatioButtonStateMock).toHaveBeenCalledWith(
      tooltip.aspectRatioButton,
      {
        maintainAspectRatio: true,
        canToggleAspectRatio: true,
      }
    );
    expect(currentRegion.width).toBe(400);
    expect(currentRegion.height).toBe(200);
  });
}

function registerMinimumClampTest() {
  it('clamps invalid dimension input values to the minimum selector size', () => {
    const tooltip = createTooltipDom();
    createContentSizeTooltipDomMock.mockReturnValue(tooltip);
    let currentRegion = { x: 20, y: 20, width: 320, height: 240 };

    createRegionSelectorTooltip({
      getCurrentRegion: () => currentRegion,
      mountInto: document.body,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      onRegionChange: (nextRegion) => {
        currentRegion = nextRegion;
      },
    });

    tooltip.widthInput.value = 'bad';
    tooltip.widthInput.dispatchEvent(new Event('change', { bubbles: true }));
    tooltip.heightInput.value = '0';
    tooltip.heightInput.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(currentRegion.width).toBe(100);
    expect(currentRegion.height).toBe(100);
  });
}

function registerEmptyDraftTest() {
  it('restores the current region size when an input is empty on commit', () => {
    const tooltip = createTooltipDom();
    createContentSizeTooltipDomMock.mockReturnValue(tooltip);
    let currentRegion = { x: 20, y: 20, width: 320, height: 240 };
    const onRegionChange = vi.fn((nextRegion) => {
      currentRegion = nextRegion;
    });

    createRegionSelectorTooltip({
      getCurrentRegion: () => currentRegion,
      mountInto: document.body,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      onRegionChange,
    });

    tooltip.widthInput.value = '';
    tooltip.widthInput.dispatchEvent(new Event('change', { bubbles: true }));
    tooltip.heightInput.value = '';
    tooltip.heightInput.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(onRegionChange).not.toHaveBeenCalled();
    expect(tooltip.widthInput.value).toBe('320');
    expect(tooltip.heightInput.value).toBe('240');
  });
}

function registerKeyboardCommitTest() {
  it('commits the region size input when Enter is pressed', () => {
    const tooltip = createTooltipDom();
    createContentSizeTooltipDomMock.mockReturnValue(tooltip);
    let currentRegion = { x: 100, y: 120, width: 320, height: 240 };
    const onRegionChange = vi.fn((nextRegion) => {
      currentRegion = nextRegion;
    });

    createRegionSelectorTooltip({
      getCurrentRegion: () => currentRegion,
      mountInto: document.body,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      onRegionChange,
    });

    tooltip.widthInput.value = '460';
    tooltip.widthInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));

    expect(onRegionChange).toHaveBeenCalledTimes(1);
    expect(currentRegion.width).toBe(460);
  });
}

function runRegionSelectorTooltipSuite() {
  registerDimensionBindingsTest();
  registerAspectRatioBindingsTest();
  registerMinimumClampTest();
  registerEmptyDraftTest();
  registerKeyboardCommitTest();
}

describe('region-selector tooltip', runRegionSelectorTooltipSuite);

describe('region-selector tooltip actions', () => {
  it('binds cancel and confirm buttons to the owning callbacks', () => {
    const tooltip = createTooltipDom();
    createContentSizeTooltipDomMock.mockReturnValue(tooltip);
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    const result = createRegionSelectorTooltip({
      getCurrentRegion: () => ({ x: 0, y: 0, width: 320, height: 240 }),
      mountInto: document.body,
      onCancel,
      onConfirm,
      onRegionChange: vi.fn(),
    });

    tooltip.cancelButton.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    tooltip.confirmButton.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject(tooltip);
    expect(result.dispose).toEqual(expect.any(Function));
  });
});
