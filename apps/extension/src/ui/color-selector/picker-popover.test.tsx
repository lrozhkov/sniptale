// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ColorSelectorPickerPopover } from './picker-popover';
import { getNextColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';

vi.mock('../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderPopover(
  props: Partial<React.ComponentProps<typeof ColorSelectorPickerPopover>> = {}
) {
  if (!container) {
    throw new Error('missing container');
  }

  act(() => {
    root?.render(<PopoverHarness {...props} />);
  });
}

function PopoverHarness(props: Partial<React.ComponentProps<typeof ColorSelectorPickerPopover>>) {
  const [formatMode, setFormatMode] = React.useState(props.formatMode ?? 'hex');

  return (
    <ColorSelectorPickerPopover
      color="#123456"
      formatMode={formatMode}
      onApply={() => undefined}
      onCancel={() => undefined}
      onColorChange={() => undefined}
      onCycleFormatMode={() => {
        setFormatMode((currentMode) => getNextColorSelectorFormatMode(currentMode));
        props.onCycleFormatMode?.();
      }}
      onEyedropperStateChange={() => undefined}
      onSelectTransparent={() => undefined}
      {...props}
    />
  );
}

function getInput(label: string) {
  return Array.from(container?.querySelectorAll('input') ?? []).find(
    (input) => input.getAttribute('aria-label') === label
  ) as HTMLInputElement | undefined;
}

function getButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label
  ) as HTMLButtonElement | undefined;
}

function getModeCycleButton() {
  return container?.querySelector(
    '[data-ui="shared.ui.color-selector.mode-cycle"]'
  ) as HTMLButtonElement | null;
}

function getPlane() {
  return container?.querySelector('[role="slider"]') as HTMLDivElement | null;
}

function dispatchPointerEvent(
  element: HTMLDivElement,
  type: 'pointercancel' | 'pointerdown' | 'pointermove' | 'pointerup',
  init: { clientX?: number; clientY?: number; pointerId: number }
) {
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    pointerId: { value: init.pointerId },
  });
  element.dispatchEvent(event);
}

function preparePlane() {
  const plane = getPlane();
  if (!plane) {
    throw new Error('plane not found');
  }

  Object.defineProperties(plane, {
    getBoundingClientRect: {
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    },
    hasPointerCapture: { value: vi.fn(() => true) },
    releasePointerCapture: { value: vi.fn() },
    setPointerCapture: { value: vi.fn() },
  });

  return plane;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function triggerPlaneInteractions(plane: HTMLDivElement) {
  await act(async () => {
    dispatchPointerEvent(plane, 'pointerdown', { clientX: 20, clientY: 20, pointerId: 3 });
    dispatchPointerEvent(plane, 'pointermove', { clientX: 40, clientY: 40, pointerId: 3 });
    dispatchPointerEvent(plane, 'pointerup', { pointerId: 3 });
  });
}

async function triggerFormInteractions() {
  const hueInput = container?.querySelector('input[type="range"]') as HTMLInputElement | null;
  const hexInput = getInput('shared.ui.colorSelectorHex');

  await act(async () => {
    hueInput!.value = '180';
    hueInput?.dispatchEvent(new Event('input', { bubbles: true }));
    hueInput?.dispatchEvent(new Event('change', { bubbles: true }));
    hexInput!.value = '#abcdef';
    hexInput?.dispatchEvent(new Event('input', { bubbles: true }));
    hexInput?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await act(async () => {
    getButton('shared.ui.colorSelectorCancel')?.click();
    getButton('shared.ui.colorSelectorApply')?.click();
  });
}

async function changeInput(label: string, value: string) {
  await act(async () => {
    const input = getInput(label);
    if (!input) {
      throw new Error(`${label} input not found`);
    }

    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function cycleMode(times = 1) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      getModeCycleButton()?.click();
    });
  }
}

it('routes hue, manual color, footer, and plane interactions through the picker popover', async () => {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  const onColorChange = vi.fn();
  const onSelectTransparent = vi.fn();
  renderPopover({ onApply, onCancel, onColorChange, onSelectTransparent });

  await triggerPlaneInteractions(preparePlane());
  await triggerFormInteractions();
  await act(async () => {
    getButton('shared.ui.colorSelectorTransparent')?.click();
  });

  expect(onColorChange).toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onApply).toHaveBeenCalledOnce();
  expect(onSelectTransparent).toHaveBeenCalledOnce();
});

it('routes HSL field edits through the same draft update seam', async () => {
  const onColorChange = vi.fn();
  renderPopover({ onColorChange });

  await cycleMode(2);
  await changeInput('shared.ui.colorSelectorHue', '180');
  await changeInput('shared.ui.colorSelectorSaturation', '50');
  await changeInput('shared.ui.colorSelectorLightness', '40');

  expect(onColorChange).toHaveBeenCalled();
});

it('renders the eyedropper as an icon-only square action', () => {
  vi.stubGlobal(
    'EyeDropper',
    class {
      open() {
        return Promise.resolve({ sRGBHex: '#abcdef' });
      }
    }
  );

  renderPopover();

  expect(getButton('shared.ui.colorSelectorEyedropper')?.textContent).toBe('');
  expect(getButton('shared.ui.colorSelectorEyedropper')?.className).toContain('h-9 w-9');
});

it('keeps invalid and transparent manual input local to the field', async () => {
  const onColorChange = vi.fn();
  renderPopover({ onColorChange });

  await changeInput('shared.ui.colorSelectorHex', 'bad-color');
  await changeInput('shared.ui.colorSelectorHex', 'transparent');

  expect(onColorChange).not.toHaveBeenCalled();
  expect(getInput('shared.ui.colorSelectorHex')?.value).toBe('transparent');
});

it('ignores invalid rgb channel edits', async () => {
  const onColorChange = vi.fn();
  renderPopover({ onColorChange });

  await cycleMode();
  await changeInput('shared.ui.colorSelectorRed', 'oops');

  expect(onColorChange).not.toHaveBeenCalled();
});

it('toggles eyedropper activity and previews the picked color', async () => {
  let resolvePick: ((result: { sRGBHex: string }) => void) | null = null;
  const onColorChange = vi.fn();
  const onEyedropperStateChange = vi.fn();

  vi.stubGlobal(
    'EyeDropper',
    class {
      open() {
        return new Promise<{ sRGBHex: string }>((resolve) => {
          resolvePick = resolve;
        });
      }
    }
  );

  renderPopover({ onColorChange, onEyedropperStateChange });

  await act(async () => {
    getButton('shared.ui.colorSelectorEyedropper')?.click();
  });
  expect(getButton('shared.ui.colorSelectorEyedropper')?.dataset['pressed']).toBe('true');
  await act(async () => {
    resolvePick?.({ sRGBHex: '#abcdef' });
  });

  expect(onEyedropperStateChange).toHaveBeenCalledWith(true);
  expect(onEyedropperStateChange).toHaveBeenLastCalledWith(false);
  expect(onColorChange).toHaveBeenCalledWith('#abcdef');
  expect(getButton('shared.ui.colorSelectorEyedropper')?.dataset['pressed']).toBe('false');
});
it('returns early when the eyedropper button exists but the runtime constructor disappears', async () => {
  const onEyedropperStateChange = vi.fn();

  vi.stubGlobal(
    'EyeDropper',
    class {
      open() {
        return Promise.resolve({ sRGBHex: '#abcdef' });
      }
    }
  );

  renderPopover({ onEyedropperStateChange });
  Reflect.deleteProperty(window as Window & { EyeDropper?: unknown }, 'EyeDropper');

  await act(async () => {
    getButton('shared.ui.colorSelectorEyedropper')?.click();
  });

  expect(onEyedropperStateChange).not.toHaveBeenCalled();
});
it('renders the picker panel inline without floating-ui markers', () => {
  renderPopover();

  expect(
    container?.querySelector('[data-ui="shared.ui.color-selector.picker"]')?.className
  ).not.toContain('absolute');
  expect(container?.querySelector('[data-floating-ui-root]')).toBeNull();
});
