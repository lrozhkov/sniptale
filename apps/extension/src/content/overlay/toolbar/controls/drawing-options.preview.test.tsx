// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createDrawingSession, DEFAULT_DRAWING_COLORS } from '../../../../features/drawing/public';
import type { DrawingDocumentCommit } from '../../../../features/drawing/session';
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

it('previews a selected shape color in the picker and commits only on Apply', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const onDocumentCommit = vi.fn<(commit: DrawingDocumentCommit) => boolean>(() => true);
  const session = createDrawingSession({ onDocumentCommit });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  session.commitObject({
    bounds: { x: 0, y: 0, width: 40, height: 30 },
    color: '#ef4444',
    id: 'selected-shape',
    kind: 'rectangle',
    width: 4,
  });
  session.setActiveTool('select');
  onDocumentCommit.mockClear();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );
  const button = (label: string) =>
    Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (item) => item.getAttribute('aria-label') === label || item.textContent?.includes(label)
    );
  const editColor = async (color: string) => {
    const input = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="shared.ui.colorSelectorHex"]'
    );
    expect(input).not.toBeNull();
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    await act(async () => {
      input?.focus();
      descriptor?.set?.call(input, color);
      input?.dispatchEvent(new Event('input', { bubbles: true }));
      input?.dispatchEvent(new Event('change', { bubbles: true }));
      input?.blur();
    });
  };

  await act(async () => button('shared.ui.colorSelectorChooseColor')?.click());
  await editColor('#12345680');
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ color: '#12345680' });
  expect(onDocumentCommit).not.toHaveBeenCalled();
  await act(async () => button('shared.ui.colorSelectorCancel')?.click());
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ color: '#ef4444' });
  expect(onDocumentCommit).not.toHaveBeenCalled();

  await act(async () => button('shared.ui.colorSelectorChooseColor')?.click());
  await editColor('#65432100');
  await act(async () => button('shared.ui.colorSelectorApply')?.click());
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ color: '#65432100' });
  expect(onDocumentCommit).toHaveBeenCalledOnce();
  expect(onDocumentCommit.mock.calls[0]?.[0].before.objects[0]).toMatchObject({
    color: '#ef4444',
  });
  expect(onDocumentCommit.mock.calls[0]?.[0].after.objects[0]).toMatchObject({
    color: '#65432100',
  });
  onDocumentCommit.mock.calls[0]?.[0].replay(onDocumentCommit.mock.calls[0]?.[0].before);
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ color: '#ef4444' });
  onDocumentCommit.mock.calls[0]?.[0].replay(onDocumentCommit.mock.calls[0]?.[0].after);
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ color: '#65432100' });
  await act(async () => root.unmount());
});
