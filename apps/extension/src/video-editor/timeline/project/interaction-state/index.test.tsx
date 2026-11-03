// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createTimelineTestProps } from '../test-support';
import { useProjectTimelineState } from './index';

it('keeps drag geometry aligned when FX rows collapse without changing the project', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  const props = createTimelineTestProps();
  const clip = props.project.clips[0]!;
  props.project.effectInstances = [0, 1].map((index) => ({
    id: `fx-${index}`,
    kind: 'targetEffect',
    target: { kind: 'clip', clipId: clip.id },
    snapshotId: 'snapshot',
    controls: {},
    enabled: true,
    playbackRate: 1,
    startTime: clip.startTime,
    duration: clip.duration,
  }));
  const original = structuredClone(props.project);
  let model: ReturnType<typeof useProjectTimelineState> | undefined;
  function Harness({ collapsed }: { collapsed: boolean }) {
    model = useProjectTimelineState(
      { ...props, collapsedFxByTrackId: { [clip.trackId]: collapsed } },
      {}
    );
    return null;
  }
  try {
    act(() => root.render(<Harness collapsed={false} />));
    const expanded = model!.trackLayoutModel.layoutByTrackId.get(clip.trackId)!;
    expect(expanded.fxHeight).toBe(48);
    act(() => root.render(<Harness collapsed />));
    const collapsed = model!.trackLayoutModel.layoutByTrackId.get(clip.trackId)!;
    expect(collapsed.fxHeight).toBe(24);
    expect(collapsed.rowHeight).toBe(expanded.rowHeight - 24);
    expect(collapsed.clipRowHeight).toBe(expanded.clipRowHeight);
    expect(collapsed.center).toBe(expanded.center);
    expect(props.project).toEqual(original);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it.each(['click', 'range'] as const)(
  'selects the empty track on %s without selecting the scene',
  (kind) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const props = createTimelineTestProps();
    props.pixelsPerSecond = 60;
    props.project.duration = 10;
    const trackId = props.project.tracks[0]!.id;
    const selectTrack = vi.fn();
    const selectScene = vi.fn();
    const seek = vi.fn();
    const range = vi.fn();
    let model: ReturnType<typeof useProjectTimelineState> | undefined;
    function Harness() {
      model = useProjectTimelineState(
        {
          ...props,
          onSelectTrack: selectTrack,
          onSelectScene: selectScene,
          onSeek: seek,
          onSetPlaybackRange: range,
        },
        {}
      );
      return (
        <div ref={model.timelineRef} onPointerDown={model.beginTrackRangeSelection(trackId)} />
      );
    }
    try {
      act(() => root.render(<Harness />));
      vi.spyOn(model!.timelineRef.current!, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 0, 600, 200)
      );
      const capture = vi.fn();
      model!.timelineRef.current!.setPointerCapture = capture;
      act(() =>
        model!.timelineRef.current!.dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, clientX: 120, button: 0 })
        )
      );
      expect(capture).toHaveBeenCalledOnce();
      expect(selectTrack).toHaveBeenCalledExactlyOnceWith(trackId);
      act(() => {
        if (kind === 'range') window.dispatchEvent(new MouseEvent('pointermove', { clientX: 240 }));
        window.dispatchEvent(
          new MouseEvent('pointerup', { clientX: kind === 'range' ? 240 : 120 })
        );
      });
      expect(selectScene).not.toHaveBeenCalled();
      if (kind === 'click') expect(seek).toHaveBeenCalledExactlyOnceWith(2);
      else expect(range).toHaveBeenCalledExactlyOnceWith({ start: 2, end: 4 });
    } finally {
      act(() => root.unmount());
      container.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  }
);
