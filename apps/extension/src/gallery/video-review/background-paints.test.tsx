// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGradientPaint, createSolidPaint } from '@sniptale/foundation/paint';
import type { DrawingPaletteStateV1 } from '../../composition/persistence/drawing-palette';
import { ReviewBackgroundPaints } from './background-paints';

const palette = vi.hoisted(() => ({
  load: vi.fn<() => Promise<DrawingPaletteStateV1>>(),
  unsubscribe: vi.fn(),
  listener: null as ((state: DrawingPaletteStateV1) => void) | null,
}));
vi.mock('../../composition/persistence/drawing-palette', () => ({
  getDrawingPaletteSnapshot: () => ({ schemaVersion: 1, colors: ['#ff0000ff', '#00ff00ff'] }),
  loadDrawingPaletteState: palette.load,
  subscribeToDrawingPaletteState: (listener: (state: DrawingPaletteStateV1) => void) => {
    palette.listener = listener;
    return palette.unsubscribe;
  },
}));
vi.mock('../../composition/gradient-preset-resources/use-gradient-preset-catalog', () => ({
  useGradientPresetCatalog: () => {
    const paint = createGradientPaint('#123456ff', () => 'stop', 'linear');
    if (paint.kind !== 'gradient') throw new Error('Expected gradient');
    return {
      presets: [
        { id: 'later', name: 'Later', order: 2, enabled: true, gradient: paint.gradient },
        { id: 'hidden', name: 'Hidden', order: 0, enabled: false, gradient: paint.gradient },
        { id: 'first', name: 'First', order: 1, enabled: true, gradient: paint.gradient },
      ],
    };
  },
}));
vi.mock('../../ui/paint-selector', () => ({ CompactPaintSelector: () => null }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  palette.unsubscribe.mockReset();
  palette.load.mockReset();
  palette.load.mockResolvedValue({ schemaVersion: 1, colors: ['#ff0000ff', '#00ff00ff'] });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const buttons = () => [...host.querySelectorAll('button')];
const render = (onChange = vi.fn()) =>
  act(async () =>
    root.render(
      <ReviewBackgroundPaints
        value={createSolidPaint('#ff0000ff')}
        onChange={onChange}
        onPreview={vi.fn()}
      />
    )
  );

it('keeps palette order, filters disabled gradients and selects both kinds', async () => {
  const change = vi.fn();
  await render(change);
  expect(buttons().map((button) => button.title)).toEqual([
    expect.stringContaining('#ff0000ff'),
    expect.stringContaining('#00ff00ff'),
    'First',
    'Later',
  ]);
  expect(buttons()[0]!.getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelectorAll('[data-ui="shared.ui.backgroundThumbnails.group"]')).toHaveLength(2);
  act(() => buttons()[1]!.click());
  expect(change).toHaveBeenLastCalledWith(createSolidPaint('#00ff00ff'));
  act(() => buttons()[2]!.click());
  expect(change.mock.lastCall?.[0].kind).toBe('gradient');
});

it('does not overwrite a newer palette notification with a late initial load', async () => {
  let finish!: (state: DrawingPaletteStateV1) => void;
  palette.load.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  await render();
  act(() => palette.listener?.({ schemaVersion: 1, colors: ['#0000ffff'] }));
  await act(async () => finish({ schemaVersion: 1, colors: ['#ffffffff'] }));
  expect(buttons()[0]!.title).toContain('#0000ffff');
  expect(buttons()).toHaveLength(3);
});

it('retains cached choices after load failure and unsubscribes on dismissal', async () => {
  palette.load.mockRejectedValue(new Error('Unavailable'));
  await render();
  expect(buttons()).toHaveLength(4);
  await act(async () => root.render(null));
  expect(palette.unsubscribe).toHaveBeenCalledOnce();
  act(() => palette.listener?.({ schemaVersion: 1, colors: ['#0000ffff'] }));
  expect(host.childElementCount).toBe(0);
});
