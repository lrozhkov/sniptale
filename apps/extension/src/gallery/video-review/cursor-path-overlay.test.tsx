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
  const onPolicyChange = vi.fn();
  act(() =>
    root.render(
      <ReviewCursorPathEditor
        path={path}
        selectedKeyId="manual"
        time={1}
        disabled={false}
        onChange={onChange}
      />
    )
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="videoEditor.sidebar.cursorFocusAdd"]')!
      .click()
  );
  expect(onChange.mock.calls[0]![0].segments[0].keys).toHaveLength(2);
  act(() =>
    root.render(
      <ReviewCursorPathSettings
        path={path}
        disabled={false}
        onChange={onChange}
        onPolicyChange={onPolicyChange}
      />
    )
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
      <ReviewCursorPathEditor
        path={automatic}
        selectedKeyId="manual"
        time={1}
        disabled={false}
        onChange={onChange}
      />
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
  const onPolicyChange = vi.fn();
  act(() =>
    root.render(
      <ReviewCursorPathEditor
        path={path}
        selectedKeyId="manual"
        time={1}
        disabled={false}
        onChange={onChange}
      />
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
    root.render(
      <ReviewCursorPathSettings
        path={path}
        disabled={false}
        onChange={onChange}
        onPolicyChange={onPolicyChange}
      />
    )
  );
  commitCursorNumber('videoEditor.sidebar.cursorFocusSmoothing', '0.8');
  expect(onChange.mock.lastCall![0]).toEqual({ ...path, smoothing: 0.8 });
  const geometryCalls = onChange.mock.calls.length;
  commitCursorNumber('videoEditor.sidebar.cameraZoneSize', '80');
  expect(onPolicyChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ zoneSize: 0.8, transitionDuration: 0.65 })
  );
  expect(onChange).toHaveBeenCalledTimes(geometryCalls);
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
        selectedKeyId="manual"
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

it('marks the selected key and recovers imported outside tangents at a bounded edge', () => {
  const outside: CursorFocusPath = {
    ...path,
    segments: [
      {
        ...path.segments[0]!,
        keys: [
          { ...path.segments[0]!.keys[0]!, outgoing: { x: 2, y: -1 } },
          { id: 'next', time: 2, x: 0.8, y: 0.8, anchor: 'manual', interpolation: 'smooth' },
        ],
      },
    ],
  };
  const onChange = vi.fn();
  act(() =>
    root.render(
      <ReviewCursorPathOverlay
        path={outside}
        selectedKeyId="manual"
        time={1}
        width={100}
        height={100}
        onChange={onChange}
        onSeek={vi.fn()}
      />
    )
  );
  expect(host.querySelector('[aria-pressed="true"]')).not.toBeNull();
  expect(host.querySelector('[aria-pressed="false"]')).not.toBeNull();
  const svg = host.querySelector('svg')!;
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100));
  const handle = host.querySelector('[aria-label="videoEditor.sidebar.cursorFocusOutgoing"]')!;
  expect(Number(handle.getAttribute('cx'))).toBeLessThan(100);
  expect(Number(handle.getAttribute('cy'))).toBeGreaterThan(0);
  expect(onChange).not.toHaveBeenCalled();
  act(() =>
    handle.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        clientX: Number(handle.getAttribute('cx')),
        clientY: Number(handle.getAttribute('cy')),
      })
    )
  );
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: -50 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
  });
  const control = onChange.mock.lastCall![0].segments[0].keys[0].outgoing;
  expect(control.x).toBeLessThan(1);
  expect(control.y).toBeGreaterThan(0);
  expect(outside.segments[0]!.keys[0]!.outgoing).toEqual({ x: 2, y: -1 });
});

it('uses the actual canvas bounds when the canvas extends beyond source video', () => {
  const outside = {
    ...path,
    segments: [
      {
        ...path.segments[0]!,
        keys: [{ ...path.segments[0]!.keys[0]!, outgoing: { x: 2, y: -1 } }],
      },
    ],
  };
  const onChange = vi.fn();
  act(() =>
    root.render(
      <ReviewCursorPathOverlay
        path={outside}
        time={1}
        width={100}
        height={100}
        bounds={{ left: -0.5, top: -0.5, right: 1.5, bottom: 1.5 }}
        onChange={onChange}
        onSeek={vi.fn()}
      />
    )
  );
  const handle = host.querySelector('[aria-label="videoEditor.sidebar.cursorFocusOutgoing"]')!;
  expect(Number(handle.getAttribute('cx'))).toBeGreaterThan(100);
  expect(Number(handle.getAttribute('cx'))).toBeLessThan(150);
  expect(Number(handle.getAttribute('cy'))).toBeGreaterThan(-50);
  expect(Number(handle.getAttribute('cy'))).toBeLessThan(0);
  expect(onChange).not.toHaveBeenCalled();
});

it('preserves the activated outgoing tangent when a clipped incoming proxy shares its edge', () => {
  const collision = {
    ...path,
    segments: [
      {
        ...path.segments[0]!,
        keys: [
          {
            ...path.segments[0]!.keys[0]!,
            x: 0.5,
            y: 0.5,
            incoming: { x: 2, y: 0.5 },
            outgoing: { x: 0.988, y: 0.5 },
          },
        ],
      },
    ],
  };
  const onChange = vi.fn();
  act(() =>
    root.render(
      <ReviewCursorPathOverlay
        path={collision}
        time={1}
        width={1000}
        height={1000}
        onChange={onChange}
        onSeek={vi.fn()}
      />
    )
  );
  vi.spyOn(host.querySelector('svg')!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 1000, 1000)
  );
  const outgoing = host.querySelector('[aria-label="videoEditor.sidebar.cursorFocusOutgoing"]')!;
  act(() =>
    outgoing.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        clientX: Number(outgoing.getAttribute('cx')),
        clientY: Number(outgoing.getAttribute('cy')),
      })
    )
  );
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 900, clientY: 600 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
  });
  expect(onChange.mock.lastCall![0].segments[0].keys[0]).toMatchObject({
    incoming: { x: 2, y: 0.5 },
    outgoing: { x: 0.9, y: 0.6 },
  });
});

it.each([2, 0.989])(
  'retains a tangent target when its edge proxy would coincide with the selected key (%s)',
  (x) => {
    const collision = {
      ...path,
      segments: [
        {
          ...path.segments[0]!,
          keys: [{ ...path.segments[0]!.keys[0]!, x: 0.988, y: 0.5, outgoing: { x, y: 0.5 } }],
        },
      ],
    };
    act(() =>
      root.render(
        <ReviewCursorPathOverlay
          path={collision}
          time={1}
          width={1000}
          height={1000}
          onChange={vi.fn()}
          onSeek={vi.fn()}
        />
      )
    );
    const outgoing = host.querySelector('[aria-label="videoEditor.sidebar.cursorFocusOutgoing"]');
    expect(outgoing).not.toBeNull();
    expect(
      Math.hypot(
        Number(outgoing!.getAttribute('cx')) - 988,
        Number(outgoing!.getAttribute('cy')) - 500
      )
    ).toBeGreaterThanOrEqual(24);
  }
);

it('offers three movement presets, keeps custom edits unselected and shares one fine-tune disclosure', () => {
  const onPolicyChange = vi.fn();
  const onChange = vi.fn();
  const renderSettings = (
    settings?: import('../../features/video/project/camera/cursor-policy').CameraFollowSettings
  ) =>
    act(() =>
      root.render(
        <ReviewCursorPathSettings
          path={path}
          disabled={false}
          onChange={onChange}
          onPolicyChange={onPolicyChange}
          cameraFollowDefaults={settings}
        />
      )
    );
  renderSettings();
  const movement = () =>
    host.querySelector('[role="group"][aria-label="videoEditor.sidebar.cameraMovement"]')!;
  expect(movement().querySelectorAll('button')).toHaveLength(3);
  expect(movement().querySelector('[aria-pressed="true"]')?.textContent).toBe(
    'videoEditor.sidebar.cameraCalm'
  );
  expect(host.querySelectorAll('details')).toHaveLength(1);
  expect(
    host
      .querySelector('details')!
      .querySelector('input[aria-label="videoEditor.sidebar.cursorFocusSmoothing"]')
  ).not.toBeNull();
  expect(
    host
      .querySelector('[aria-label="videoEditor.sidebar.cameraAllowExpansion"]')
      ?.getAttribute('aria-checked')
  ).toBe('true');
  const fast = Array.from(movement().querySelectorAll('button')).find(
    (button) => button.textContent === 'videoEditor.sidebar.cameraFast'
  )!;
  act(() => fast.click());
  renderSettings(onPolicyChange.mock.lastCall![0]);
  commitCursorNumber('videoEditor.sidebar.cameraTransitionDuration', '0.42');
  renderSettings(onPolicyChange.mock.lastCall![0]);
  expect(movement().querySelector('[aria-pressed="true"]')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
