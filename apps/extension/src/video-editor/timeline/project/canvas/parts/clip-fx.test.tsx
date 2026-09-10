// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createProjectWithEffects } from '../../../../project/state/effects.effect-instance.test-support';
import { useVideoEditorStore } from '../../../../state/store';
import { buildTimelineTrackLayoutModel } from '../../tracks/layout';
import { InspectFxPanel } from '../../../../workspace/sidebar/selection/inspection/fx';
import { ClipFxRows } from './clip-fx';

it('edits FX intervals with pointer/keyboard, cancels gestures and respects collapsed or locked rows', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const initial = useVideoEditorStore.getState();
  const project = createProjectWithEffects();
  const clip = project.clips.find((item) => item.id === 'clip-a')!;
  const fx = project.effectInstances!.find((item) => item.id === 'clip')!;
  fx.startTime = 3.25;
  fx.duration = 1;
  useVideoEditorStore.getState().setProject(project);
  function Harness({ collapsed = false }: { collapsed?: boolean }) {
    const state = useVideoEditorStore();
    const project = state.project!;
    const layout = buildTimelineTrackLayoutModel({
      project,
      tracks: project.tracks,
      trackHeightByTrackId: {},
      collapsedFxByTrackId: { [clip.trackId]: collapsed },
    }).layoutByTrackId.get(clip.trackId)!;
    return (
      <>
        <ClipFxRows
          project={project}
          layout={layout}
          pixelsPerSecond={100}
          selectedId={
            state.selection.kind === 'effect-instance' ? state.selection.effectInstanceId : null
          }
        />
        <InspectFxPanel project={project} instanceId="clip" />
        <InspectFxPanel project={project} instanceId="missing" />
      </>
    );
  }
  const value = () =>
    useVideoEditorStore.getState().project!.effectInstances!.find((item) => item.id === 'clip')!;
  const button = () => container.querySelector<HTMLButtonElement>('[data-clip-fx="clip"] button')!;
  const key = (target: Element, key: string, extra = {}) =>
    act(() => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra })));
  const pointer = (target: EventTarget, type: string, x: number, button = 0) =>
    act(() => target.dispatchEvent(new MouseEvent(type, { clientX: x, button, bubbles: true })));
  try {
    act(() => root.render(<Harness />));
    act(() => button().click());
    expect(useVideoEditorStore.getState().selection.kind).toBe('effect-instance');
    key(button(), 'ArrowRight');
    expect(value().startTime).toBeCloseTo(3.25 + 1 / project.fps);
    key(button(), 'ArrowLeft');
    const original = value().startTime;
    pointer(button(), 'pointerdown', 100);
    pointer(window, 'pointermove', 125);
    expect(value().startTime).toBe(original);
    pointer(window, 'pointerup', 125);
    expect(value().startTime).toBeCloseTo(original + 0.25);
    pointer(button(), 'pointerdown', 100);
    pointer(window, 'pointermove', 130);
    key(document.body, 'Escape');
    expect(value().startTime).toBeCloseTo(original + 0.25);
    const handles = () =>
      container.querySelectorAll<HTMLButtonElement>('[data-clip-fx="clip"] button');
    pointer(handles()[1]!, 'pointerdown', 100);
    pointer(window, 'pointermove', 110);
    pointer(window, 'pointerup', 110);
    expect(value().duration).toBeCloseTo(0.9);
    pointer(handles()[2]!, 'pointerdown', 100);
    pointer(window, 'pointermove', 110);
    pointer(window, 'pointerup', 110);
    expect(value().duration).toBeCloseTo(1);
    key(handles()[1]!, 'ArrowLeft');
    key(handles()[2]!, 'ArrowRight');
    act(() =>
      useVideoEditorStore.getState().updateEffectInstance('clip', { startTime: 4, duration: 1 })
    );
    key(handles()[2]!, 'ArrowRight');
    expect(value().startTime).toBe(4);
    expect(value().duration).toBe(1);
    act(() =>
      useVideoEditorStore
        .getState()
        .updateEffectInstance('clip', { startTime: 3.5, duration: 1 / project.fps })
    );
    key(handles()[1]!, 'ArrowRight');
    expect(value().startTime).toBe(3.5);
    expect(value().duration).toBeCloseTo(1 / project.fps);
    const beforeLocked = structuredClone(value());
    act(() => useVideoEditorStore.getState().toggleTrackLock(clip.trackId));
    pointer(button(), 'pointerdown', 100);
    pointer(window, 'pointermove', 140);
    pointer(window, 'pointerup', 140);
    key(button(), 'ArrowRight');
    expect(value()).toEqual(beforeLocked);
    act(() => useVideoEditorStore.getState().toggleTrackLock(clip.trackId));
    act(() => useVideoEditorStore.getState().setClipEffectsBypassed(clip.id, true));
    expect(container.querySelector<HTMLElement>('[data-clip-fx="clip"]')!.style.opacity).toBe(
      '0.45'
    );
    act(() => root.render(<Harness collapsed />));
    pointer(button(), 'pointerdown', 100);
    pointer(window, 'pointermove', 140);
    pointer(window, 'pointerup', 140);
    expect(value()).toEqual(beforeLocked);
    act(() => root.render(<Harness />));
    key(button(), 'd', { ctrlKey: true });
    expect(container.querySelectorAll('[data-clip-fx]')).toHaveLength(2);
    key(button(), 'Delete');
    expect(container.querySelectorAll('[data-clip-fx]')).toHaveLength(1);
  } finally {
    act(() => root.unmount());
    useVideoEditorStore.setState(initial, true);
    container.remove();
    vi.unstubAllGlobals();
  }
});
