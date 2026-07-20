// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/content-toolbar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/content-toolbar')>()),
  ContentToolbarButton: (props: {
    children?: ReactNode;
    ariaLabel?: string;
    dataUi: string;
    onClick?: () => void;
    title?: string;
  }) => (
    <button
      type="button"
      aria-label={props.ariaLabel}
      data-ui={props.dataUi}
      title={props.title}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  ),
}));

vi.mock('./project-menu', () => ({
  ToolbarScenarioProjectMenu: () => <div data-ui="test.scenario-project-menu" />,
}));

vi.mock('./mode-menu', () => ({
  ToolbarScenarioModeMenu: () => <div data-ui="test.scenario-mode-menu" />,
}));

import { ToolbarScenarioControls } from './controls';
import type { ToolbarProps } from '../types';
import type { ToolbarMenuState } from '../state/menu';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createScenarioProps(): NonNullable<ToolbarProps['scenario']> {
  return {
    byClickDisabled: false,
    captureMode: 'manual',
    enabled: true,
    onCaptureActionSelected: vi.fn(),
    onCreateProject: vi.fn(),
    onFinishScenario: vi.fn(),
    onOpenEditor: vi.fn(),
    onProjectSelect: vi.fn(),
    onRememberProjectSelectionChange: vi.fn(),
    onSetCaptureMode: vi.fn(),
    onToggleSidebar: vi.fn(),
    pendingProjectSelection: false,
    projectId: 'project-1',
    projectName: 'Scenario',
    projects: [],
    rememberProjectSelection: true,
    sidebarVisible: true,
  };
}

function createClosedToolbarMenuState(): ToolbarMenuState {
  return {
    activeMenuType: null,
    showCaptureMenu: false,
    showTimerMenu: false,
    viewportMenuOpen: false,
    closeMenu: vi.fn(),
    closeMenus: vi.fn(),
    setActiveMenuType: vi.fn(),
    setShowCaptureMenu: vi.fn(),
    setShowTimerMenu: vi.fn(),
    setViewportMenuOpen: vi.fn(),
    toggleMenu: vi.fn(),
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

it('renders scenario menus and wires sidebar, finish, and open-editor actions', () => {
  const scenario = createScenarioProps();
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <ToolbarScenarioControls
        scenario={scenario}
        toolbarMenuState={createClosedToolbarMenuState()}
      />
    );
  });

  expect(container?.querySelector('[data-ui="test.scenario-project-menu"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="test.scenario-mode-menu"]')).not.toBeNull();

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.scenario-sidebar-button"]')
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.scenario-finish-button"]')
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.scenario-open-editor-button"]')
      ?.click();
  });

  expect(scenario.onToggleSidebar).toHaveBeenCalledTimes(1);
  expect(scenario.onFinishScenario).toHaveBeenCalledTimes(1);
  expect(scenario.onOpenEditor).toHaveBeenCalledWith();
});
