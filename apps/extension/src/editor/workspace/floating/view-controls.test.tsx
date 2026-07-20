// @vitest-environment jsdom

import { act } from 'react';
import type { ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompactCommandField, type CompactCommand } from '../../inspector/compact';
import { EditorFloatingViewControls } from './view-controls';

const mocks = vi.hoisted(() => ({
  gridCommands: vi.fn<() => CompactCommand[]>(() => [
    { id: 'grid-toggle', title: 'Grid', trigger: 'G', onClick: vi.fn() },
  ]),
  onApply: vi.fn(async () => undefined),
  saveWorkspaceColorAsDefault: vi.fn(),
  updateWorkspace: vi.fn(),
  viewportPreview: vi.fn(() => <div data-ui="mock.viewport-preview" />),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomToFit: vi.fn(),
  resetZoom: vi.fn(),
  embed: { mode: 'scenario' as 'scenario' | 'standalone', onApply: vi.fn(async () => undefined) },
  store: { magnetEnabled: false },
}));

vi.mock('../../application/controller-context', () => ({
  EditorControllerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useEditorController: () => ({
    resetZoom: mocks.resetZoom,
    zoomIn: mocks.zoomIn,
    zoomOut: mocks.zoomOut,
    zoomToFit: mocks.zoomToFit,
  }),
  useOptionalEditorController: () => null,
}));
vi.mock('../../application/embed-context/context', () => ({
  EditorEmbedProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useEditorEmbedContext: () => mocks.embed,
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: (
    selector: (state: { updateWorkspace: unknown; workspace: unknown }) => unknown
  ) =>
    selector({
      updateWorkspace: mocks.updateWorkspace,
      workspace: { magnetEnabled: mocks.store.magnetEnabled },
    }),
}));
vi.mock('../../inspector/compact/inspector/workspace-sections', () => ({
  buildGridCompactCommands: mocks.gridCommands,
  buildMetaCompactCommands: vi.fn(() => []),
  buildSelectionActionCommands: vi.fn(() => []),
  buildWorkspaceCompactCommands: vi.fn(() => []),
}));
vi.mock('../viewport-preview', () => ({ EditorViewportPreview: mocks.viewportPreview }));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderControls(
  hasImage = true,
  overrides: Partial<ComponentProps<typeof EditorFloatingViewControls>> = {}
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <EditorFloatingViewControls
        {...({
          documentController: {
            applyWorkspaceColor: vi.fn(),
            gridColorPalette: ['#94a3b8'],
            recentColors: [],
            saveWorkspaceColorAsDefault: mocks.saveWorkspaceColorAsDefault,
            updateWorkspace: mocks.updateWorkspace,
            workspace: {
              backgroundColor: '#f2f4f7',
              gridColor: '#94a3b8',
              gridEnabled: false,
              gridSize: 24,
              gridSnapEnabled: false,
              magnetEnabled: false,
            },
            workspaceBackgroundPalette: ['#f2f4f7', '#111827'],
            workspaceColorError: null,
            workspaceColorMatchesDefault: true,
            workspaceDefaultSavePending: false,
          },
          gridEnabled: false,
          hasImage,
          history: { canRedo: false, canUndo: false },
          inspectorMeta: { subtitle: '', title: '' },
          onBeforeSelectionAwareAction: vi.fn(),
          zoomPercent: 125,
        } as any)}
        {...overrides}
      />
    );
  });
}

function click(dataUi: string) {
  const button = container?.querySelector<HTMLButtonElement>(`[data-ui="${dataUi}"]`);
  expect(button).not.toBeNull();
  act(() => button?.click());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.embed.mode = 'scenario';
  mocks.embed.onApply = mocks.onApply;
  mocks.store.magnetEnabled = false;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('opens compact workspace and map popovers below the top-right toolbar', () => {
  renderControls();

  click('editor.floating.view-controls.workspace');
  expect(
    container?.querySelector('[data-ui="editor.floating.view-controls.stack"]')?.className
  ).toContain('z-50');
  expect(
    container?.querySelector('[data-ui="editor.floating.view-controls.popover.workspace"]')
  ).not.toBeNull();
  expect(container?.textContent).toContain('#F2F4F7');

  click('editor.floating.view-controls.map');
  expect(container?.querySelector('[data-ui="mock.viewport-preview"]')).not.toBeNull();
  expect(mocks.viewportPreview).toHaveBeenCalledWith(
    expect.objectContaining({ forceOpen: true, maxWidth: 112, variant: 'embedded' }),
    undefined
  );
});

it('routes direct view toolbar actions through existing controller and store handlers', () => {
  renderControls();

  click('editor.floating.view-controls.magnet');
  click('editor.floating.view-controls.zoom-out');
  click('editor.floating.view-controls.zoom-in');
  click('editor.floating.view-controls.zoom');

  expect(mocks.updateWorkspace).toHaveBeenCalledWith({ magnetEnabled: true });
  expect(mocks.zoomOut).toHaveBeenCalledOnce();
  expect(mocks.zoomIn).toHaveBeenCalledOnce();
  expect(mocks.resetZoom).toHaveBeenCalledOnce();
  expect(
    container?.querySelector('[data-ui="editor.floating.view-controls.popover.zoom"]')
  ).toBeNull();
});

it('uses the zoom percent button as fit-to-window at 100 percent', () => {
  renderControls(true, { zoomPercent: 100 });

  click('editor.floating.view-controls.zoom');

  expect(mocks.zoomToFit).toHaveBeenCalledOnce();
  expect(mocks.resetZoom).not.toHaveBeenCalled();
});

it('disables document-required controls without an image and dismisses transient popovers outside', () => {
  renderControls(false);

  expect(
    container?.querySelector<HTMLButtonElement>(
      '[data-ui="editor.floating.view-controls.workspace"]'
    )?.disabled
  ).toBe(true);
  expect(container?.textContent).not.toContain('applyToScenario');

  act(() => root?.unmount());
  root = null;
  container?.remove();
  renderControls(true);
  click('editor.floating.view-controls.workspace');
  expect(
    container?.querySelector('[data-ui="editor.floating.view-controls.popover.workspace"]')
  ).not.toBeNull();

  act(() => {
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });

  expect(
    container?.querySelector('[data-ui="editor.floating.view-controls.popover.workspace"]')
  ).toBeNull();
});

it('keeps the map popover open on outside clicks until the map button toggles it closed', () => {
  renderControls(true);

  click('editor.floating.view-controls.map');
  expect(
    container?.querySelector('[data-ui="editor.floating.view-controls.popover.map"]')
  ).not.toBeNull();

  act(() => {
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });
  expect(
    container?.querySelector('[data-ui="editor.floating.view-controls.popover.map"]')
  ).not.toBeNull();

  click('editor.floating.view-controls.map');
  expect(
    container?.querySelector('[data-ui="editor.floating.view-controls.popover.map"]')
  ).toBeNull();
});

it('keeps inside clicks open, toggles active popovers closed, and omits scenario action outside embeds', () => {
  mocks.embed.mode = 'standalone';
  mocks.store.magnetEnabled = true;
  mocks.gridCommands.mockReturnValueOnce([
    {
      id: 'grid-size',
      title: 'Grid size',
      trigger: 'G',
      content: (
        <CompactCommandField label="Grid size" value="24px">
          <div data-ui="grid-size-row">Grid size row</div>
        </CompactCommandField>
      ),
    },
  ] satisfies CompactCommand[]);
  renderControls(true);

  expect(container?.textContent).not.toContain('applyToScenario');
  expect(
    container?.querySelector('[data-ui="editor.floating.view-controls.magnet"]')
  ).not.toBeNull();

  click('editor.floating.view-controls.grid');
  const popover = container?.querySelector(
    '[data-ui="editor.floating.view-controls.popover.grid"]'
  );
  expect(popover).not.toBeNull();
  expect(popover?.textContent).toContain('Grid size row');
  expect(popover?.textContent).not.toContain('24px');
  act(() => {
    popover?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });
  expect(
    container?.querySelector('[data-ui="editor.floating.view-controls.popover.grid"]')
  ).not.toBeNull();

  click('editor.floating.view-controls.grid');
  expect(
    container?.querySelector('[data-ui="editor.floating.view-controls.popover.grid"]')
  ).toBeNull();
});

it('does not render the grid popover just because grid mode is enabled', () => {
  renderControls(true, { gridEnabled: true } as Partial<
    ComponentProps<typeof EditorFloatingViewControls>
  >);

  expect(
    container?.querySelector('[data-ui="editor.floating.view-controls.popover.grid"]')
  ).toBeNull();
  expect(
    container
      ?.querySelector('[data-ui="editor.floating.view-controls.grid"]')
      ?.getAttribute('data-active')
  ).toBe('true');
});
