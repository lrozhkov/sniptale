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
function Harness(props: { zoom: number; selected: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  controls = useProjectTimelineViewState(
    { project, pixelsPerSecond: props.zoom, onZoomChange },
    props.selected ? { startTime: 80, duration: 1 } : null,
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
  expect(onZoomChange).toHaveBeenLastCalledWith(280);
  expect(scroll().scrollLeft).toBe(0);
  render(280);
  expect(scroll().scrollLeft).toBe(80.5 * 280 - 500);
  expect(scroll().scrollTop).toBe(140);
  scroll().scrollLeft = 0;
  act(() => controls.onFitSelection());
  expect(scroll().scrollLeft).toBe(80.5 * 280 - 500);
});

it('supersedes a pending selection fit with project overview and restores the beginning', () => {
  render(90);
  scroll().scrollLeft = 400;
  act(() => controls.onFitSelection());
  act(() => controls.onFitProject());
  render(280);
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
