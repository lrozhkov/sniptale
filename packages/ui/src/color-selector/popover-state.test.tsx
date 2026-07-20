// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { hsvToHex } from './helpers';
import {
  useEyedropper,
  useFormatMode,
  useHslInputs,
  usePickerColorState,
  useRgbInputs,
} from './popover-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let hookState: Record<string, unknown> = {};

function renderHarness(renderState: () => Record<string, unknown>) {
  const Harness = () => {
    hookState = renderState();
    return null;
  };

  act(() => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  hookState = {};
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

it('cycles format mode and keeps rgb/hsl invalid text local until it becomes valid', () => {
  const onColorChange = vi.fn();

  renderHarness(() => ({
    format: useFormatMode(),
    hsl: useHslInputs('#ff8800', onColorChange),
    rgb: useRgbInputs('#112233', onColorChange),
  }));

  act(() => {
    (hookState['format'] as ReturnType<typeof useFormatMode>).cycleFormatMode();
    (hookState['format'] as ReturnType<typeof useFormatMode>).cycleFormatMode();
    (hookState['rgb'] as ReturnType<typeof useRgbInputs>).handleRedChange('oops');
    (hookState['hsl'] as ReturnType<typeof useHslInputs>).handleHueChange('bad');
  });

  expect((hookState['format'] as ReturnType<typeof useFormatMode>).formatMode).toBe('hsl');
  expect((hookState['rgb'] as ReturnType<typeof useRgbInputs>).rgbFields.red).toBe('oops');
  expect((hookState['hsl'] as ReturnType<typeof useHslInputs>).hslFields.hue).toBe('bad');
  expect(onColorChange).not.toHaveBeenCalled();

  act(() => {
    (hookState['rgb'] as ReturnType<typeof useRgbInputs>).handleRedChange('120');
    (hookState['hsl'] as ReturnType<typeof useHslInputs>).handleHueChange('180');
  });

  expect(onColorChange).toHaveBeenCalled();
});

it('keeps sticky hue on grayscale colors and preserves it when moving off grayscale', () => {
  renderHarness(() => ({
    color: usePickerColorState('#101010'),
  }));

  const grayscaleValue = (hookState['color'] as ReturnType<typeof usePickerColorState>).value;

  act(() => {
    (hookState['color'] as ReturnType<typeof usePickerColorState>).handleHueChange('359');
  });

  expect((hookState['color'] as ReturnType<typeof usePickerColorState>).hue).toBe(359);
  expect((hookState['color'] as ReturnType<typeof usePickerColorState>).resolvedColor).toBe(
    '#101010'
  );

  act(() => {
    (hookState['color'] as ReturnType<typeof usePickerColorState>).handlePlaneSelectionChange({
      saturation: 1,
      value: grayscaleValue,
    });
  });

  expect((hookState['color'] as ReturnType<typeof usePickerColorState>).hue).toBe(359);
  expect((hookState['color'] as ReturnType<typeof usePickerColorState>).resolvedColor).toBe(
    hsvToHex({
      hue: 359,
      saturation: 1,
      value: grayscaleValue,
    })
  );
});

it('preserves explicit hue when grayscale updates arrive through resolved colors', () => {
  renderHarness(() => ({
    color: usePickerColorState('#abcdef'),
  }));

  act(() => {
    (hookState['color'] as ReturnType<typeof usePickerColorState>).handleHueChange('240');
    (hookState['color'] as ReturnType<typeof usePickerColorState>).handleColorChange('#131313');
  });

  expect((hookState['color'] as ReturnType<typeof usePickerColorState>).hue).toBe(240);
  expect((hookState['color'] as ReturnType<typeof usePickerColorState>).resolvedColor).toBe(
    '#131313'
  );
});

it('exposes eyedropper pressed state, resolves picked colors, and clears on unmount', async () => {
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

  renderHarness(() => ({
    eyedropper: useEyedropper(onColorChange, onEyedropperStateChange),
  }));

  await act(async () => {
    void (hookState['eyedropper'] as ReturnType<typeof useEyedropper>).handleEyedropperPick();
    await Promise.resolve();
  });

  expect((hookState['eyedropper'] as ReturnType<typeof useEyedropper>).eyedropperPressed).toBe(
    true
  );
  expect(onEyedropperStateChange).toHaveBeenCalledWith(true);

  await act(async () => {
    resolvePick?.({ sRGBHex: '#abcdef' });
  });

  expect(onColorChange).toHaveBeenCalledWith('#abcdef');
  expect(onEyedropperStateChange).toHaveBeenLastCalledWith(false);

  await act(async () => {
    void (hookState['eyedropper'] as ReturnType<typeof useEyedropper>).handleEyedropperPick();
    await Promise.resolve();
  });
  act(() => {
    root?.unmount();
  });

  expect(onEyedropperStateChange).toHaveBeenLastCalledWith(false);
});

it('returns early when the EyeDropper constructor is unavailable', async () => {
  const onColorChange = vi.fn();
  const onEyedropperStateChange = vi.fn();

  renderHarness(() => ({
    eyedropper: useEyedropper(onColorChange, onEyedropperStateChange),
  }));

  await act(async () => {
    void (hookState['eyedropper'] as ReturnType<typeof useEyedropper>).handleEyedropperPick();
    await Promise.resolve();
  });

  expect(onColorChange).not.toHaveBeenCalled();
  expect(onEyedropperStateChange).not.toHaveBeenCalled();
});
