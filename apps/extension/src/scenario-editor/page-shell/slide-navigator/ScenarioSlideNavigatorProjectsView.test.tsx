// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ScenarioProjectsViewController } from './types';

const { confirmDialogPropsSpy } = vi.hoisted(() => ({
  confirmDialogPropsSpy: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: unknown) => {
    confirmDialogPropsSpy(props);
    return <div data-testid="confirm-dialog" />;
  },
}));

vi.mock('@sniptale/ui/searchable-project-picker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/searchable-project-picker')>()),
  SearchableProjectPicker: (props: {
    onCreateProject: () => Promise<void>;
    onSearchQueryChange: (name: string) => void;
    onSelectProject: (projectId: string) => Promise<void>;
    projects: Array<{ id: string; name: string }>;
    searchQuery: string;
    renderProjectRow: (args: {
      active: boolean;
      dataUi?: string;
      onSelect: () => void;
      project: { id: string; name: string };
    }) => React.ReactNode;
  }) => (
    <div>
      <input
        aria-label="create-project"
        value={props.searchQuery}
        onInput={(event) =>
          props.onSearchQueryChange((event.currentTarget as HTMLInputElement).value)
        }
      />
      <button type="button" onClick={() => void props.onCreateProject()}>
        create
      </button>
      {props.projects.map((project) =>
        props.renderProjectRow({
          active: false,
          ...(project.id === 'project-2' ? {} : { dataUi: `project-${project.id}` }),
          onSelect: () => void props.onSelectProject(project.id),
          project,
        })
      )}
    </div>
  ),
}));

import { ScenarioSlideNavigatorProjectsView } from './ScenarioSlideNavigatorProjectsView';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createController(
  overrides: Partial<Parameters<typeof ScenarioSlideNavigatorProjectsView>[0]['controller']> = {}
) {
  return {
    project: {
      createName: '',
      projectId: 'project-1',
      projects: [
        { createdAt: 10, id: 'project-1', name: 'Project 1', updatedAt: 20 },
        { createdAt: 15, id: 'project-2', name: 'Project 2', updatedAt: 25 },
      ],
      setCreateName: vi.fn(),
    },
    projectCrud: {
      createProject: vi.fn(async () => undefined),
      deleteProject: vi.fn(async () => undefined),
      renameProject: vi.fn(async () => undefined),
      selectProject: vi.fn(async () => undefined),
    },
    ...overrides,
  } satisfies ScenarioProjectsViewController;
}

function renderView(
  overrides: Partial<Parameters<typeof ScenarioSlideNavigatorProjectsView>[0]['controller']> = {}
) {
  const controller = createController(overrides);
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ScenarioSlideNavigatorProjectsView controller={controller} />);
  });

  return controller;
}

function getOpenConfirmDialogProps() {
  return confirmDialogPropsSpy.mock.calls
    .map(([props]) => props as { isOpen?: boolean; onCancel?: () => void; onConfirm?: () => void })
    .find((props) => props.isOpen);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  confirmDialogPropsSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('wires create and select actions from the scenarios picker view', () => {
  const controller = renderView();

  act(() => {
    const input = container?.querySelector<HTMLInputElement>('[aria-label="create-project"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      'New Project'
    );
    input?.dispatchEvent(new Event('input', { bubbles: true }));
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent === 'create')
      ?.click();
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent?.includes('Project 1'))
      ?.click();
  });

  expect(controller.project.setCreateName).toHaveBeenCalledWith('New Project');
  expect(controller.projectCrud.createProject).toHaveBeenCalledTimes(1);
  expect(controller.projectCrud.selectProject).toHaveBeenCalledWith('project-1');
});

it('keeps row rendering stable when the picker omits an optional data-ui id', () => {
  renderView();

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const projectOneButton = buttons.find((button) => button.textContent?.includes('Project 1'));
  const projectTwoButton = buttons.find((button) => button.textContent?.includes('Project 2'));

  expect(projectOneButton?.getAttribute('data-ui')).toBe('project-project-1');
  expect(projectTwoButton?.hasAttribute('data-ui')).toBe(false);
});

it('renames and deletes projects through row actions', () => {
  const controller = renderView();

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.renameProject"]')
      ?.click();
  });

  const renameInput = container?.querySelector<HTMLInputElement>('input.w-full');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      renameInput,
      'Renamed project'
    );
    renameInput?.dispatchEvent(new Event('input', { bubbles: true }));
    renameInput?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.deleteProject"]')
      ?.click();
  });

  const confirmDialog = getOpenConfirmDialogProps();
  act(() => {
    confirmDialog?.onConfirm?.();
  });

  expect(controller.projectCrud.renameProject).toHaveBeenCalledWith('Renamed project');
  expect(controller.projectCrud.deleteProject).toHaveBeenCalledWith('project-1');
});

it('cancels rename editing on Escape without persisting a new name', () => {
  const controller = renderView();

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.renameProject"]')
      ?.click();
  });

  const renameInput = container?.querySelector<HTMLInputElement>('input.w-full');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      renameInput,
      'Discarded name'
    );
    renameInput?.dispatchEvent(new Event('input', { bubbles: true }));
    renameInput?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  expect(controller.projectCrud.renameProject).not.toHaveBeenCalled();
});

it('commits rename editing on blur when the input stays active', () => {
  const controller = renderView();

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.renameProject"]')
      ?.click();
  });

  const renameInput = container?.querySelector<HTMLInputElement>('input.w-full');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      renameInput,
      'Blurred name'
    );
    renameInput?.dispatchEvent(new Event('input', { bubbles: true }));
    renameInput?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });

  expect(controller.projectCrud.renameProject).toHaveBeenCalledWith('Blurred name');
});

it('skips deletion when the confirmation dialog is declined', () => {
  const controller = renderView();

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.deleteProject"]')
      ?.click();
  });

  const confirmDialog = getOpenConfirmDialogProps();
  act(() => {
    confirmDialog?.onCancel?.();
  });

  expect(controller.projectCrud.deleteProject).not.toHaveBeenCalled();
});
