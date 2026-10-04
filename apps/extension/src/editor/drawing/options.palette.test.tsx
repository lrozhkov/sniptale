// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { DrawingPaletteStateV1 } from '../../composition/persistence/drawing-palette';

const palette = vi.hoisted(() => ({
  load: vi.fn<() => Promise<DrawingPaletteStateV1>>(),
  subscribe: vi.fn<(listener: (state: DrawingPaletteStateV1) => void) => () => void>(),
}));
vi.mock('../../composition/persistence/drawing-palette', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/drawing-palette')>()),
  loadDrawingPaletteState: palette.load,
  subscribeToDrawingPaletteState: palette.subscribe,
}));
import { EditorDrawingOptions } from './options';
import { createDefaultDrawingPaletteState } from '../../composition/persistence/drawing-palette';

it('keeps a settings update when an older palette load finishes later', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const initial = createDefaultDrawingPaletteState();
  const updated = { ...initial, colors: ['#123456', ...initial.colors.slice(1)] };
  let finishLoad: ((state: DrawingPaletteStateV1) => void) | undefined;
  let notify: ((state: DrawingPaletteStateV1) => void) | undefined;
  const stop = vi.fn();
  palette.load.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishLoad = resolve;
      })
  );
  palette.subscribe.mockImplementation((listener) => {
    notify = listener;
    return stop;
  });
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <EditorDrawingOptions
        tool="pencil"
        selectedType={null}
        onDirectionChange={vi.fn()}
        onApplyToSelection={vi.fn()}
        onPreviewSelection={vi.fn()}
        onClearSelection={vi.fn()}
        onDeleteSelection={vi.fn()}
      />
    )
  );
  act(() => notify?.(updated));
  await act(async () => finishLoad?.(initial));
  const buttons = host.querySelectorAll<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.quick-colors"] button'
  );
  expect(Array.from(buttons, (button) => button.title)).toEqual(updated.colors.slice(0, 5));
  act(() => root.unmount());
  expect(stop).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});
