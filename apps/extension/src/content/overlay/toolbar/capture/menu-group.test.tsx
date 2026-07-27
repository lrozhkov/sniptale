// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('./menus', () => ({
  ToolbarCaptureActionMenu: () => <div data-ui="test.capture-action" />,
  ToolbarTimerMenu: () => <div data-ui="test.timer" />,
  ToolbarViewportMenu: () => <div data-ui="test.viewport" />,
}));

vi.mock('../scenario/controls', () => ({
  ToolbarScenarioControls: (props: { showWorkflowActions?: boolean }) => (
    <div
      data-ui="test.scenario-controls"
      data-workflow-actions={props.showWorkflowActions ? 'true' : 'false'}
    />
  ),
}));

import { ToolbarCaptureMenuGroup } from './menu-group';
import type { ToolbarProps } from '../types';
import { useToolbarMenuState } from '../state/menu';
import { useToolbarCaptureMenus } from './use-menus';

let container: HTMLDivElement;
let root: Root;

function createScenario(): NonNullable<ToolbarProps['scenario']> {
  return {
    byClickDisabled: false,
    captureMode: 'manual',
    enabled: true,
    onCaptureActionSelected: vi.fn(),
    onCreateProject: vi.fn(),
    onFinishScenario: vi.fn(),
    onOpenEditor: vi.fn(),
    onProjectSelect: vi.fn(),
    onSetCaptureMode: vi.fn(),
    onToggleSidebar: vi.fn(),
    pendingProjectSelection: false,
    projectId: 'project-1',
    projectName: 'Scenario',
    projects: [],
    sidebarVisible: true,
  };
}

function MenuGroupHarness(props: { scenario?: ToolbarProps['scenario'] }) {
  const toolbarMenuState = useToolbarMenuState();
  const menus = useToolbarCaptureMenus(toolbarMenuState);

  return (
    <ToolbarCaptureMenuGroup
      captureAction={props.scenario ? 'scenario' : 'download_default'}
      compactMenus={false}
      currentViewport={null}
      displayMode="horizontal"
      isLoading={false}
      menus={menus}
      onCaptureActionChange={vi.fn()}
      onClose={vi.fn()}
      onCompactMenusChange={vi.fn()}
      onDisableScreenshotMode={vi.fn()}
      onDisplayModeChange={vi.fn()}
      onPinToTabChange={vi.fn()}
      onSelectCaptureAction={vi.fn()}
      onTakeScreenshot={vi.fn()}
      onTimerDelayChange={vi.fn()}
      onViewportChange={vi.fn()}
      pinToTab={false}
      pinToTabAvailable={true}
      pinToTabLocked={false}
      screenshotMode
      timerDelay={0}
      toolbarMenuState={toolbarMenuState}
      {...(props.scenario ? { scenario: props.scenario } : {})}
    />
  );
}

function renderMenuGroup(scenario?: ToolbarProps['scenario']) {
  act(() => root.render(<MenuGroupHarness {...(scenario ? { scenario } : {})} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
});

it('places persistent scenario controls directly after the after-capture action', () => {
  renderMenuGroup(createScenario());

  const order = Array.from(container.querySelectorAll('[data-ui]')).map((element) =>
    element.getAttribute('data-ui')
  );
  expect(order).toEqual([
    'test.capture-action',
    'test.scenario-controls',
    'test.timer',
    'test.viewport',
  ]);
  expect(
    container
      .querySelector('[data-ui="test.scenario-controls"]')
      ?.getAttribute('data-workflow-actions')
  ).toBe('false');

  renderMenuGroup();
  expect(container.querySelector('[data-ui="test.scenario-controls"]')).toBeNull();
});
