// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_CAMERA_DEPTH as DEFAULT_QUICK_EDIT_DEPTH,
  DEFAULT_CAMERA_PERSPECTIVE as DEFAULT_QUICK_EDIT_PERSPECTIVE,
} from '../../features/video/project/motion/spatial';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { useSpatialGesture, type SpatialHandle } from './spatial-gesture';

type Props = Omit<Parameters<typeof useSpatialGesture>[0], 'bounds'>;
let props: Props;
let root: Root;
let host: HTMLDivElement;
let button: HTMLButtonElement;
let handle: SpatialHandle;
let callbacks: Map<number, FrameRequestCallback>;
let nextFrame: number;
let captures: Set<number>;
let release: ReturnType<typeof vi.fn>;
let rectangle: { left: number; top: number; width: number; height: number };
let mounted: boolean;
function Fixture() {
  const bounds = useRef<HTMLDivElement>(null);
  const gesture = useSpatialGesture({ ...props, bounds });
  return (
    <div ref={bounds} data-bounds>
      <button {...gesture.bind(handle, 1)} data-active={gesture.active ?? ''}>
        Handle
      </button>
    </div>
  );
}
async function render() {
  await act(async () => root.render(<Fixture />));
  button = host.querySelector('button')!;
  Object.defineProperties(button, {
    setPointerCapture: { configurable: true, value: (id: number) => captures.add(id) },
    hasPointerCapture: { configurable: true, value: (id: number) => captures.has(id) },
    releasePointerCapture: { configurable: true, value: release },
  });
  host.querySelector('[data-bounds]')!.getBoundingClientRect = () =>
    new DOMRect(rectangle.left, rectangle.top, rectangle.width, rectangle.height);
}
function pointer(
  type: string,
  x: number,
  y: number,
  options: { shiftKey?: boolean; pointerId?: number; pointerType?: string; button?: number } = {}
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    ...options,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId ?? 7 },
    pointerType: { value: options.pointerType ?? 'mouse' },
  });
  act(() => button.dispatchEvent(event));
}
function key(value: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: value,
    shiftKey,
  });
  act(() => button.dispatchEvent(event));
  return event;
}
function tick() {
  act(() => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback(16);
  });
}
function commit() {
  return vi.mocked(props.onCommit).mock.calls.at(-1)?.[1];
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  callbacks = new Map();
  nextFrame = 1;
  captures = new Set();
  mounted = true;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  rectangle = { left: 10, top: 20, width: 200, height: 100 };
  release = vi.fn((id: number) => {
    captures.delete(id);
    // Browser capture loss must not cancel or duplicate a completed transaction.
    const event = new Event('lostpointercapture', { bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: id });
    button.dispatchEvent(event);
  });
  handle = 'tilt';
  props = {
    region: {
      ...createQuickEditZoomRegion({ id: 'zoom', at: 0 }),
      perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true },
      depthOfField: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true, mode: 'area' },
    },
    revision: 'authored-1',
    tool: 'tilt',
    axis: 'both',
    enabled: true,
    geometry: {
      plane: { x: 0, y: 0, width: 400, height: 200 },
      projection: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      rotation: [0, 0, 0, 1],
      focus: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true, mode: 'area' },
    },
    output: { width: 400, height: 200 },
    onPreview: vi.fn(),
    onCommit: vi.fn(),
    onInteract: vi.fn(),
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(['tilt', 'rotation', 'focus'] as const)(
  'enables an inactive %s only with the first real edit, in the same commit',
  async (tool) => {
    props.tool = tool;
    handle = tool === 'focus' ? 'center' : tool;
    props.region.perspective = { ...DEFAULT_QUICK_EDIT_PERSPECTIVE };
    props.region.depthOfField = { ...DEFAULT_QUICK_EDIT_DEPTH, mode: 'area' };
    await render();
    expect(button.disabled).toBe(false);
    expect(props.onPreview).not.toHaveBeenCalled();
    expect(props.onCommit).not.toHaveBeenCalled();
    key('ArrowRight');
    tick();
    expect(props.onCommit).not.toHaveBeenCalled();
    key('Enter');
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    expect(
      tool === 'focus' ? commit()?.depthOfField?.enabled : commit()?.perspective?.enabled
    ).toBe(true);
  }
);

it('coalesces transient movement and commits the final unflushed pointerup sample once', async () => {
  await render();
  pointer('pointerdown', 110, 70);
  for (let x = 111; x <= 150; x++) pointer('pointermove', x, 60);
  expect(props.onInteract).toHaveBeenCalledTimes(1);
  expect(callbacks.size).toBe(1);
  expect(props.onPreview).not.toHaveBeenCalled();
  tick();
  expect(props.onPreview).toHaveBeenCalledTimes(1);
  pointer('pointermove', 160, 60);
  pointer('pointerup', 170, 50);
  expect(props.onCommit).toHaveBeenCalledTimes(1);
  expect(vi.mocked(props.onCommit).mock.calls[0]?.[0]).toBe('authored-1');
  expect(commit()?.perspective?.rotateX).toBeCloseTo(18);
  expect(commit()?.perspective?.rotateY).toBeCloseTo(27);
  expect(commit()?.perspective?.rotateZ).toBe(0);
  expect(callbacks.size).toBe(0);
  expect(captures.size).toBe(0);
  expect(props.onPreview).toHaveBeenLastCalledWith(null);
  tick();
  expect(props.onCommit).toHaveBeenCalledTimes(1);
});

it.each(['tilt', 'rotation', 'focus'] as const)(
  'does not enable %s on a cancelled or net-zero gesture',
  async (tool) => {
    props.tool = tool;
    handle = tool === 'focus' ? 'center' : tool;
    props.region = createQuickEditZoomRegion({ id: 'untouched', at: 0 });
    await render();
    key('ArrowRight');
    key('Escape');
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(props.onPreview).toHaveBeenLastCalledWith(null);
    key('ArrowRight');
    key('ArrowLeft');
    key('Enter');
    expect(props.onCommit).not.toHaveBeenCalled();
  }
);

it('keeps CSS bounds fixed, supports touch and changes Shift sensitivity incrementally', async () => {
  await render();
  pointer('pointerdown', 110, 70, { pointerType: 'touch' });
  rectangle = { left: 0, top: 0, width: 1000, height: 500 };
  pointer('pointermove', 130, 70);
  pointer('pointermove', 150, 70, { shiftKey: true });
  pointer('pointermove', 150, 70);
  pointer('pointerup', 170, 70);
  expect(commit()?.perspective?.rotateY).toBeCloseTo(19.8);
  expect(commit()?.perspective?.rotateX).toBe(0);
});

it.each(['x', 'y'] as const)(
  'constrains tilt to %s and preserves strength and roll',
  async (axis) => {
    props.axis = axis;
    props.region.perspective = { ...props.region.perspective!, rotateZ: 17, strength: 0.73 };
    await render();
    pointer('pointerdown', 110, 70);
    pointer('pointerup', 510, -130);
    expect(commit()?.perspective).toEqual({
      enabled: true,
      rotateX: axis === 'x' ? 60 : 0,
      rotateY: axis === 'y' ? 60 : 0,
      rotateZ: 17,
      strength: 0.73,
    });
  }
);

it('does not write no-op or out-and-back gestures', async () => {
  await render();
  pointer('pointerdown', 110, 70);
  pointer('pointerup', 110, 70);
  pointer('pointerdown', 110, 70);
  pointer('pointermove', 130, 70);
  tick();
  pointer('pointerup', 110, 70);
  expect(props.onCommit).not.toHaveBeenCalled();
  expect(props.onPreview).toHaveBeenLastCalledWith(null);
});

it.each([
  'Escape',
  'pointercancel',
  'lostpointercapture',
  'windowblur',
  'selection',
  'revision',
  'tool',
  'disabled',
  'effect-disabled',
  'unmount',
])('cancels pending work on %s without a late commit', async (reason) => {
  await render();
  pointer('pointerdown', 110, 70);
  pointer('pointermove', 150, 50);
  if (reason === 'Escape') key('Escape');
  else if (reason === 'windowblur') act(() => window.dispatchEvent(new Event('blur')));
  else if (reason === 'unmount') {
    await act(async () => root.unmount());
    mounted = false;
  } else if (reason === 'selection') {
    props.region = { ...props.region, id: 'other' };
    await render();
  } else if (reason === 'revision') {
    props.revision = 'authored-2';
    await render();
  } else if (reason === 'tool') {
    props.tool = 'rotation';
    await render();
  } else if (reason === 'disabled') {
    props.enabled = false;
    await render();
  } else if (reason === 'effect-disabled') {
    props.region = {
      ...props.region,
      perspective: { ...props.region.perspective!, enabled: false },
    };
    await render();
  } else pointer(reason, 150, 50);
  expect(callbacks.size).toBe(0);
  tick();
  pointer('pointerup', 170, 40);
  expect(props.onCommit).not.toHaveBeenCalled();
  expect(props.onPreview).toHaveBeenLastCalledWith(null);
  expect(captures.size).toBe(0);
});

it('does not admit read-only editing, Position or right-button input and does not seek', async () => {
  props.enabled = false;
  await render();
  pointer('pointerdown', 110, 70);
  key('ArrowRight');
  props.enabled = true;
  props.tool = 'position';
  await render();
  pointer('pointerdown', 110, 70);
  key('ArrowRight');
  props.tool = 'tilt';
  await render();
  pointer('pointerdown', 110, 70, { button: 2 });
  expect(props.onInteract).not.toHaveBeenCalled();
  expect(props.onPreview).not.toHaveBeenCalled();
  expect(props.onCommit).not.toHaveBeenCalled();
});

it('unwraps rotation across the angular seam and reanchors after the center dead zone', async () => {
  handle = 'rotation';
  props.tool = 'rotation';
  props.region.perspective!.rotateZ = 179;
  await render();
  const at = (angle: number) =>
    [
      110 + 50 * Math.cos((angle * Math.PI) / 180),
      70 + 50 * Math.sin((angle * Math.PI) / 180),
    ] as const;
  pointer('pointerdown', ...at(179));
  pointer('pointermove', ...at(-179));
  tick();
  expect(vi.mocked(props.onPreview).mock.calls.at(-1)?.[0]?.perspective?.rotateZ).toBeCloseTo(-179);
  pointer('pointermove', 110, 70);
  pointer('pointermove', ...at(0));
  pointer('pointerup', ...at(10));
  expect(commit()?.perspective?.rotateZ).toBeCloseTo(-169);
});

it('groups keyboard repeats, excludes pointers and commits Enter plus blur once', async () => {
  await render();
  key('ArrowRight');
  key('ArrowRight');
  key('ArrowUp', true);
  pointer('pointerdown', 110, 70);
  pointer('pointermove', 180, 70);
  pointer('pointerup', 180, 70);
  expect(props.onCommit).not.toHaveBeenCalled();
  expect(props.onInteract).toHaveBeenCalledTimes(1);
  key('Enter');
  act(() => button.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(props.onCommit).toHaveBeenCalledTimes(1);
  expect(commit()?.perspective).toMatchObject({ rotateX: 0.2, rotateY: 2 });
});

it.each([0, 180, -180, 31.25])(
  'omits history after a full pointer rotation from %s degrees',
  async (angle) => {
    handle = 'rotation';
    props.tool = 'rotation';
    props.region.perspective!.rotateZ = angle;
    await render();
    const point = (degrees: number) =>
      [
        110 + 50 * Math.cos((degrees * Math.PI) / 180),
        70 + 50 * Math.sin((degrees * Math.PI) / 180),
      ] as const;
    pointer('pointerdown', ...point(0));
    for (const degrees of [51, 103, 156, 208, 260, 312]) {
      pointer('pointermove', ...point(degrees));
      tick();
    }
    pointer('pointerup', ...point(360));
    expect(props.onPreview).toHaveBeenCalled();
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(props.onPreview).toHaveBeenLastCalledWith(null);
  }
);

it('omits a full keyboard turn from positive 180 without normalizing an untouched tilt roll', async () => {
  handle = 'rotation';
  props.tool = 'rotation';
  props.region.perspective!.rotateZ = 180;
  await render();
  for (let step = 0; step < 360; step++) key('ArrowRight');
  key('Enter');
  expect(props.onCommit).not.toHaveBeenCalled();
  props.tool = 'tilt';
  handle = 'tilt';
  await render();
  pointer('pointerdown', 110, 70);
  pointer('pointerup', 130, 70);
  expect(props.onCommit).toHaveBeenCalledTimes(1);
  expect(commit()?.perspective).toMatchObject({ rotateX: 0, rotateY: 9, rotateZ: 180 });
});

it('cancels keyboard edits with Escape, commits blur, and leaves Space and text keys untouched', async () => {
  await render();
  key('ArrowLeft');
  key('Escape');
  act(() => button.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(props.onCommit).not.toHaveBeenCalled();
  expect(key(' ').defaultPrevented).toBe(false);
  expect(key('a').defaultPrevented).toBe(false);
  key('ArrowDown');
  act(() => button.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(props.onCommit).toHaveBeenCalledTimes(1);
  expect(commit()?.perspective?.rotateX).toBe(-1);
});

it('ignores keyboard arrows during pointer editing', async () => {
  await render();
  pointer('pointerdown', 110, 70);
  key('ArrowUp');
  pointer('pointerup', 130, 70);
  expect(commit()?.perspective).toMatchObject({ rotateX: 0, rotateY: 9 });
});

it('maps focus center through captured output geometry without a first-move hit-target jump', async () => {
  props.tool = 'focus';
  handle = 'center';
  await render();
  // Down is offset inside the CSS hit target, not exactly at its painted center.
  pointer('pointerdown', 114, 72);
  pointer('pointermove', 114, 72);
  expect(callbacks.size).toBe(0);
  props.geometry = { ...props.geometry!, projection: [2, 0, 0, 0, 2, 0, 0, 0, 1] };
  await render();
  pointer('pointerup', 134, 82);
  expect(commit()?.depthOfField).toMatchObject({
    x: 0.6,
    y: 0.6,
    width: 0.2,
    softness: 0.3,
    strength: 0.5,
  });
});

it.each(['width', 'softness'] as const)(
  'edits focus %s independently with a captured metric',
  async (kind) => {
    props.tool = 'focus';
    handle = kind;
    await render();
    pointer('pointerdown', 150, 70);
    pointer('pointerup', 160, 70);
    const depth = commit()?.depthOfField;
    const increment = 20 / Math.hypot(400, 200);
    expect(depth?.[kind]).toBeCloseTo(
      props.region.depthOfField![kind] + increment * (kind === 'width' ? 2 : 1)
    );
    expect(depth?.strength).toBe(0.5);
    expect(depth?.[kind === 'width' ? 'softness' : 'width']).toBe(
      props.region.depthOfField![kind === 'width' ? 'softness' : 'width']
    );
  }
);

it('rejects singular focus projection before transport interaction', async () => {
  props.tool = 'focus';
  handle = 'center';
  props.geometry = { ...props.geometry!, projection: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
  await render();
  pointer('pointerdown', 110, 70);
  key('ArrowRight');
  expect(props.onInteract).not.toHaveBeenCalled();
  expect(props.onCommit).not.toHaveBeenCalled();
});
