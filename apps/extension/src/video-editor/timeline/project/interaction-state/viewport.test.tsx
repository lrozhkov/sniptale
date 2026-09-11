// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { useProjectTimelineViewState } from './viewport';

let root: Root;
let container: HTMLDivElement;
let controls: ReturnType<typeof useProjectTimelineViewState>;
const onZoomChange = vi.fn();
const project = { ...createEmptyVideoProject('Fit', 1920, 1080), duration: 100 };
function Harness(props: {
  zoom: number;
  selected: boolean;
  duration?: number;
  fps?: number;
  projectDuration?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  controls = useProjectTimelineViewState(
    {
      project: {
        ...project,
        duration: props.projectDuration ?? project.duration,
        fps: props.fps ?? project.fps,
      },
      pixelsPerSecond: props.zoom,
      onZoomChange,
      currentTime: 12,
    },
    props.selected ? { startTime: 80, duration: props.duration ?? 1 } : null,
    1000,
    ref
  );
  return <div ref={ref} />;
}
const render = (zoom: number, selected = true) =>
  act(() => root.render(<Harness zoom={zoom} selected={selected} />));
const scroll = () => container.firstElementChild as HTMLDivElement;
beforeEach(() => {
  onZoomChange.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('centers the selection only after the requested zoom has committed, without changing vertical scroll', () => {
  render(90);
  scroll().scrollTop = 140;
  act(() => controls.onFitSelection());
  expect(onZoomChange).toHaveBeenLastCalledWith(904);
  expect(scroll().scrollLeft).toBe(0);
  render(904);
  expect(scroll().scrollLeft).toBe(80.5 * 904 - 500);
  expect(scroll().scrollTop).toBe(140);
  scroll().scrollLeft = 0;
  act(() => controls.onFitSelection());
  expect(scroll().scrollLeft).toBe(80.5 * 904 - 500);
});

it('supersedes a pending selection fit with project overview and restores the beginning', () => {
  render(90);
  scroll().scrollLeft = 400;
  act(() => controls.onFitSelection());
  act(() => controls.onFitProject());
  render(904);
  expect(scroll().scrollLeft).toBe(400);
  render(9.04);
  expect(scroll().scrollLeft).toBe(0);
});

it('ignores fit selection when no clip is selected', () => {
  render(90, false);
  scroll().scrollLeft = 400;
  act(() => controls.onFitSelection());
  expect(onZoomChange).not.toHaveBeenCalled();
  expect(scroll().scrollLeft).toBe(400);
});

it('fits the admitted 24-hour project into the viewport with fractional scale', () => {
  const originalDuration = project.duration;
  project.duration = 86400;
  try {
    render(90);
    act(() => controls.onFitProject());
    const requested = onZoomChange.mock.lastCall?.[0] as number;
    expect(requested).toBeGreaterThan(0);
    expect(requested * 86400).toBeLessThanOrEqual(1000);
  } finally {
    project.duration = originalDuration;
  }
});

it('preserves the visible playhead position during ordinary zoom', () => {
  render(90);
  scroll().scrollLeft = 900;
  act(() => controls.onZoomChange(180));
  render(180);
  expect(12 * 180 - scroll().scrollLeft).toBeCloseTo(180, 9);
});

it('anchors to viewport center when the playhead is offscreen', () => {
  render(90);
  scroll().scrollLeft = 4500;
  act(() => controls.onZoomChange(180));
  render(180);
  expect(scroll().scrollLeft).toBe(9500);
});

it.each([30, 60, 240])(
  'makes a one-frame selection independently draggable and trimmable at %sfps',
  (fps) => {
    act(() => root.render(<Harness zoom={90} selected duration={1 / fps} fps={fps} />));
    act(() => controls.onFitSelection());
    const zoom = onZoomChange.mock.lastCall?.[0] as number;
    expect(zoom / fps).toBeGreaterThanOrEqual(96);
    act(() => root.render(<Harness zoom={zoom} selected duration={1 / fps} fps={fps} />));
    const projection = controls.projection;
    expect((80 + 0.5 / fps - projection.startTime) * zoom).toBeCloseTo(500, 6);
    expect(projection.scrollWidth).toBeLessThanOrEqual(30000000);
  }
);

it('recovers an old over-wide scale to project fit but preserves useful zoom', () => {
  render(0.005);
  expect(onZoomChange).toHaveBeenCalledWith(9.04);
  onZoomChange.mockClear();
  render(120);
  expect(onZoomChange).not.toHaveBeenCalled();
});

it('does not magnify an empty project before its first insertion', () => {
  act(() => root.render(<Harness zoom={90} selected={false} projectDuration={0} />));
  expect(onZoomChange).not.toHaveBeenCalled();
});
