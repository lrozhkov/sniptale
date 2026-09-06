// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { setup } from '../../../../project/state/insertion/material.test-support';
import { resetVideoEditorProjectHistory } from '../../../../project/history';
import { isSourceTimedClip } from '../../../../project/operations/source-timed-clips';
import { ClipSourceRangeControls } from './source-range';

function harness() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { store, asset } = setup();
  store.getState().appendMaterial(asset.id, { start: 1, end: 5 });
  const id = store.getState().project!.clips[0]!.id;
  store.getState().moveClip(id, 2);
  store.getState().updateClipPlaybackRate(id, 2);
  store.setState({ projectHistory: resetVideoEditorProjectHistory(store.getState().project!.id) });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = (clipId = id) => {
    const project = store.getState().project!;
    const clip = project.clips.find((item) => item.id === clipId)!;
    if (!isSourceTimedClip(clip)) throw new Error('Expected source timed fixture');
    act(() =>
      root.render(
        <ClipSourceRangeControls
          key={clip.id}
          project={project}
          clip={clip}
          locked={false}
          onTrimClipStart={store.getState().trimClipStart}
          onTrimClipEnd={store.getState().trimClipEnd}
        />
      )
    );
  };
  const inputs = () => [...container.querySelectorAll<HTMLInputElement>('input')];
  const type = (index: number, value: string, key = 'Enter') => {
    const input = inputs()[index]!;
    act(() => input.focus());
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key })));
  };
  render();
  return {
    store,
    id,
    asset,
    render,
    inputs,
    increase: () =>
      act(() =>
        container.querySelector<HTMLButtonElement>('button[aria-label$=" increase"]')!.click()
      ),
    type,
    dispose: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

it.each([
  [0, '2', 2.5, 1.5],
  [1, '4', 2, 1.5],
] as const)(
  'maps source field %s through playback rate and records one action',
  (index, value, start, duration) => {
    const h = harness();
    try {
      const before = h.store.getState().project!;
      h.type(index, value);
      h.render();
      const clip = h.store.getState().project!.clips[0]!;
      expect(clip.startTime).toBe(start);
      expect(clip.duration).toBe(duration);
      expect(h.inputs()[index]!.value).toBe(value);
      expect(h.store.getState().projectHistory.past).toHaveLength(1);
      expect(h.store.getState().projectHistory.past[0]!.clips).toEqual(before.clips);
    } finally {
      h.dispose();
    }
  }
);

it('restores unsupported source values and Escape without a project edit', () => {
  const h = harness();
  try {
    const before = h.store.getState();
    h.type(0, '-1');
    expect(h.inputs()[0]!.value).toBe('1');
    h.type(1, '7');
    expect(h.inputs()[1]!.value).toBe('5');
    h.type(0, '2', 'Escape');
    expect(h.inputs()[0]!.value).toBe('1');
    expect(h.store.getState().project).toBe(before.project);
    expect(h.store.getState().projectHistory).toBe(before.projectHistory);
  } finally {
    h.dispose();
  }
});

it('disables source fields for a locked track', () => {
  const h = harness();
  try {
    h.store.getState().toggleTrackLock(h.store.getState().project!.clips[0]!.trackId);
    h.render();
    expect(h.inputs().every((input) => input.disabled)).toBe(true);
  } finally {
    h.dispose();
  }
});

it('discards a text draft on selection replacement', () => {
  const h = harness();
  try {
    h.store.getState().appendMaterial(h.asset.id, { start: 0, end: 1 });
    const other = h.store.getState().project!.clips[1]!;
    h.type(0, '2', 'Shift');
    const before = h.store.getState();
    h.render(other.id);
    expect(h.inputs()[0]!.value).toBe('0');
    expect(h.store.getState().project).toBe(before.project);
    expect(h.store.getState().projectHistory).toBe(before.projectHistory);
  } finally {
    h.dispose();
  }
});

it('does not quantize an existing fractional source boundary merely by committing its displayed value', () => {
  const h = harness();
  try {
    h.store.getState().trimClipStart(h.id, 2 + 1 / 6);
    h.render();
    const before = h.store.getState();
    h.type(0, h.inputs()[0]!.value);
    expect(h.store.getState().project).toBe(before.project);
    expect(h.store.getState().projectHistory).toBe(before.projectHistory);
  } finally {
    h.dispose();
  }
});

it.each([1, 4 / 3])(
  'steps from the exact applied boundary %s after cancelling a draft',
  (sourceIn) => {
    const h = harness();
    try {
      h.store.getState().trimClipStart(h.id, 2 + (sourceIn - 1) / 2);
      h.render();
      h.type(0, '2', 'Escape');
      h.increase();
      const clip = h.store.getState().project!.clips[0]!;
      if (!isSourceTimedClip(clip)) throw new Error('Expected source timed fixture');
      expect(clip.sourceStart).toBeCloseTo(sourceIn + 0.01, 6);
    } finally {
      h.dispose();
    }
  }
);
