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

it('recomputes a selected text frame immediately when its typography changes', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    backgroundColor: '#fef08a',
    bounds: { x: 20, y: 30, width: 180, height: 12 },
    color: '#111827',
    fontFamily: 'sans',
    fontSize: 20,
    id: 'selected-text',
    kind: 'text',
    text: 'Typography must reflow immediately',
  });
  session.setActiveTool('select');
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );
  const getText = () => {
    const object = session.getSnapshot().document.objects[0];
    if (object?.kind !== 'text') throw new Error('Expected selected text object');
    return object;
  };

  const initialHeight = getText().bounds.height;
  act(() =>
    host
      .querySelector<HTMLButtonElement>(
        '[data-ui="content.toolbar.drawing-options.text.font-serif"]'
      )
      ?.click()
  );
  expect(getText().fontFamily).toBe('serif');
  expect(getText().bounds.height).toBeGreaterThan(initialHeight);

  const serifHeight = getText().bounds.height;
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing-options.text.size-36"]')
      ?.click()
  );
  expect(getText()).toMatchObject({ fontFamily: 'serif', fontSize: 36 });
  expect(getText().bounds.height).toBeGreaterThan(serifHeight);
  act(() => root.unmount());
});

it('applies an alpha channel from the text background color picker', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );
  act(() =>
    host.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing.text"]')?.click()
  );
  const backgroundGroup = host.querySelector<HTMLElement>(
    '[data-ui="content.toolbar.drawing-options.text.background-group"]'
  )!;
  act(() => backgroundGroup.querySelector<HTMLButtonElement>('button[title="#ef4444"]')?.click());
  act(() =>
    backgroundGroup
      .querySelector<HTMLButtonElement>('[data-ui="shared.ui.color-selector.picker-trigger"]')
      ?.click()
  );
  const alpha = document.querySelector<HTMLInputElement>(
    'input[aria-label="shared.ui.colorSelectorAlpha"]'
  )!;
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    alpha.focus();
    valueSetter?.call(alpha, '40');
    alpha.dispatchEvent(new Event('input', { bubbles: true }));
    alpha.dispatchEvent(new Event('change', { bubbles: true }));
    alpha.blur();
  });
  act(() =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'shared.ui.colorSelectorApply')
      ?.click()
  );

  expect(session.getSnapshot().defaults.text.backgroundColor).toBe('#ef444466');
  act(() => root.unmount());
});
