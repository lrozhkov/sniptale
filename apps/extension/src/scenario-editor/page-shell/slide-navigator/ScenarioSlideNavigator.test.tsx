// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createScenarioNoteStep,
  createScenarioProject,
} from '../../../features/scenario/project/public';
import type { ScenarioSlideNavigatorController } from './types';

const { confirmDialogPropsSpy } = vi.hoisted(() => ({
  confirmDialogPropsSpy: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/public')
  >()),
  getScenarioAssetBlob: vi.fn(async () => null),
}));

vi.mock('@sniptale/ui/inspector-shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/inspector-shell')>()),
  InspectorShellFrame: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  InspectorShellPanel: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: unknown) => {
    confirmDialogPropsSpy(props);
    return <div data-testid="confirm-dialog" />;
  },
}));

vi.mock('./ScenarioSlideNavigatorProjectsView', () => ({
  ScenarioSlideNavigatorProjectsView: () => <div data-testid="projects-view">projects-view</div>,
}));

vi.mock('./ScenarioSlideNavigatorAiEditorView', () => ({
  ScenarioSlideNavigatorAiEditorView: () => <div data-testid="ai-view">ai-view</div>,
}));

import { ScenarioSlideNavigator } from './ScenarioSlideNavigator';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function flushNavigatorEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function createNavigatorProject() {
  const activeStep = createScenarioNoteStep({ title: 'Active step', body: 'Body' });
  const trashedStep = createScenarioNoteStep({ title: 'Trashed step', body: 'Trash body' });
  return {
    ...createScenarioProject('Scenario'),
    steps: [activeStep],
    trash: [{ deletedAt: 30, originalIndex: 1, step: trashedStep }],
  };
}

function createController(): ScenarioSlideNavigatorController {
  const project = createNavigatorProject();
  return {
    ai: {
      activeAttachmentDisclosure: null,
      attachmentMode: 'none',
      availableModels: [],
      error: null,
      instruction: '',
      lastRunSummary: null,
      loading: false,
      providers: [],
      selectedModelId: null,
      setActiveAttachmentDisclosure: vi.fn(),
      setAttachmentMode: vi.fn(),
      setInstruction: vi.fn(),
      setSelectedModelId: vi.fn(),
      submitRequest: vi.fn(),
    },
    project: {
      createName: '',
      project,
      projectId: project.id,
      projects: [],
      selectedStepId: null,
      setCreateName: vi.fn(),
      setQuickEditStepId: vi.fn(),
      setSelectedStepId: vi.fn(),
    },
    projectCrud: {
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      renameProject: vi.fn(),
      selectProject: vi.fn(),
    },
    stepActions: {
      clearTrash: vi.fn(),
      deleteStep: vi.fn(),
      moveStepToPosition: vi.fn(),
      restoreStep: vi.fn(),
    },
    ui: {
      inspectedStepId: null,
      leftPanelMode: 'navigator' as const,
      navigatorCollapsed: false,
      setInspectedStepId: vi.fn(),
      setNavigatorCollapsed: vi.fn(),
    },
  };
}

function createControllerWithOverrides(
  overrides: Partial<Parameters<typeof ScenarioSlideNavigator>[0]['controller']> = {}
) {
  return {
    ...createController(),
    ...overrides,
  };
}

async function renderNavigator(
  overrides: Partial<Parameters<typeof ScenarioSlideNavigator>[0]['controller']> = {}
) {
  const controller = createControllerWithOverrides(overrides);
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ScenarioSlideNavigator controller={controller} />);
  });
  await flushNavigatorEffects();

  return controller;
}

function getOpenConfirmDialogProps() {
  return confirmDialogPropsSpy.mock.calls
    .map(([props]) => props as { isOpen?: boolean; onConfirm?: () => void })
    .find((props) => props.isOpen);
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  confirmDialogPropsSpy.mockReset();
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

async function verifiesCollapsedNavigatorBranch() {
  await renderNavigator({
    ui: {
      inspectedStepId: null,
      leftPanelMode: 'navigator',
      navigatorCollapsed: true,
      setInspectedStepId: vi.fn(),
      setNavigatorCollapsed: vi.fn(),
    },
  });
  expect(container?.textContent).toContain('scenario.editor.navigator');
  expect(
    container?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.expandNavigator"]')
  ).toBeNull();
}

async function verifiesProjectsPanelBranch() {
  await renderNavigator({
    ui: {
      inspectedStepId: null,
      leftPanelMode: 'projects',
      navigatorCollapsed: false,
      setInspectedStepId: vi.fn(),
      setNavigatorCollapsed: vi.fn(),
    },
  });
  expect(container?.textContent).toContain('projects-view');
}

async function verifiesAiPanelBranch() {
  await renderNavigator({
    ui: {
      inspectedStepId: null,
      leftPanelMode: 'ai-editor',
      navigatorCollapsed: false,
      setInspectedStepId: vi.fn(),
      setNavigatorCollapsed: vi.fn(),
    },
  });
  expect(container?.textContent).toContain('ai-view');
}

async function verifiesNavigatorRowsAndTrash() {
  const project = createNavigatorProject();
  const controller = await renderNavigator({
    project: {
      ...createController().project,
      project,
      selectedStepId: project.steps[0]?.id ?? null,
    },
  });

  expect(container?.textContent).toContain('Active step');
  expect(container?.textContent).toContain('scenario.editor.trash');
  expect(
    container?.querySelector('[data-ui="scenario.editor.navigator.step"][data-selected="true"]')
  ).not.toBeNull();

  await act(async () => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent?.includes('scenario.editor.trash'))
      ?.click();
  });

  expect(container?.textContent).toContain('Trashed step');
  expect(container?.textContent).toContain('scenario.editor.clearTrash');

  await act(async () => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.restoreStep"]')
      ?.click();
  });

  expect(controller.stepActions.restoreStep).toHaveBeenCalledTimes(1);

  await act(async () => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.clearTrash"]')
      ?.click();
  });
  const confirmDialog = getOpenConfirmDialogProps();

  act(() => {
    confirmDialog?.onConfirm?.();
  });

  expect(controller.stepActions.clearTrash).toHaveBeenCalledTimes(1);
}

async function verifiesNavigatorEmptyState() {
  await renderNavigator({
    project: {
      ...createController().project,
      project: null,
    },
  });

  expect(container?.textContent).toContain('scenario.editor.empty');
}

function runScenarioSlideNavigatorSuite() {
  it(
    'expands the collapsed navigator branch through the grouped controller',
    verifiesCollapsedNavigatorBranch
  );
  it(
    'renders the projects panel branch through the grouped controller',
    verifiesProjectsPanelBranch
  );
  it('renders the ai-editor panel branch through the grouped controller', verifiesAiPanelBranch);
  it(
    'renders navigator rows, toggles trash, and restores deleted steps',
    verifiesNavigatorRowsAndTrash
  );
  it('renders the empty state when no project is selected', verifiesNavigatorEmptyState);
}

describe('ScenarioSlideNavigator', runScenarioSlideNavigatorSuite);
