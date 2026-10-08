// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewSpatialControls, ReviewSpatialToolbar } from './spatial-controls';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import {
  DEFAULT_QUICK_EDIT_DEPTH,
  DEFAULT_QUICK_EDIT_PERSPECTIVE,
  quickEditSpatialTargetCamera,
} from '../../features/video/review/advanced/spatial';
import { quickEditPlaneProjection } from '../../features/video/review/advanced/spatial-geometry';
import {
  resolveReviewSpatialFocusGeometry,
  type ReviewSpatialControlGeometryInput,
} from './spatial-control-geometry';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
const roots: ReturnType<typeof createRoot>[] = [];
const hosts: HTMLDivElement[] = [];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  hosts.splice(0).forEach((host) => host.remove());
  vi.unstubAllGlobals();
});
function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  return { host, render: (node: ReactNode) => act(() => root.render(node)) };
}
const region = {
  ...createQuickEditZoomRegion({ id: 'spatial-ui', at: 2 }),
  perspective: {
    ...DEFAULT_QUICK_EDIT_PERSPECTIVE,
    enabled: true,
    rotateX: 15,
    rotateY: 20,
    rotateZ: 35,
  },
  depthOfField: {
    ...DEFAULT_QUICK_EDIT_DEPTH,
    enabled: true,
    mode: 'area' as const,
    width: 0.2,
    softness: 0.08,
  },
};
const label = (name: string) => `gallery.videoReview.${name}`;
function button(host: HTMLElement, name: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label(name)}"]`);
  expect(found, name).not.toBeNull();
  return found!;
}
function geometry(
  value: QuickEditZoomRegion = region,
  plane = { x: 50, y: 70, width: 800, height: 460 }
): ReviewSpatialControlGeometryInput {
  const frame = quickEditSpatialTargetCamera(value).spatial!;
  return {
    plane,
    projection: quickEditPlaneProjection(plane, plane, frame),
    rotation: frame.rotation,
    focus: value.depthOfField!,
  };
}
function controls(overrides: Partial<ComponentProps<typeof ReviewSpatialControls>> = {}) {
  const view = mount();
  vi.spyOn(view.host, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 240, 144));
  const props: ComponentProps<typeof ReviewSpatialControls> = {
    region,
    renderedRegion: region,
    revision: 'authored-1',
    tool: 'focus',
    axis: 'both',
    geometry: geometry(),
    output: { width: 900, height: 600 },
    bounds: { current: view.host },
    enabled: true,
    onPreview: vi.fn(),
    onCommit: vi.fn(),
    onInteract: vi.fn(),
    ...overrides,
  };
  const render = (patch: Partial<typeof props> = {}) => {
    Object.assign(props, patch);
    view.render(<ReviewSpatialControls {...props} />);
  };
  render();
  return { ...view, props, render };
}
function key(node: HTMLElement, name: string, shiftKey = false) {
  act(() =>
    node.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: name, shiftKey })
    )
  );
}

it('uses native disabled toolbar buttons from authored enable state and navigates without reset', () => {
  const view = mount();
  const onTool = vi.fn(),
    onAxis = vi.fn(),
    onReset = vi.fn();
  const disabledRegion = {
    ...region,
    perspective: { ...region.perspective, enabled: false },
    depthOfField: { ...region.depthOfField, enabled: false },
  };
  view.render(
    <ReviewSpatialToolbar
      tool="position"
      axis="both"
      region={disabledRegion}
      disabled={false}
      onTool={onTool}
      onAxis={onAxis}
      onReset={onReset}
    />
  );
  for (const name of ['spatialToolTilt', 'spatialToolRotation', 'spatialToolFocus']) {
    const node = button(view.host, name);
    expect(node.disabled).toBe(true);
    act(() => node.click());
  }
  expect(onTool).not.toHaveBeenCalled();
  expect(button(view.host, 'spatialToolPosition').disabled).toBe(false);
  expect(button(view.host, 'spatialToolPosition').type).toBe('button');
  expect(button(view.host, 'spatialToolPosition').getAttribute('aria-pressed')).toBe('true');
  view.render(
    <ReviewSpatialToolbar
      tool="position"
      axis="both"
      region={region}
      disabled={false}
      onTool={onTool}
      onAxis={onAxis}
      onReset={onReset}
    />
  );
  act(() => button(view.host, 'spatialToolTilt').click());
  expect(onTool).toHaveBeenCalledExactlyOnceWith('tilt');
  expect(onReset).not.toHaveBeenCalled();
  expect(onAxis).not.toHaveBeenCalled();
});

it.each([
  ['tilt', 'spatialResetTilt'],
  ['rotation', 'spatialResetRotation'],
  ['focus', 'spatialResetFocus'],
] as const)(
  'names the %s reset explicitly and disables toolbar actions during read-only playback',
  (tool, reset) => {
    const view = mount();
    const onTool = vi.fn(),
      onAxis = vi.fn(),
      onReset = vi.fn();
    const props = { tool, axis: 'both' as const, region, disabled: false, onTool, onAxis, onReset };
    view.render(<ReviewSpatialToolbar {...props} />);
    act(() => button(view.host, reset).click());
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onTool).not.toHaveBeenCalled();
    view.render(<ReviewSpatialToolbar {...props} disabled />);
    for (const node of view.host.querySelectorAll<HTMLButtonElement>('button')) {
      expect(node.disabled).toBe(true);
      act(() => node.click());
    }
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onAxis).not.toHaveBeenCalled();
  }
);

it('renders the actual projected sharp/soft contours and places width handles on those contours', () => {
  const strong = { ...region, perspective: { ...region.perspective, rotateX: -55, rotateY: 60 } };
  const input = geometry(strong);
  const expected = resolveReviewSpatialFocusGeometry(input)!;
  const view = controls({ region: strong, renderedRegion: strong, geometry: input });
  const paths = [...view.host.querySelectorAll('polyline')].map((node) =>
    node.getAttribute('points')
  );
  expect(paths).toEqual(
    [...expected.sharp, ...expected.soft].map((points) =>
      points.map((p) => `${p.x},${p.y}`).join(' ')
    )
  );
  expect(view.host.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 900 600');
  const center = button(view.host, 'spatialFocusCenter');
  expect(parseFloat(center.style.left)).toBeCloseTo((expected.center.x / 900) * 100, 8);
  expect(parseFloat(center.style.top)).toBeCloseTo((expected.center.y / 600) * 100, 8);
  const widthButtons = view.host.querySelectorAll<HTMLButtonElement>(
    `button[aria-label="${label('depthWidth')}"]`
  );
  const visibleWidthHandles = expected.handles.filter(
    (h) =>
      h.kind === 'width' && h.point.x >= 0 && h.point.x <= 900 && h.point.y >= 0 && h.point.y <= 600
  );
  expect(widthButtons).toHaveLength(visibleWidthHandles.length);
  widthButtons.forEach((node, index) => {
    expect(parseFloat(node.style.left)).toBeCloseTo(
      (visibleWidthHandles[index]!.point.x / 900) * 100,
      8
    );
    expect(node.disabled).toBe(false);
  });
});

it('shows neutral frontal depth without fake boundaries, while preserving a keyboard-accessible center', () => {
  const frontal = {
    ...region,
    perspective: { ...region.perspective, rotateX: 0, rotateY: 0, rotateZ: 0 },
    depthOfField: { ...region.depthOfField, mode: 'depth' as const },
  };
  const view = controls({ region: frontal, renderedRegion: frontal, geometry: geometry(frontal) });
  expect(view.host.textContent).toContain(label('spatialFlatDepth'));
  expect(view.host.querySelectorAll('polyline')).toHaveLength(0);
  expect(view.host.querySelector(`button[aria-label="${label('depthWidth')}"]`)).toBeNull();
  const center = button(view.host, 'spatialFocusCenter');
  key(center, 'ArrowRight', true);
  key(center, 'Enter');
  expect(view.props.onCommit).toHaveBeenCalledExactlyOnceWith('authored-1', {
    depthOfField: { ...frontal.depthOfField, x: 0.502 },
  });
  expect(view.props.onInteract).toHaveBeenCalledTimes(1);
});

it('omits off-output focus handles instead of clamping them into false visible positions', () => {
  const input = geometry();
  const displaced: ReviewSpatialControlGeometryInput = {
    ...input,
    projection: [1, 0, 2000, 0, 1, 2000, 0, 0, 1],
  };
  const view = controls({ geometry: displaced });
  expect(resolveReviewSpatialFocusGeometry(displaced)?.center.x).toBeGreaterThan(900);
  expect(view.host.querySelectorAll('button')).toHaveLength(0);
  expect(view.host.querySelectorAll('polyline').length).toBeGreaterThan(0);
  expect(view.props.onCommit).not.toHaveBeenCalled();
});

it.each([0, 90, 180, -90])(
  'keeps the %s-degree roll handle inside a narrow portrait preview and usable by keyboard',
  (rotateZ) => {
    const authored = { ...region, perspective: { ...region.perspective, rotateZ } };
    const view = controls({
      tool: 'rotation',
      region: authored,
      renderedRegion: authored,
      output: { width: 600, height: 1100 },
    });
    const node = button(view.host, 'spatialDragRotation');
    // The 28 CSS-pixel hit target fits a 120x220 fitted portrait; actual layout remains browser proof.
    const x = (parseFloat(node.style.left) * 120) / 100;
    const y = (parseFloat(node.style.top) * 220) / 100;
    expect(x).toBeGreaterThanOrEqual(14);
    expect(x).toBeLessThanOrEqual(106);
    expect(y).toBeGreaterThanOrEqual(14);
    expect(y).toBeLessThanOrEqual(206);
    expect(node.type).toBe('button');
    key(node, 'ArrowRight');
    expect(view.host.querySelector('[data-active="rotation"]')).not.toBeNull();
    key(node, 'Escape');
    expect(view.props.onCommit).not.toHaveBeenCalled();
    expect(view.props.onPreview).toHaveBeenLastCalledWith(null);
  }
);

it('uses authored enable state for the real gesture even when rendered transient perspective is enabled', () => {
  const authored = { ...region, perspective: { ...region.perspective, enabled: false } };
  const view = controls({ tool: 'tilt', region: authored, renderedRegion: region });
  const node = button(view.host, 'spatialDragTilt');
  expect(node.disabled).toBe(true);
  key(node, 'ArrowRight');
  key(node, 'Enter');
  expect(view.props.onInteract).not.toHaveBeenCalled();
  expect(view.props.onCommit).not.toHaveBeenCalled();
});

it('provides a real constrained tilt keyboard transaction that commits once and leaves roll untouched', () => {
  const view = controls({ tool: 'tilt', axis: 'x' });
  const node = button(view.host, 'spatialDragTilt');
  key(node, 'ArrowUp');
  key(node, 'ArrowRight');
  key(node, 'Enter');
  expect(view.props.onCommit).toHaveBeenCalledExactlyOnceWith('authored-1', {
    perspective: { ...region.perspective, rotateX: 16 },
  });
  expect(view.props.onInteract).toHaveBeenCalledTimes(1);
  expect(view.host.querySelector('[data-active]')).toBeNull();
});

it('fits the rotation target after panoramic resize and disconnects observation', () => {
  const observe = vi.fn();
  const disconnect = vi.fn();
  let notifyResize = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        notifyResize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
  );
  const view = mount();
  let cssWidth = 160;
  const bounds = { current: view.host };
  vi.spyOn(view.host, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, cssWidth, (cssWidth * 135) / 480)
  );
  const authored = { ...region, perspective: { ...region.perspective, rotateZ: 0 } };
  const props: ComponentProps<typeof ReviewSpatialControls> = {
    region: authored,
    renderedRegion: authored,
    revision: 'panorama',
    tool: 'rotation',
    axis: 'both',
    geometry: null,
    output: { width: 480, height: 135 },
    bounds,
    enabled: true,
    onPreview: vi.fn(),
    onCommit: vi.fn(),
    onInteract: vi.fn(),
  };
  const assertTargetFits = (width: number, height: number) => {
    const handle = button(view.host, 'spatialDragRotation');
    const x = (parseFloat(handle.style.left) * width) / 100;
    const y = (parseFloat(handle.style.top) * height) / 100;
    expect(x - 14).toBeGreaterThanOrEqual(0);
    expect(x + 14).toBeLessThanOrEqual(width);
    expect(y - 14).toBeGreaterThanOrEqual(0);
    expect(y + 14).toBeLessThanOrEqual(height);
  };
  view.render(<ReviewSpatialControls {...props} />);
  expect(observe).toHaveBeenCalledExactlyOnceWith(view.host);
  assertTargetFits(160, 45);
  const initialRadius = Number(view.host.querySelector('circle')!.getAttribute('r'));
  cssWidth = 240;
  act(() => notifyResize());
  assertTargetFits(240, 67.5);
  expect(Number(view.host.querySelector('circle')!.getAttribute('r'))).toBeGreaterThan(
    initialRadius
  );
  // The opposite vertical extreme must have the same fixed CSS-pixel clearance.
  view.render(
    <ReviewSpatialControls
      {...props}
      renderedRegion={{ ...authored, perspective: { ...authored.perspective, rotateZ: 180 } }}
    />
  );
  assertTargetFits(240, 67.5);
  expect(observe).toHaveBeenCalledTimes(1);
  view.render(null);
  expect(disconnect).toHaveBeenCalledTimes(1);
});
