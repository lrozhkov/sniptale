// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useColorSelectorState } from './state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let state: ReturnType<typeof useColorSelectorState> | null = null;

function renderHarness(args: Parameters<typeof useColorSelectorState>[0]) {
  const Harness = () => {
    state = useColorSelectorState(args);
    return <div ref={state.rootRef} />;
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
  state = null;
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

it('hides the picker and rolls back when the expanded palette action is pressed mid-edit', () => {
  const onChange = vi.fn();
  const onPreviewReset = vi.fn();
  renderHarness({
    onChange,
    onPreviewChange: vi.fn(),
    onPreviewReset,
    palette: ['#abcdef'],
    recentColors: ['#123456'],
    value: '#123456',
  });

  act(() => {
    state?.handleOpenPicker();
    state?.handleDraftColorChange('#abcdef');
  });

  expect(state?.pickerOpen).toBe(true);
  expect(state?.expanded).toBe(false);

  act(() => {
    state?.handleToggleExpanded();
  });

  expect(state?.pickerOpen).toBe(false);
  expect(state?.expanded).toBe(false);
  expect(state?.draftColor).toBe('#123456');
  expect(onChange).not.toHaveBeenCalled();
  expect(onPreviewReset).toHaveBeenCalledWith('#123456');
});

it('rolls the draft back to the committed value after cancel and reseeds from commit on reopen', () => {
  const onPreviewReset = vi.fn();
  renderHarness({
    onChange: vi.fn(),
    onPreviewChange: vi.fn(),
    onPreviewReset,
    palette: ['#abcdef'],
    recentColors: ['#123456'],
    value: '#123456',
  });

  act(() => {
    state?.handleOpenPicker();
    state?.handleDraftColorChange('#abcdef');
    state?.handlePickerCancel();
  });

  expect(onPreviewReset).toHaveBeenCalledWith('#123456');
  expect(state?.draftColor).toBe('#123456');
  expect(state?.pickerOpen).toBe(false);

  act(() => {
    state?.handleOpenPicker();
  });

  expect(state?.draftColor).toBe('#123456');
  expect(state?.pickerOpen).toBe(true);
});

it('hides the picker and rolls back when choose-color is pressed again while editing', () => {
  const onChange = vi.fn();
  const onPreviewReset = vi.fn();
  renderHarness({
    onChange,
    onPreviewChange: vi.fn(),
    onPreviewReset,
    palette: ['#abcdef'],
    recentColors: ['#123456'],
    value: '#123456',
  });

  act(() => {
    state?.handleOpenPicker();
  });

  act(() => {
    state?.handleDraftColorChange('#abcdef');
  });

  act(() => {
    state?.handleOpenPicker();
  });

  expect(state?.pickerOpen).toBe(false);
  expect(state?.draftColor).toBe('#123456');
  expect(onChange).not.toHaveBeenCalled();
  expect(onPreviewReset).toHaveBeenCalledWith('#123456');
});

it('falls back to empty option lists when palette and recent colors are omitted', () => {
  renderHarness({
    onChange: vi.fn(),
    onPreviewChange: undefined,
    onPreviewReset: undefined,
    palette: undefined,
    recentColors: undefined,
    value: 'transparent',
  });

  expect(state?.normalizedPalette).toEqual([]);
  expect(state?.normalizedRecentColors).toEqual([]);
});
