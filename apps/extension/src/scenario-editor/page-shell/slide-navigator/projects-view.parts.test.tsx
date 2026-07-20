// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: {
    isOpen: boolean;
    onCancel: () => void;
    onConfirm: () => void;
  }) =>
    props.isOpen ? (
      <div data-testid="confirm-dialog">
        <button type="button" data-testid="cancel-delete" onClick={props.onCancel} />
        <button type="button" data-testid="confirm-delete" onClick={props.onConfirm} />
      </div>
    ) : null,
}));

import { ScenarioProjectRow } from './projects-view.rows';
import { ScenarioProjectsHeader } from './projects-view.sections';
import type { ScenarioProjectsViewController } from './types';

type RowProps = ComponentProps<typeof ScenarioProjectRow>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createController(): ScenarioProjectsViewController {
  return {
    project: {
      createName: '',
      projectId: 'project-1',
      projects: [],
      setCreateName: vi.fn(),
    },
    projectCrud: {
      createProject: vi.fn(async () => undefined),
      deleteProject: vi.fn(async () => undefined),
      renameProject: vi.fn(async () => undefined),
      selectProject: vi.fn(async () => undefined),
    },
  };
}

function createRowProps(overrides: Partial<RowProps> = {}): RowProps {
  return {
    active: false,
    controller: createController(),
    editingName: '',
    editingProjectId: null,
    onEditingNameChange: vi.fn(),
    onEditingProjectChange: vi.fn(),
    onSelect: vi.fn(),
    project: { id: 'project-1', name: 'Project 1' },
    ...overrides,
  };
}

function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root?.render(node));
}

function renderRow(props: RowProps) {
  renderNode(<ScenarioProjectRow {...props} />);
}

function click(selector: string) {
  const button = container?.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Missing button: ${selector}`);
  act(() => button.click());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders the projects header and routes primary, rename, and delete actions', () => {
  const props = createRowProps({ active: true, dataUi: 'project-row' });
  renderNode(
    <>
      <ScenarioProjectsHeader />
      <ScenarioProjectRow {...props} />
    </>
  );

  expect(container?.textContent).toContain('scenario.editor.projectsTool');
  expect(container?.querySelector('[data-ui="project-row"]')).not.toBeNull();
  click('[data-ui="project-row"]');
  click('[aria-label="scenario.editor.renameProject"]');

  expect(props.onSelect).toHaveBeenCalledOnce();
  expect(props.onEditingProjectChange).toHaveBeenCalledWith('project-1');
  expect(props.onEditingNameChange).toHaveBeenCalledWith('Project 1');

  click('[aria-label="scenario.editor.deleteProject"]');
  click('[data-testid="cancel-delete"]');
  expect(props.controller.projectCrud.deleteProject).not.toHaveBeenCalled();
  click('[aria-label="scenario.editor.deleteProject"]');
  click('[data-testid="confirm-delete"]');
  expect(props.controller.projectCrud.deleteProject).toHaveBeenCalledWith('project-1');
});

it('commits edited names on Enter and skips the following blur commit', () => {
  const props = createRowProps({ editingName: 'Renamed', editingProjectId: 'project-1' });
  renderRow(props);
  const input = container?.querySelector('input');
  if (!(input instanceof HTMLInputElement)) throw new Error('Missing project name input');

  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });

  expect(props.controller.projectCrud.renameProject).toHaveBeenCalledTimes(1);
  expect(props.controller.projectCrud.renameProject).toHaveBeenCalledWith('Renamed');
  expect(props.onEditingProjectChange).toHaveBeenCalledWith(null);
});

it('routes name changes, blur commits, and Escape cancellation independently', () => {
  const props = createRowProps({ editingName: 'Blurred', editingProjectId: 'project-1' });
  renderRow(props);
  const input = container?.querySelector('input');
  if (!(input instanceof HTMLInputElement)) throw new Error('Missing project name input');

  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Draft');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(props.onEditingNameChange).toHaveBeenCalledWith('Draft');
  expect(props.controller.projectCrud.renameProject).toHaveBeenCalledWith('Blurred');

  vi.mocked(props.controller.projectCrud.renameProject).mockClear();
  renderRow({ ...props, editingName: 'Discarded' });
  const escapeInput = container?.querySelector('input');
  if (!(escapeInput instanceof HTMLInputElement)) throw new Error('Missing project name input');
  act(() =>
    escapeInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  );

  expect(props.controller.projectCrud.renameProject).not.toHaveBeenCalled();
  expect(props.onEditingProjectChange).toHaveBeenLastCalledWith(null);
});
