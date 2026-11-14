// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';
import {
  DEFAULT_CAMERA_PERSPECTIVE,
  type CameraPerspective,
  type CameraSpatialMotion,
} from '../../features/video/project/motion/spatial';
import { SpatialMotionFields } from './spatial';

let root: Root;
let host: HTMLDivElement;
const change = vi.fn<(value: CameraSpatialMotion) => void>();
const preview = vi.fn<(value: CameraSpatialMotion | null) => void>();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  change.mockClear();
  preview.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function render(value?: CameraSpatialMotion, perspective?: CameraPerspective) {
  act(() =>
    root.render(
      <SpatialMotionFields
        value={value}
        perspective={perspective}
        onChange={change}
        onPreview={preview}
      />
    )
  );
}
function click(key: Parameters<typeof translate>[0]) {
  const button = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === translate(key)
  );
  expect(button).toBeDefined();
  act(() => button!.click());
}
it('enables default motion without changing its opening pose and preserves data when disabled', () => {
  render();
  expect(host.querySelector('input[type="range"]')).toBeNull();
  act(() => host.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  const value = change.mock.lastCall![0];
  expect(value).toEqual({
    enabled: true,
    end: { ...DEFAULT_CAMERA_PERSPECTIVE, rotateY: -DEFAULT_CAMERA_PERSPECTIVE.rotateY },
    easing: 'ease-in-out',
  });
  render(value);
  expect(host.querySelectorAll('input[type="range"]')).toHaveLength(3);
  act(() => host.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  expect(change.mock.lastCall![0]).toEqual({ ...value, enabled: false });
  expect(DEFAULT_CAMERA_PERSPECTIVE.enabled).toBe(false);
});
it.each(['orbit', 'rise', 'roll'] as const)(
  'authors the %s preset from the opening pose within valid limits',
  (preset) => {
    const base = {
      ...DEFAULT_CAMERA_PERSPECTIVE,
      enabled: true,
      rotateX: -55,
      rotateY: 0,
      rotateZ: 175,
    };
    const value: CameraSpatialMotion = {
      enabled: true,
      end: { ...base, ...(preset === 'orbit' ? { rotateX: -54 } : {}) },
      easing: 'linear',
    };
    const before = structuredClone(value);
    render(value, base);
    click(
      preset === 'orbit'
        ? 'gallery.videoReview.spatialMotionOrbit'
        : preset === 'rise'
          ? 'gallery.videoReview.spatialMotionRise'
          : 'gallery.videoReview.spatialMotionRoll'
    );
    expect(change.mock.lastCall![0]).toEqual({
      ...value,
      end: {
        ...base,
        ...(preset === 'orbit'
          ? { rotateY: -18 }
          : preset === 'rise'
            ? { rotateX: -60 }
            : { rotateZ: 180 }),
      },
    });
    expect(value).toEqual(before);
    click('gallery.videoReview.transitionSmooth');
    expect(change.mock.lastCall![0]).toEqual({ ...value, easing: 'ease-in-out' });
    render({ ...value, easing: 'ease-in-out' }, base);
    click('gallery.videoReview.transitionLinear');
    expect(change.mock.lastCall![0]).toEqual(value);
  }
);
it.each([
  ['rotateX', 'spatialMotionEndX'],
  ['rotateY', 'spatialMotionEndY'],
  ['rotateZ', 'spatialMotionEndZ'],
] as const)('previews, cancels and commits only endpoint %s', (axis, label) => {
  const value: CameraSpatialMotion = {
    enabled: true,
    end: { ...DEFAULT_CAMERA_PERSPECTIVE, enabled: true, rotateX: 10, rotateY: 20, rotateZ: 30 },
    easing: 'linear',
  };
  render(value);
  const range = host.querySelector<HTMLInputElement>(
    `input[type="range"][aria-label^="${translate(`gallery.videoReview.${label}`)}"]`
  )!;
  expect(range).not.toBeNull();
  const key = (type: string, key: string) =>
    act(() => range.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true })));
  key('keydown', 'ArrowRight');
  expect(change).not.toHaveBeenCalled();
  expect(preview.mock.lastCall![0]!.end[axis]).toBeCloseTo(value.end[axis] + 0.1);
  key('keydown', 'Escape');
  key('keyup', 'ArrowRight');
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(change).not.toHaveBeenCalled();
  key('keydown', 'ArrowRight');
  key('keyup', 'ArrowRight');
  expect(change).toHaveBeenCalledOnce();
  expect(change.mock.lastCall![0]).toEqual({
    ...value,
    end: { ...value.end, [axis]: value.end[axis] + 0.1 },
  });
});
