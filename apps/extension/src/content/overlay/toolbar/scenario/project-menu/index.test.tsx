// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToolbarScenarioProjectMenu } from '.';
import { useToolbarMenuState } from '../../state/menu';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../selection/interactive-frame/layout/portal', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../selection/interactive-frame/layout/portal')>();

  return {
    ...actual,
    resolveContentPortalTarget: () => document.body,
  };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function ToolbarScenarioProjectMenuHarness(
  props: Omit<Parameters<typeof ToolbarScenarioProjectMenu>[0], 'toolbarMenuState'>
) {
  const toolbarMenuState = useToolbarMenuState();

  return <ToolbarScenarioProjectMenu {...props} toolbarMenuState={toolbarMenuState} />;
}

function renderMenu() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const onProjectSelect = vi.fn(async () => undefined);

  act(() => {
    root?.render(
      <ToolbarScenarioProjectMenuHarness
        displayMode="horizontal"
        scenario={{
          byClickDisabled: false,
          captureMode: 'manual',
          enabled: true,
          onCaptureActionSelected: vi.fn(),
          onCreateProject: vi.fn(async () => undefined),
          onFinishScenario: vi.fn(async () => undefined),
          onOpenEditor: vi.fn(),
          onProjectSelect,
          onRememberProjectSelectionChange: vi.fn(async () => undefined),
          onSetCaptureMode: vi.fn(),
          onToggleSidebar: vi.fn(),
          pendingProjectSelection: false,
          projectId: 'project-2',
          projectName: 'Current scenario',
          projects: [
            { id: 'project-1', name: 'Alpha' },
            { id: 'project-2', name: 'Current scenario' },
          ],
          rememberProjectSelection: true,
          sidebarVisible: true,
        }}
      />
    );
  });

  return { onProjectSelect };
}

function renderVerticalMenuWithLongNames() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <ToolbarScenarioProjectMenuHarness
        displayMode="vertical"
        scenario={{
          byClickDisabled: false,
          captureMode: 'manual',
          enabled: true,
          onCaptureActionSelected: vi.fn(),
          onCreateProject: vi.fn(async () => undefined),
          onFinishScenario: vi.fn(async () => undefined),
          onOpenEditor: vi.fn(),
          onProjectSelect: vi.fn(async () => undefined),
          onRememberProjectSelectionChange: vi.fn(async () => undefined),
          onSetCaptureMode: vi.fn(),
          onToggleSidebar: vi.fn(),
          pendingProjectSelection: false,
          projectId: 'project-2',
          projectName: 'Current scenario',
          projects: [
            {
              id: 'project-1',
              name: 'A very long scenario name that should stay truncated without horizontal scroll',
            },
            { id: 'project-2', name: 'Current scenario' },
          ],
          rememberProjectSelection: true,
          sidebarVisible: true,
        }}
      />
    );
  });
}

function openMenu() {
  const trigger = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.scenario-project-button"]'
  );

  if (!trigger) {
    throw new Error('Scenario project trigger is missing');
  }

  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
    top: 24,
    left: 600,
    right: 636,
    bottom: 60,
    width: 36,
    height: 36,
    x: 600,
    y: 24,
    toJSON: () => ({}),
  });

  act(() => {
    trigger.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1440);
  vi.stubGlobal('innerHeight', 900);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps the menu interactive inside the portal and still selects the clicked scenario', async () => {
  const { onProjectSelect } = renderMenu();

  openMenu();

  const searchInput = document.body.querySelector<HTMLInputElement>(
    '[data-ui="content.toolbar.scenario-project-menu.search-input"]'
  );
  expect(searchInput).not.toBeNull();

  act(() => {
    searchInput?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  });
  act(() => {
    searchInput?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  });

  expect(
    document.body.querySelector('[data-ui="content.toolbar.scenario-project-menu"]')
  ).not.toBeNull();

  const alphaProjectButton = document.body.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.scenario-project-menu.project"]'
  );
  expect(alphaProjectButton).not.toBeNull();

  act(() => {
    alphaProjectButton?.click();
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(onProjectSelect).toHaveBeenCalledWith('project-1');
});

it('keeps long project names truncated with tooltips and opens beside the toolbar in vertical mode', () => {
  renderVerticalMenuWithLongNames();
  openMenu();

  const menu = document.body.querySelector<HTMLElement>(
    '[data-ui="content.toolbar.scenario-project-menu"]'
  );
  const projectButton = document.body.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.scenario-project-menu.project"]'
  );

  expect(menu).not.toBeNull();
  expect(menu?.style.pointerEvents).toBe('auto');
  expect(Number.parseInt(menu?.style.left ?? '0', 10)).toBeGreaterThan(636);
  expect(projectButton?.getAttribute('title')).toContain('A very long scenario name');
  expect(projectButton?.className).toContain('overflow-hidden');
});

it('disables browser autocomplete affordances on the project search input', () => {
  renderMenu();
  openMenu();

  const searchInput = document.body.querySelector<HTMLInputElement>(
    '[data-ui="content.toolbar.scenario-project-menu.search-input"]'
  );

  expect(searchInput?.getAttribute('autocomplete')).toBe('off');
  expect(searchInput?.getAttribute('aria-autocomplete')).toBe('none');
});

it('does not close the menu when the project list scrolls', () => {
  renderVerticalMenuWithLongNames();
  openMenu();

  const menu = document.body.querySelector<HTMLElement>(
    '[data-ui="content.toolbar.scenario-project-menu"]'
  );
  expect(menu).not.toBeNull();

  act(() => {
    menu?.dispatchEvent(new Event('scroll', { bubbles: true }));
    window.dispatchEvent(new Event('scroll'));
  });

  expect(
    document.body.querySelector('[data-ui="content.toolbar.scenario-project-menu"]')
  ).not.toBeNull();
});
