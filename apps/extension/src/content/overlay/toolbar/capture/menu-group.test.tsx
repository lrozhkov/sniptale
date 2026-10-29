// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('./menus', () => ({
  ToolbarCaptureActionMenu: () => <div data-ui="test.capture-action" />,
  ToolbarTimerMenu: () => <div data-ui="test.timer" />,
  ToolbarViewportMenu: () => <div data-ui="test.viewport" />,
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
      captureAction="copy"
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

it('keeps scenario project and capture-mode controls off the main toolbar', () => {
  renderMenuGroup(createScenario());

  const order = Array.from(container.querySelectorAll('[data-ui]')).map((element) =>
    element.getAttribute('data-ui')
  );
  expect(order).toEqual([
    'test.capture-action',
    'test.timer',
    'test.viewport',
    'content.quick-actions',
    'content.quick-actions.trigger',
    'content.toolbar.scenario-panel-button',
  ]);

  renderMenuGroup();
  expect(container.querySelector('[data-ui="test.capture-action"]')).not.toBeNull();
});

it('toggles the independent panel once while activation is pending and permits retry', async () => {
  let settle!: (accepted: boolean) => void;
  const scenario = createScenario();
  scenario.enabled = false;
  scenario.sidebarVisible = false;
  const toggle = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        settle = resolve;
      })
  );
  scenario.onToggleSidebar = toggle;
  renderMenuGroup(scenario);
  const button = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.scenario-panel-button"]'
  )!;
  expect(button.getAttribute('aria-pressed')).toBe('false');
  act(() => {
    button.click();
    button.click();
  });
  expect(toggle).toHaveBeenCalledOnce();
  expect(button.disabled).toBe(true);
  await act(async () => settle(false));
  expect(button.disabled).toBe(false);
  expect(button.getAttribute('aria-pressed')).toBe('false');
  act(() => button.click());
  expect(toggle).toHaveBeenCalledTimes(2);
  await act(async () => settle(true));
  scenario.enabled = true;
  scenario.sidebarVisible = true;
  renderMenuGroup(scenario);
  expect(button.getAttribute('aria-pressed')).toBe('true');
});
