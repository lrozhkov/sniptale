// @vitest-environment jsdom

import { act } from 'react';
import type { ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CompactWorkspacePopoverContent } from './view-controls-popovers';

const mocks = vi.hoisted(() => ({
  buildGridCompactCommands: vi.fn(
    (params: {
      updateWorkspace: (value: unknown) => void;
      workspace: { gridEnabled: boolean; gridSnapEnabled: boolean };
    }) => [
      {
        id: 'grid-toggle',
        title: 'Show grid',
        active: params.workspace.gridEnabled,
        onClick: () => params.updateWorkspace({ gridEnabled: !params.workspace.gridEnabled }),
      },
      {
        id: 'grid-snap-toggle',
        title: 'Enable snapping',
        active: params.workspace.gridSnapEnabled,
        onClick: () =>
          params.updateWorkspace({ gridSnapEnabled: !params.workspace.gridSnapEnabled }),
      },
    ]
  ),
}));

vi.mock('../../inspector/compact/inspector/workspace-sections', () => ({
  buildGridCompactCommands: mocks.buildGridCompactCommands,
}));
vi.mock('../../inspector/workspace-color/compact-workspace-content', () => ({
  CompactWorkspaceColorPanel: ({
    params,
  }: {
    params: {
      workspace: { backgroundColor: string };
      workspaceDefaultSavePending: boolean;
      workspaceColorError: string | null;
      workspaceColorMatchesDefault: boolean;
      saveWorkspaceColorAsDefault: () => void;
    };
  }) => (
    <div>
      <span>{params.workspace.backgroundColor}</span>
      <span>{params.workspaceColorError}</span>
      <span>{params.workspaceColorMatchesDefault ? 'Current default' : 'Changed default'}</span>
      <button
        disabled={params.workspaceDefaultSavePending}
        onClick={params.saveWorkspaceColorAsDefault}
      >
        Save default
      </button>
    </div>
  ),
}));

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

it.each([false, true])(
  'hides snap without resetting saved state (%s) and passes save state through',
  (savedSnap) => {
    const updateWorkspace = vi.fn();
    const saveWorkspaceColorAsDefault = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const render = (gridEnabled: boolean) =>
      act(() =>
        root?.render(
          <CompactWorkspacePopoverContent
            documentController={
              {
                updateWorkspace,
                saveWorkspaceColorAsDefault,
                workspace: { backgroundColor: '#f2f4f7', gridEnabled, gridSnapEnabled: savedSnap },
                workspaceDefaultSavePending: true,
                workspaceColorError: 'Could not save',
                workspaceColorMatchesDefault: false,
              } as unknown as ComponentProps<
                typeof CompactWorkspacePopoverContent
              >['documentController']
            }
          />
        )
      );

    render(false);
    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(container.querySelector('h2 button')).toBeNull();
    expect(container.textContent).toContain('#f2f4f7');
    expect(container.textContent).toContain('Could not save');
    expect(
      container.querySelector('[data-ui="editor.workspace.selection-visibility"]')
    ).not.toBeNull();
    expect(
      Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Save default'
      )?.disabled
    ).toBe(true);
    const workspaceSurface = container.querySelector('.editor-inspector-surface');
    expect(workspaceSurface?.className).toContain('overflow-y-auto');
    expect(workspaceSurface?.className).toContain('pb-3');
    expect(workspaceSurface?.className).toContain('max-h-[calc(100dvh-6.5rem)]');
    expect(workspaceSurface?.className).toContain('max-[720px]:max-h-[calc(100dvh-10.5rem)]');
    expect(container.querySelector('[aria-label="Enable snapping"]')).toBeNull();
    act(() => container?.querySelector<HTMLButtonElement>('[aria-label="Show grid"]')?.click());
    expect(updateWorkspace).toHaveBeenCalledExactlyOnceWith({ gridEnabled: true });
    render(true);
    const snap = container.querySelector<HTMLButtonElement>('[aria-label="Enable snapping"]')!;
    expect(snap.getAttribute('aria-pressed')).toBe(String(savedSnap));
    act(() => snap.click());
    expect(updateWorkspace).toHaveBeenLastCalledWith({ gridSnapEnabled: !savedSnap });
    render(false);
    expect(container.querySelector('[aria-label="Enable snapping"]')).toBeNull();
    render(true);
    expect(
      container.querySelector('[aria-label="Enable snapping"]')?.getAttribute('aria-pressed')
    ).toBe(String(savedSnap));
    expect(saveWorkspaceColorAsDefault).not.toHaveBeenCalled();
    expect(container.textContent).toContain('#f2f4f7');
  }
);
