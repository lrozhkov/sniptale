// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToolbarScenarioModeMenu } from './mode-menu';
import { useToolbarMenuState } from '../state/menu';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderMenu(props: {
  byClickDisabled: boolean;
  captureMode: 'manual' | 'by-click';
  compactMenus: boolean;
  displayMode: 'horizontal' | 'vertical';
  onSetCaptureMode: (captureMode: 'manual' | 'by-click') => void;
  sidebarVisible?: boolean;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ScenarioModeMenuHarness {...props} />);
  });
}

function ScenarioModeMenuHarness(
  props: Omit<Parameters<typeof ToolbarScenarioModeMenu>[0], 'toolbarMenuState'>
) {
  const toolbarMenuState = useToolbarMenuState();

  return <ToolbarScenarioModeMenu {...props} toolbarMenuState={toolbarMenuState} />;
}

function openMenu() {
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.scenario-mode-button"]')
      ?.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1240);
  vi.stubGlobal('innerHeight', 900);
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

it('selects by-click mode when the option is enabled', () => {
  const onSetCaptureMode = vi.fn();
  renderMenu({
    byClickDisabled: false,
    captureMode: 'manual',
    compactMenus: false,
    displayMode: 'horizontal',
    onSetCaptureMode,
  });

  openMenu();
  const byClickOption = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.scenario-mode-option.by-click"]'
  );

  expect(byClickOption?.disabled).toBe(false);
  act(() => {
    byClickOption?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  expect(onSetCaptureMode).toHaveBeenCalledWith('by-click');
});

it('disables the by-click option while recorder-blocking modes are active', () => {
  const onSetCaptureMode = vi.fn();
  renderMenu({
    byClickDisabled: true,
    captureMode: 'manual',
    compactMenus: false,
    displayMode: 'horizontal',
    onSetCaptureMode,
  });

  openMenu();
  const byClickOption = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.scenario-mode-option.by-click"]'
  );

  expect(byClickOption?.disabled).toBe(true);
  act(() => {
    byClickOption?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  expect(onSetCaptureMode).not.toHaveBeenCalled();
  expect(container?.textContent).toContain('scenario.content.modeByClickDisabledHint');
});

it('keeps the mode button visually active while by-click capture is selected', () => {
  renderMenu({
    byClickDisabled: false,
    captureMode: 'by-click',
    compactMenus: false,
    displayMode: 'horizontal',
    onSetCaptureMode: vi.fn(),
  });

  const trigger = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.scenario-mode-button"]'
  );

  expect(trigger?.getAttribute('data-active')).toBe('true');
});

it('changes the trigger icon when the selected capture mode changes', () => {
  renderMenu({
    byClickDisabled: false,
    captureMode: 'manual',
    compactMenus: false,
    displayMode: 'horizontal',
    onSetCaptureMode: vi.fn(),
  });

  const manualMarkup =
    container?.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.scenario-mode-button"]')
      ?.innerHTML ?? '';

  renderMenu({
    byClickDisabled: false,
    captureMode: 'by-click',
    compactMenus: false,
    displayMode: 'horizontal',
    onSetCaptureMode: vi.fn(),
  });

  const byClickMarkup =
    container?.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.scenario-mode-button"]')
      ?.innerHTML ?? '';

  expect(byClickMarkup).not.toBe(manualMarkup);
});

it('opens the vertical scenario mode menu away from the reserved sidebar work area', () => {
  renderMenu({
    byClickDisabled: false,
    captureMode: 'manual',
    compactMenus: true,
    displayMode: 'vertical',
    onSetCaptureMode: vi.fn(),
    sidebarVisible: true,
  });

  const trigger = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.scenario-mode-button"]'
  );

  if (!trigger) {
    throw new Error('Scenario mode trigger is missing');
  }

  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
    top: 120,
    left: 860,
    right: 896,
    bottom: 156,
    width: 36,
    height: 36,
    x: 860,
    y: 120,
    toJSON: () => ({}),
  });

  openMenu();

  const menuRoot = container?.querySelector('[data-ui="content.toolbar.scenario-mode-menu"]');
  const menuSurface = menuRoot?.querySelector('.sniptale-popover-menu') as HTMLDivElement | null;

  expect(menuSurface?.style.left).toBe('auto');
  expect(menuSurface?.style.right).toBe('calc(100% + 10px)');
});
