// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewCursorPathOverlay } from './cursor-path-overlay';
import { ReviewCursorPathEditor, ReviewCursorPathSettings } from './cursor-path-editor';
import type { CursorFocusPath } from '../../features/video/project/cursor-focus-path/types';
vi.mock('../../platform/i18n', () => ({
  translate: (key: string) => key,
  formatNumber: (value: number) => String(value),
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const path: CursorFocusPath = {
  version: 1,
  smoothing: 0.5,
  sensitivity: 0.5,
  mode: 'follow',
  gapPolicy: 'hold',
  segments: [
    {
      id: 'segment',
      binding: { kind: 'project' },
      start: 0,
      end: 2,
      keys: [
        { id: 'manual', time: 1, x: 0.25, y: 0.25, anchor: 'manual', interpolation: 'smooth' },
      ],
    },
  ],
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function render(onChange: (value: CursorFocusPath) => void) {
  act(() =>
    root.render(
      <ReviewCursorPathOverlay
        path={path}
        time={1}
        width={100}
        height={100}
        onChange={onChange}
        onSeek={vi.fn()}
      />
    )
  );
  const svg = host.querySelector('svg')!;
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    bottom: 100,
    right: 100,
    toJSON: () => ({}),
  });
  return host.querySelector('circle')!;
}
it('canvas drag commits once, retains tangents, and Escape/pointer cancel commit nothing', () => {
  const onChange = vi.fn();
  const handle = render(onChange);
  act(() =>
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 25, clientY: 25 }))
  );
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 40, clientY: 50 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 70 }));
  });
  expect(onChange).not.toHaveBeenCalled();
  act(() => window.dispatchEvent(new MouseEvent('pointerup')));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0]![0].segments[0].keys[0]).toMatchObject({ x: 0.6, y: 0.7 });
  onChange.mockClear();
  act(() => handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 80, clientY: 90 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new MouseEvent('pointerup'));
  });
  expect(onChange).not.toHaveBeenCalled();
  act(() => handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  act(() => window.dispatchEvent(new MouseEvent('pointercancel')));
  expect(onChange).not.toHaveBeenCalled();
});
it('inspector adds a manual key and reset uses the existing content writer without changing facts', () => {
  const onChange = vi.fn();
  act(() =>
    root.render(
      <ReviewCursorPathEditor path={path} time={1} disabled={false} onChange={onChange} />
    )
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="videoEditor.sidebar.cursorFocusAdd"]')!
      .click()
  );
  expect(onChange.mock.calls[0]![0].segments[0].keys).toHaveLength(2);
  act(() =>
    root.render(<ReviewCursorPathSettings path={path} disabled={false} onChange={onChange} />)
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="videoEditor.sidebar.cursorFocusReset"]'
      )!
      .click()
  );
  expect(onChange.mock.lastCall![0]).toBeUndefined();
  expect(path.segments[0]!.keys).toHaveLength(1);
});

it('numeric tangent fields display the same automatic controls as canvas handles without persisting them', () => {
  const automatic: CursorFocusPath = {
    ...path,
    segments: [
      {
        ...path.segments[0]!,
        keys: [
          ...path.segments[0]!.keys,
          { id: 'next', time: 2, x: 0.75, y: 0.75, anchor: 'manual', interpolation: 'smooth' },
        ],
      },
    ],
  };
  const onChange = vi.fn();
  act(() =>
    root.render(
      <ReviewCursorPathEditor path={automatic} time={1} disabled={false} onChange={onChange} />
    )
  );
  expect(
    host.querySelector<HTMLInputElement>(
      '[aria-label="videoEditor.sidebar.cursorFocusOutgoing X"]'
    )!.value
  ).toBe('0.3333');
  expect(
    host.querySelector<HTMLInputElement>(
      '[aria-label="videoEditor.sidebar.cursorFocusOutgoing Y"]'
    )!.value
  ).toBe('0.3333');
  expect(onChange).not.toHaveBeenCalled();
  expect(automatic.segments[0]!.keys[0]!.outgoing).toBeUndefined();
});

it('dragging a recorded anchor commits and selects one override, preserving the fact', () => {
  const recorded: CursorFocusPath = {
    ...path,
    segments: [
      {
        ...path.segments[0]!,
        keys: [{ ...path.segments[0]!.keys[0]!, id: 'recorded', anchor: 'click' }],
      },
    ],
  };
  const onChange = vi.fn<(value: CursorFocusPath) => void>();
  const onSelect = vi.fn();
  act(() =>
    root.render(
      <ReviewCursorPathOverlay
        path={recorded}
        selectedKeyId="recorded"
        time={1}
        width={100}
        height={100}
        onChange={onChange}
        onSeek={vi.fn()}
        onSelect={onSelect}
      />
    )
  );
  vi.spyOn(host.querySelector('svg')!, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
    toJSON: () => ({}),
  });
  act(() =>
    host
      .querySelector('circle')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 25, clientY: 25 }))
  );
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 70 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  const edited = onChange.mock.calls[0]![0];
  expect(edited.segments[0]!.keys.find((key) => key.id === 'recorded')).toEqual(
    recorded.segments[0]!.keys[0]
  );
  const manual = edited.segments[0]!.keys.find((key) => key.anchor === 'manual')!;
  expect(manual).toMatchObject({ time: 1, x: 0.6, y: 0.7 });
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(manual.id, 1);
});

it('overlapping tangent hit areas use the nearest center and preserve both editing targets', () => {
  const closeHandles: CursorFocusPath = {
    ...path,
    segments: [
      {
        ...path.segments[0]!,
        keys: [{ ...path.segments[0]!.keys[0]!, outgoing: { x: 0.28, y: 0.25 } }],
      },
    ],
  };
  const onChange = vi.fn();
  act(() =>
    root.render(
      <ReviewCursorPathOverlay
        path={closeHandles}
        time={1}
        width={100}
        height={100}
        onChange={onChange}
        onSeek={vi.fn()}
      />
    )
  );
  vi.spyOn(host.querySelector('svg')!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 100)
  );
  const outgoing = host.querySelector('[aria-label="videoEditor.sidebar.cursorFocusOutgoing"]')!;
  act(() =>
    outgoing.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 25, clientY: 25 })
    )
  );
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 40, clientY: 50 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
  });
  expect(onChange.mock.lastCall![0].segments[0].keys[0]).toMatchObject({
    x: 0.4,
    y: 0.5,
    outgoing: { x: 0.28, y: 0.25 },
  });
  onChange.mockClear();
  act(() =>
    outgoing.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 28, clientY: 25 })
    )
  );
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 70 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
  });
  expect(onChange.mock.lastCall![0].segments[0].keys[0]).toMatchObject({
    x: 0.25,
    y: 0.25,
    outgoing: { x: 0.6, y: 0.7 },
  });
  expect(onChange).toHaveBeenCalledTimes(1);
});
function commitCursorNumber(label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  expect(input).not.toBeNull();
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
}
it('selected recorded-point fields create one explicit override and retain automatic facts', () => {
  const recorded: CursorFocusPath = {
    ...path,
    segments: [
      {
        ...path.segments[0]!,
        keys: [{ ...path.segments[0]!.keys[0]!, id: 'recorded', anchor: 'click' }],
      },
    ],
  };
  const onChange = vi.fn(),
    onSelect = vi.fn();
  act(() =>
    root.render(
      <ReviewCursorPathEditor
        path={recorded}
        selectedKeyId="recorded"
        time={1}
        disabled={false}
        onChange={onChange}
        onSelect={onSelect}
      />
    )
  );
  commitCursorNumber('X', '0.6');
  expect(onChange).toHaveBeenCalledOnce();
  expect(onChange.mock.lastCall![0].segments[0].keys).toContainEqual(recorded.segments[0]!.keys[0]);
  expect(onChange.mock.lastCall![0].segments[0].keys).toContainEqual(
    expect.objectContaining({
      id: 'focus-override:recorded',
      anchor: 'manual',
      x: 0.6,
      time: 1,
    })
  );
  expect(onSelect).toHaveBeenLastCalledWith('focus-override:recorded', 1);
});
it('tangent and policy numeric commits retain endpoints and use their independent writers', () => {
  const onChange = vi.fn();
  act(() =>
    root.render(
      <ReviewCursorPathEditor path={path} time={1} disabled={false} onChange={onChange} />
    )
  );
  commitCursorNumber('videoEditor.sidebar.cursorFocusIncoming X', '-0.5');
  expect(onChange.mock.lastCall![0].segments[0].keys[0]).toMatchObject({
    x: 0.25,
    y: 0.25,
    incoming: { x: -0.5, y: 0.25 },
  });
  commitCursorNumber('videoEditor.sidebar.cursorFocusOutgoing Y', '0.8');
  expect(onChange.mock.lastCall![0].segments[0].keys[0]).toMatchObject({
    x: 0.25,
    y: 0.25,
    outgoing: { x: 0.25, y: 0.8 },
  });
  act(() =>
    root.render(<ReviewCursorPathSettings path={path} disabled={false} onChange={onChange} />)
  );
  commitCursorNumber('videoEditor.sidebar.cursorFocusSmoothing', '0.8');
  expect(onChange.mock.lastCall![0]).toEqual({ ...path, smoothing: 0.8 });
  commitCursorNumber('videoEditor.sidebar.cursorFocusSensitivity', '0.3');
  expect(onChange.mock.lastCall![0]).toEqual({ ...path, sensitivity: 0.3 });
});
it('key navigation and deletion keep empty-path authoring available within a known duration', () => {
  const onSeek = vi.fn(),
    onChange = vi.fn();
  const two: CursorFocusPath = {
    ...path,
    segments: [
      {
        ...path.segments[0]!,
        keys: [
          ...path.segments[0]!.keys,
          { id: 'next', time: 2, x: 0.7, y: 0.7, anchor: 'manual', interpolation: 'hold' },
        ],
      },
    ],
  };
  act(() =>
    root.render(
      <ReviewCursorPathEditor
        path={two}
        time={1}
        disabled={false}
        onChange={onChange}
        onSeek={onSeek}
      />
    )
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="videoEditor.sidebar.cursorFocusNext"]')!
      .click()
  );
  expect(onSeek).toHaveBeenCalledExactlyOnceWith(2);
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="common.actions.delete"]')!.click());
  expect(onChange.mock.lastCall![0].segments[0].keys.map((key: { id: string }) => key.id)).toEqual([
    'next',
  ]);
  const empty = { ...path, segments: [] };
  act(() =>
    root.render(
      <ReviewCursorPathEditor
        path={empty}
        time={1}
        duration={2}
        disabled={false}
        onChange={onChange}
        onSeek={onSeek}
      />
    )
  );
  expect(host.textContent).toContain('videoEditor.sidebar.cursorFocusUnavailable');
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="videoEditor.sidebar.cursorFocusAdd"]')!
      .click()
  );
  expect(onChange.mock.lastCall![0].segments[0].keys[0]).toMatchObject({
    time: 1,
    anchor: 'manual',
  });
});
it.each(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])(
  'canvas keyboard nudges are authored once (%s)',
  (key) => {
    const onChange = vi.fn();
    const handle = render(onChange);
    act(() => handle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key })));
    expect(onChange).toHaveBeenCalledOnce();
    const point = onChange.mock.lastCall![0].segments[0].keys[0];
    expect(point.x).toBeCloseTo(
      0.25 + (key === 'ArrowRight' ? 0.01 : key === 'ArrowLeft' ? -0.01 : 0)
    );
    expect(point.y).toBeCloseTo(
      0.25 + (key === 'ArrowDown' ? 0.01 : key === 'ArrowUp' ? -0.01 : 0)
    );
  }
);
it('canvas keyboard activation seeks and missing source coverage has no handle', () => {
  const onSeek = vi.fn();
  act(() =>
    root.render(
      <ReviewCursorPathOverlay
        path={path}
        time={1}
        width={100}
        height={100}
        onChange={vi.fn()}
        onSeek={onSeek}
      />
    )
  );
  act(() =>
    host
      .querySelector('circle')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(onSeek).toHaveBeenCalledExactlyOnceWith(1);
  act(() =>
    root.render(
      <ReviewCursorPathOverlay
        path={path}
        time={3}
        width={100}
        height={100}
        onChange={vi.fn()}
        onSeek={onSeek}
      />
    )
  );
  expect(host.querySelector('svg')).toBeNull();
});
