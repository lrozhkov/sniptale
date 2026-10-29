// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { usePaletteNames } from './use-palette-names';
import type { DrawingPaletteStateV1 } from '../persistence/drawing-palette/contracts';
const mocks = vi.hoisted(() => ({ load: vi.fn(), subscribe: vi.fn() }));
vi.mock('../persistence/drawing-palette', () => ({
  loadDrawingPaletteState: mocks.load,
  subscribeToDrawingPaletteState: mocks.subscribe,
}));
it('keeps observed names when the initial read completes late and unsubscribes on close', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let finish!: (state: DrawingPaletteStateV1) => void;
  mocks.load.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  let publish!: (state: DrawingPaletteStateV1) => void;
  const stop = vi.fn();
  mocks.subscribe.mockImplementation((listener) => {
    publish = listener;
    return stop;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function View() {
    const names = usePaletteNames();
    return <span>{names['#112233']}</span>;
  }
  try {
    await act(async () => root.render(<View />));
    act(() => publish({ schemaVersion: 1, colors: [], names: { '#112233': 'New' } }));
    await act(async () => finish({ schemaVersion: 1, colors: [], names: { '#112233': 'Old' } }));
    expect(host.textContent).toBe('New');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
  expect(stop).toHaveBeenCalledOnce();
});

it.each([undefined, { '#112233': 'Initial' }])(
  'loads optional names and clears them after storage removal: %s',
  async (names) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.load.mockResolvedValue({ schemaVersion: 1, colors: [], ...(names ? { names } : {}) });
    let publish!: (state: DrawingPaletteStateV1) => void;
    mocks.subscribe.mockImplementation((listener) => {
      publish = listener;
      return vi.fn();
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    function View() {
      return <span>{usePaletteNames()['#112233'] ?? 'Automatic'}</span>;
    }
    try {
      await act(async () => root.render(<View />));
      expect(host.textContent).toBe(names ? 'Initial' : 'Automatic');
      act(() => publish({ schemaVersion: 1, colors: [] }));
      expect(host.textContent).toBe('Automatic');
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  }
);
it('ignores an initial read and an already queued observation after unmount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let finish!: (state: DrawingPaletteStateV1) => void;
  mocks.load.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  let publish!: (state: DrawingPaletteStateV1) => void;
  mocks.subscribe.mockImplementation((listener) => {
    publish = listener;
    return vi.fn();
  });
  function View() {
    usePaletteNames();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<View />));
  await act(async () => root.unmount());
  await act(async () => {
    finish({ schemaVersion: 1, colors: [] });
    publish({ schemaVersion: 1, colors: [] });
  });
  vi.unstubAllGlobals();
});
