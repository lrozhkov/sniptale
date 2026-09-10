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
    expect(collapsed.fxHeight).toBe(20);
    expect(collapsed.rowHeight).toBe(expanded.rowHeight - 28);
    expect(collapsed.clipRowHeight).toBe(expanded.clipRowHeight);
    expect(collapsed.center).toBe(expanded.center);
    expect(props.project).toEqual(original);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
