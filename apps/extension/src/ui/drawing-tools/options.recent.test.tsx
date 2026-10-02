// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Type } from 'lucide-react';

const persistence = vi.hoisted(() => ({
  load: vi.fn<() => Promise<string[]>>(),
  pickerColor: '#123456',
  push: vi.fn(async () => [] as string[]),
  subscribe: vi.fn<(listener: (colors: string[]) => void) => () => void>(() => () => undefined),
}));

vi.mock('../../composition/persistence/recent-colors', () => ({
  loadRecentColors: persistence.load,
  pushRecentColor: persistence.push,
  subscribeRecentColors: persistence.subscribe,
}));

vi.mock('../color-selector', () => ({
  CompactColorSelector: ({
    allowAlpha,
    className,
    onChange,
    onPreviewChange,
    onPreviewReset,
  }: {
    allowAlpha?: boolean;
    className: string;
    onChange: (color: string) => void;
    onPreviewChange?: (color: string) => void;
    onPreviewReset?: (color: string) => void;
  }) => (
    <button
      data-ui="test.color-picker"
      data-allow-alpha={String(allowAlpha)}
      className={className}
      onClick={() => onChange(persistence.pickerColor)}
    >
      Picker
      <span
        data-ui="test.preview"
        onClick={(event) => {
          event.stopPropagation();
          onPreviewChange?.('#abcdef');
        }}
      />
      <span
        data-ui="test.cancel"
        onClick={(event) => {
          event.stopPropagation();
          onPreviewReset?.('#123456');
        }}
      />
    </button>
  ),
}));

import { DrawingColorOptions } from './options';

const palette = ['#f97316', '#60a5fa', '#22c55e', '#facc15', '#ef4444', '#111827'];

it('forwards picker preview and rollback without selecting a quick color', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const onSelect = vi.fn();
  const onPreview = vi.fn();
  const onPreviewReset = vi.fn();
  await act(async () =>
    root.render(
      <DrawingColorOptions
        colors={palette}
        floatingBoundaryRef={{ current: null }}
        floatingPlacement="auto"
        label="Line color"
        value="#123456"
        onSelect={onSelect}
        onPreview={onPreview}
        onPreviewReset={onPreviewReset}
      />
    )
  );
  act(() => host.querySelector<HTMLElement>('[data-ui="test.preview"]')?.click());
  act(() => host.querySelector<HTMLElement>('[data-ui="test.cancel"]')?.click());
  expect(onPreview).toHaveBeenCalledWith('#abcdef');
  expect(onPreviewReset).toHaveBeenCalledWith('#123456');
  expect(onSelect).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it('shows alpha and preserves it for quick RGB swatches while picker commits exact alpha', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  persistence.pickerColor = '#abcdef';
  const host = document.createElement('div');
  const root = createRoot(host);
  const onSelect = vi.fn();
  await act(async () =>
    root.render(
      <DrawingColorOptions
        allowAlpha
        colors={palette}
        floatingBoundaryRef={{ current: null }}
        floatingPlacement="auto"
        label="Line color"
        value="#12345680"
        onSelect={onSelect}
      />
    )
  );
  expect(
    host.querySelector('[data-ui="test.color-picker"]')?.getAttribute('data-allow-alpha')
  ).toBe('true');
  act(() => host.querySelector<HTMLButtonElement>('button[title="#60a5fa"]')?.click());
  expect(onSelect).toHaveBeenLastCalledWith('#60a5fa80');
  act(() => host.querySelector<HTMLButtonElement>('[data-ui="test.color-picker"]')?.click());
  expect(onSelect).toHaveBeenLastCalledWith('#abcdef');
  await act(async () =>
    root.render(
      <DrawingColorOptions
        allowAlpha
        colors={palette}
        floatingBoundaryRef={{ current: null }}
        floatingPlacement="auto"
        label="Line color"
        value="#12345600"
        onSelect={onSelect}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('button[title="#22c55e"]')?.click());
  expect(onSelect).toHaveBeenLastCalledWith('#22c55e00');
  act(() => root.unmount());
});

beforeEach(() => {
  persistence.pickerColor = '#123456';
  persistence.load.mockResolvedValue([]);
  persistence.push.mockResolvedValue([]);
  persistence.subscribe.mockReturnValue(() => undefined);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function visibleColors(host: HTMLElement) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('.grid-cols-5 button')).map(
    (button) => button.title
  );
}

it('places the text color icon before its picker', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <DrawingColorOptions
        colors={palette}
        floatingBoundaryRef={{ current: null }}
        floatingPlacement="auto"
        icon={Type}
        label="Text color"
        value="#f97316"
        onSelect={vi.fn()}
      />
    )
  );
  const group = host.querySelector('[role="group"]');
  expect(group?.firstElementChild?.classList.contains('lucide-type')).toBe(true);
  expect(group?.children[1]?.getAttribute('data-ui')).toBe('test.color-picker');
  act(() => root.unmount());
  host.remove();
});

it('ignores saved recents while preserving the configured quick colors', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let finishLoad: ((colors: string[]) => void) | undefined;
  persistence.load.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishLoad = resolve;
      })
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onSelect = vi.fn();
  act(() =>
    root.render(
      <DrawingColorOptions
        colors={palette}
        floatingBoundaryRef={{ current: null }}
        floatingPlacement="auto"
        label="Line color"
        value="#f97316"
        onSelect={onSelect}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('button[title="#60a5fa"]')?.click());
  expect(onSelect).toHaveBeenCalledWith('#60a5fa');
  await act(async () => finishLoad?.(['#ffffff', '#111827']));
  expect(visibleColors(host)).toEqual(palette.slice(0, 5));
  act(() => root.unmount());
  host.remove();
});

it('keeps all five configured positions after selecting arbitrary picker colors', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onSelect = vi.fn();
  await act(async () =>
    root.render(
      <DrawingColorOptions
        colors={palette}
        floatingBoundaryRef={{ current: null }}
        floatingPlacement="auto"
        label="Line color"
        value="#f97316"
        onSelect={onSelect}
      />
    )
  );

  const group = host.querySelector('[role="group"]');
  expect(group?.firstElementChild?.getAttribute('data-ui')).toBe('test.color-picker');
  const picker = host.querySelector<HTMLButtonElement>('[data-ui="test.color-picker"]');
  expect(picker?.className).toContain('border-transparent');
  act(() => host.querySelector<HTMLButtonElement>('button[title="#60a5fa"]')?.click());
  expect(visibleColors(host)).toEqual(palette.slice(0, 5));

  act(() => picker?.click());
  expect(onSelect).toHaveBeenLastCalledWith('#123456');
  expect(visibleColors(host)).toEqual(palette.slice(0, 5));

  act(() => host.querySelector<HTMLButtonElement>('button[title="#22c55e"]')?.click());
  expect(visibleColors(host)).toEqual(palette.slice(0, 5));
  persistence.pickerColor = '#abcdef';
  act(() => picker?.click());
  expect(visibleColors(host)).toEqual(palette.slice(0, 5));

  act(() =>
    root.render(
      <DrawingColorOptions
        colors={palette}
        floatingBoundaryRef={{ current: null }}
        floatingPlacement="auto"
        label="Line color"
        value="#999999"
        onSelect={onSelect}
      />
    )
  );
  expect(host.querySelector('[data-ui="test.color-picker"]')?.className).toContain(
    'border-transparent'
  );
  expect(host.querySelector('[data-ui="test.color-picker"]')?.className).not.toContain(
    'accent-emphasis'
  );
  act(() => root.unmount());
});

it('ignores recent-color storage notifications and preserves the configured order', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let notify: ((colors: string[]) => void) | undefined;
  persistence.subscribe.mockImplementation((listener) => {
    notify = listener;
    return () => undefined;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <DrawingColorOptions
        colors={palette}
        floatingBoundaryRef={{ current: null }}
        floatingPlacement="auto"
        label="Line color"
        value="#f97316"
        onSelect={vi.fn()}
      />
    )
  );
  const picker = host.querySelector<HTMLButtonElement>('[data-ui="test.color-picker"]');
  act(() => picker?.click());
  persistence.pickerColor = '#abcdef';
  act(() => picker?.click());
  act(() => notify?.(['#123456']));
  persistence.pickerColor = '#fedcba';
  act(() => picker?.click());

  expect(visibleColors(host)).toEqual(palette.slice(0, 5));
  act(() => notify?.(['#fedcba', '#abcdef', '#123456']));
  act(() => notify?.(['#999999', '#fedcba', '#abcdef', '#123456']));
  expect(visibleColors(host)).toEqual(palette.slice(0, 5));
  act(() => root.unmount());
});

it('updates from palette settings and preserves duplicate positions across remounts', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const render = (colors: readonly string[]) => (
    <DrawingColorOptions
      colors={colors}
      floatingBoundaryRef={{ current: null }}
      floatingPlacement="auto"
      label="Line color"
      value="#f97316"
      onSelect={vi.fn()}
    />
  );
  let root = createRoot(host);
  await act(async () => root.render(render(palette)));
  const updated = ['#abcdef', '#abcdef', ...palette.slice(2)];
  await act(async () => root.render(render(updated)));
  expect(visibleColors(host)).toEqual(updated.slice(0, 5));
  act(() => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(render(updated)));
  expect(visibleColors(host)).toEqual(updated.slice(0, 5));
  expect(persistence.load).not.toHaveBeenCalled();
  expect(persistence.push).not.toHaveBeenCalled();
  act(() => root.unmount());
});
