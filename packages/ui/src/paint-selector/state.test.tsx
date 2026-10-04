// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createGradientPaint,
  createSolidPaint,
  instantiatePaint,
  updateGradientStop,
  type Paint,
} from '@sniptale/foundation/paint';
import { switchPaintMode } from './operations';
import { usePaintSelectorState } from './state';

let host: HTMLDivElement | null = null;
afterEach(() => host?.remove());

it('owns one preview/apply/cancel transaction and resynchronizes external values', () => {
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  const onPreviewChange = vi.fn();
  const onPreviewReset = vi.fn();
  let state: ReturnType<typeof usePaintSelectorState>;
  const View = ({ color }: { color: string }) => {
    state = usePaintSelectorState({
      createId: () => 'id',
      onChange,
      onPreviewChange,
      onPreviewReset,
      value: createSolidPaint(color),
    });
    return null;
  };
  act(() => root.render(<View color="#111" />));
  act(() => {
    state!.show();
    state!.preview(createSolidPaint('#222'));
    state!.cancel();
  });
  expect(onPreviewReset).toHaveBeenCalledWith(createSolidPaint('#111'));
  act(() => {
    state!.show();
    state!.preview(createSolidPaint('#444'));
  });
  act(() => state!.apply());
  expect(onChange).toHaveBeenCalledWith(createSolidPaint('#444'));
  expect(state!.open).toBe(false);
  act(() => root.render(<View color="#333" />));
  expect(state!.draft).toEqual(createSolidPaint('#333'));
  act(() => root.unmount());
});

it('selects gradient stops, ignores equivalent props and supports optional preview callbacks', () => {
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let stopIndex = 0;
  const gradient = createGradientPaint('#123456', () => `stop-${++stopIndex}`);
  let state: ReturnType<typeof usePaintSelectorState>;
  const View = ({ value }: { value: typeof gradient }) => {
    state = usePaintSelectorState({ createId: () => 'unused', onChange: vi.fn(), value });
    return null;
  };
  act(() => root.render(<View value={gradient} />));
  expect(state!.selectedStopId).toBe('stop-1');
  act(() => {
    state!.show();
    state!.preview(createSolidPaint('#fff'));
    state!.cancel();
  });
  const replacement = createGradientPaint('#654321', () => `stop-${++stopIndex}`);
  act(() => root.render(<View value={replacement} />));
  expect(state!.draft).toEqual(replacement);
  expect(state!.selectedStopId).toBe('stop-3');
  const equivalent = instantiatePaint(replacement, () => `equivalent-${++stopIndex}`);
  act(() => root.render(<View value={equivalent} />));
  expect(state!.draft).toEqual(replacement);
  expect(state!.selectedStopId).toBe('stop-3');
  act(() => root.unmount());
});

it('keeps the selected stop and cancel baseline when a parent echoes a gradient preview', () => {
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let stopIndex = 0;
  const initial = createGradientPaint('#123456', () => `echo-${++stopIndex}`);
  if (initial.kind !== 'gradient') throw new Error('Expected a gradient');
  const onPreviewReset = vi.fn();
  let state: ReturnType<typeof usePaintSelectorState>;
  const View = () => {
    const [value, setValue] = useState<Paint>(initial);
    state = usePaintSelectorState({
      createId: () => 'unused',
      onChange: setValue,
      onPreviewChange: setValue,
      onPreviewReset,
      value,
    });
    return null;
  };
  act(() => root.render(<View />));
  const selectedId = initial.gradient.stops[1]!.id;
  act(() => {
    state!.show();
    state!.setSelectedStopId(selectedId);
  });
  act(() =>
    state!.preview({
      kind: 'gradient',
      gradient: updateGradientStop(initial.gradient, selectedId, { color: '#abcdef' }),
    })
  );
  expect(state!.selectedStopId).toBe(selectedId);
  const draft = state!.draft;
  if (draft.kind !== 'gradient') throw new Error('Expected a gradient draft');
  expect(draft.gradient.stops[1]?.color).toBe('#abcdefff');
  act(() => state!.cancel());
  expect(onPreviewReset).toHaveBeenCalledWith(initial);
  act(() => root.unmount());
});

it('switches between solid and every gradient mode through the headless operation', () => {
  let id = 0;
  const createId = () => `mode-${++id}`;
  const solid = createSolidPaint('#abcdef80');
  const linear = switchPaintMode(solid, 'linear', createId);
  const radial = switchPaintMode(linear, 'radial', createId);
  const conic = switchPaintMode(radial, 'conic', createId);
  expect(linear).toMatchObject({ kind: 'gradient', gradient: { type: 'linear' } });
  expect(radial).toMatchObject({ kind: 'gradient', gradient: { type: 'radial' } });
  expect(conic).toMatchObject({ kind: 'gradient', gradient: { type: 'conic' } });
  expect(switchPaintMode(conic, 'solid', createId)).toMatchObject({ kind: 'solid' });
});

it('starts a new gradient at full opacity from a transparent solid without changing existing alpha', () => {
  let id = 0;
  const createId = () => `alpha-${++id}`;
  const transparent = switchPaintMode(createSolidPaint('#12345600'), 'linear', createId);
  expect(transparent.kind).toBe('gradient');
  if (transparent.kind !== 'gradient') return;
  expect(transparent.gradient.stops.map((stop) => stop.color)).toEqual(['#123456ff', '#123456ff']);

  const translucent = switchPaintMode(createSolidPaint('#12345680'), 'linear', createId);
  expect(translucent.kind).toBe('gradient');
  if (translucent.kind !== 'gradient') return;
  expect(translucent.gradient.stops.map((stop) => stop.color)).toEqual(['#12345680', '#12345680']);
  expect(switchPaintMode(translucent, 'radial', createId)).toMatchObject({
    gradient: { stops: translucent.gradient.stops },
  });
});
