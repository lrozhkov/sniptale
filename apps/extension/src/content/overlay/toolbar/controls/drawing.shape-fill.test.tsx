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

it('uses one Shapes panel for outline, width, and alpha-aware fill controls', async () => {
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

  expect(host.querySelector('[data-ui="content.toolbar.drawing.rectangle"]')).toBeNull();
  expect(host.querySelector('[data-ui="content.toolbar.drawing.ellipse"]')).toBeNull();
  const shape = host.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing.shape"]');
  act(() => shape?.click());
  const panel = host.querySelector<HTMLElement>(
    '[data-ui="content.toolbar.drawing-options.shape"]'
  );
  expect(panel?.classList).toContain('flex');
  expect(
    panel?.querySelectorAll('[data-ui^="content.toolbar.drawing-options.shape.kind-"]')
  ).toHaveLength(3);
  expect(
    panel
      ?.querySelector('[data-ui="content.toolbar.drawing-options.shape.fill-toggle"]')
      ?.getAttribute('aria-pressed')
  ).toBe('false');
  expect(
    panel?.querySelector('[data-ui="content.toolbar.drawing-options.shape.fill-empty-icon"]')
  ).not.toBeNull();
  expect(
    panel?.querySelector('[data-ui="content.toolbar.drawing-options.shape.fill-empty-icon"] path')
  ).not.toBeNull();
  expect(
    panel
      ?.querySelector('[data-ui="content.toolbar.drawing-options.shape.fill-toggle"]')
      ?.classList.contains('!border-transparent')
  ).toBe(true);
  expect(
    panel?.querySelector('[data-ui="content.toolbar.drawing-options.shape.fill-colors"]')
  ).toBeNull();
  expect(
    panel?.querySelectorAll(
      '[data-ui="content.toolbar.drawing-options.shape.fill-colors"] [aria-pressed="true"]'
    )
  ).toHaveLength(0);
  expect(panel?.querySelectorAll('[data-ui="shared.ui.color-selector"]')).toHaveLength(1);

  const triangle = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.shape.kind-triangle"]'
  );
  const width8 = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.shape.width-8"]'
  );
  const shapePreviewSizes = [2, 4, 8].map(
    (value) =>
      panel?.querySelector<HTMLElement>(
        `[data-ui="content.toolbar.drawing-options.shape.width-${value}"] [data-ui="drawing-width-preview"]`
      )?.style.height
  );
  expect(shapePreviewSizes).toEqual(['2px', '6px', '10px']);
  const blue = host.querySelector<HTMLButtonElement>('button[title="#60a5fa"]');
  act(() => triangle?.click());
  act(() => width8?.click());
  act(() => blue?.click());
  expect(session.getSnapshot().defaults.shape).toEqual({
    color: '#60a5fa',
    fillColor: null,
    kind: 'triangle',
    width: 8,
  });
  const fillToggle = panel?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.shape.fill-toggle"]'
  );
  act(() => fillToggle?.click());
  expect(session.getSnapshot().defaults.shape.fillColor).toBe(DEFAULT_DRAWING_COLORS[0]);
  expect(fillToggle?.getAttribute('aria-pressed')).toBe('true');
  expect(fillToggle?.classList.contains('sniptale-glass-toolbar-button--active')).toBe(true);
  expect(fillToggle?.classList.contains('!border-transparent')).toBe(false);
  expect(
    panel?.querySelector('[data-ui="content.toolbar.drawing-options.shape.fill-empty-icon"]')
  ).toBeNull();
  expect(
    panel?.querySelector('[data-ui="content.toolbar.drawing-options.shape.fill-colors"]')
  ).not.toBeNull();
  expect(
    panel?.querySelector('[data-ui="content.toolbar.drawing-options.shape.fill-colors"] > svg')
  ).toBeNull();
  expect(panel?.querySelectorAll('[data-ui="shared.ui.color-selector"]')).toHaveLength(2);
  const fillBlue = panel?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.shape.fill-colors"] button[title="#60a5fa"]'
  );
  act(() => fillBlue?.click());
  expect(session.getSnapshot().defaults.shape.fillColor).toBe('#60a5fa');
  act(() => fillToggle?.click());
  expect(session.getSnapshot().defaults.shape.fillColor).toBeNull();
  expect(
    panel?.querySelector('[data-ui="content.toolbar.drawing-options.shape.fill-colors"]')
  ).toBeNull();
  act(() => fillToggle?.click());
  expect(session.getSnapshot().defaults.shape.fillColor).toBe('#60a5fa');
  const fillPickerTrigger = panel?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.shape.fill"] ' +
      '[data-ui="shared.ui.color-selector.picker-trigger"]'
  );
  await act(async () => fillPickerTrigger?.click());
  expect(
    document.body.querySelector('input[aria-label="shared.ui.colorSelectorAlpha"]')
  ).not.toBeNull();
  await act(async () => fillToggle?.click());
  expect(session.getSnapshot().defaults.shape.fillColor).toBeNull();
  expect(
    document.body.querySelector('input[aria-label="shared.ui.colorSelectorAlpha"]')
  ).toBeNull();
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.shape"]')).not.toBeNull();
  act(() => root.unmount());
});
