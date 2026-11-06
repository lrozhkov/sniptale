// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createDrawingSession, DEFAULT_DRAWING_COLORS } from '../../../../features/drawing/public';
import type { ContentDrawingController } from '../../../drawing/controller';
import { ToolbarDrawingControls } from './drawing';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('wires Simplify defaults without rebuild and shows rebuild only for a selected layer', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const update = vi.fn(async () => undefined);
  const rebuild = vi.fn(async () => undefined);
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    simplify: {
      prepare: vi.fn(async () => {
        throw new Error('Unexpected source preparation');
      }),
      cancelPreparation: vi.fn(),
      submit: vi.fn(async () => undefined),
      transform: vi.fn(async () => undefined),
      duplicate: vi.fn(async () => undefined),
      update,
      rebuild,
      getPending: () => [],
      getPendingObjects: () => [],
      getFeedback: () => null,
      getRevision: () => 0,
      subscribe: () => () => undefined,
      cancel: vi.fn(),
      dispose: vi.fn(),
    },
  };
  session.setActiveTool('simplify');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );
  const option = (name: string) =>
    host.querySelector<HTMLButtonElement>(
      `[data-ui="content.toolbar.drawing-options.simplify.${name}"]`
    );
  expect(option('automatic')?.getAttribute('aria-pressed')).toBe('true');
  expect(option('rebuild')).toBeNull();
  act(() => option('automatic')!.click());
  expect(session.getSnapshot().defaults.simplify.automatic).toBe(false);
  expect(option('manual-image')).not.toBeNull();
  const object = {
    id: 'selected-simplify',
    kind: 'simplify',
    bounds: { x: 10, y: 10, width: 30, height: 30 },
    settings: session.getSnapshot().defaults.simplify,
  } as const;
  act(() => session.commitObject(object));
  act(() => option('manual-image')!.click());
  expect(update).toHaveBeenCalledWith(object, { manualKind: 'image' });
  act(() => option('rebuild')!.click());
  expect(rebuild).toHaveBeenCalledWith(object);
  act(() => root.unmount());
  session.dispose();
});
