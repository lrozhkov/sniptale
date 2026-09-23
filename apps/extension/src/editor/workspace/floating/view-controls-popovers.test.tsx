// @vitest-environment jsdom

import { act } from 'react';
import type { ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CompactWorkspacePopoverContent } from './view-controls-popovers';

const mocks = vi.hoisted(() => ({
  buildGridCompactCommands: vi.fn((params: { updateWorkspace: (value: unknown) => void }) => [
    {
      id: 'grid-toggle',
      title: 'Show grid',
      active: false,
      onClick: () => params.updateWorkspace({ gridEnabled: true }),
    },
    {
      id: 'grid-snap-toggle',
      title: 'Enable snapping',
      active: false,
      onClick: () => params.updateWorkspace({ gridSnapEnabled: true }),
    },
  ]),
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

it('groups appearance and independent grid controls while passing workspace save state through', () => {
  const updateWorkspace = vi.fn();
  const saveWorkspaceColorAsDefault = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() =>
    root?.render(
      <CompactWorkspacePopoverContent
        documentController={
          {
            updateWorkspace,
            saveWorkspaceColorAsDefault,
            workspace: { backgroundColor: '#f2f4f7' },
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

  expect(container.querySelectorAll('section')).toHaveLength(2);
  expect(container.textContent).toContain('#f2f4f7');
  expect(container.textContent).toContain('Could not save');
  expect(container.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
  expect(container.querySelector('[class*="overflow-y-auto"]')).not.toBeNull();
  act(() => {
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.getAttribute('aria-label') === 'Show grid')
      ?.click();
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.getAttribute('aria-label') === 'Enable snapping')
      ?.click();
  });
  expect(updateWorkspace).toHaveBeenCalledWith({ gridEnabled: true });
  expect(updateWorkspace).toHaveBeenCalledWith({ gridSnapEnabled: true });
  expect(saveWorkspaceColorAsDefault).not.toHaveBeenCalled();
});
