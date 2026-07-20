// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  SCENARIO_EDITOR_NAVIGATOR_COLLAPSED_WIDTH_CLASS,
  SCENARIO_EDITOR_NAVIGATOR_EXPANDED_WIDTH_CLASS,
} from '../layout/constants';
import { ScenarioToolbarProjectSummary } from './project-summary';
import { createScenarioEditorToolbarController } from './test-support';
import type { ScenarioEditorToolbarController } from './types';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createController(navigatorCollapsed = false) {
  const base = createScenarioEditorToolbarController();
  return createScenarioEditorToolbarController({
    ui: {
      ...base.ui,
      navigatorCollapsed,
    },
  });
}

function renderController(controller: ScenarioEditorToolbarController) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ScenarioToolbarProjectSummary controller={controller} />);
  });
}

function renderSummary(navigatorCollapsed = false) {
  const controller = createController(navigatorCollapsed);
  renderController(controller);
  return controller;
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

it('switches the summary width between expanded and collapsed navigator states', () => {
  const expandedController = renderSummary();

  const expandedSummary = container?.firstElementChild as HTMLDivElement | null;
  expect(expandedSummary?.className).toContain(SCENARIO_EDITOR_NAVIGATOR_EXPANDED_WIDTH_CLASS);
  expect(expandedSummary?.className).toContain('h-14');
  expect(container?.querySelector('[aria-label="scenario.editor.renameProject"]')).not.toBeNull();
  expect(container?.querySelectorAll('svg').length).toBe(1);
  expect(container?.querySelector('button')?.className).toContain('bg-transparent');
  expect(container?.querySelector('button')?.className).not.toContain('border');
  act(() => container?.querySelector<HTMLButtonElement>('button')?.click());
  expect(expandedController.ui.setNavigatorCollapsed).toHaveBeenCalledWith(true);

  const collapsedController = renderSummary(true);

  const collapsedSummary = container?.firstElementChild as HTMLDivElement | null;
  expect(collapsedSummary?.className).toContain(SCENARIO_EDITOR_NAVIGATOR_COLLAPSED_WIDTH_CLASS);
  expect(container?.querySelector('[aria-label="scenario.editor.renameProject"]')).toBeNull();
  const collapsedButton = container?.querySelector(
    '[aria-label="scenario.editor.expandNavigator Project 1"]'
  ) as HTMLButtonElement | null;
  expect(collapsedButton).not.toBeNull();
  expect(collapsedButton?.className).toContain('bg-transparent');
  expect(collapsedButton?.className).not.toContain('border');
  expect(container?.querySelectorAll('svg').length).toBe(1);
  act(() => collapsedButton?.click());
  expect(collapsedController.ui.setNavigatorCollapsed).toHaveBeenCalledWith(false);
});

it('commits renamed projects and restores the owner value on Escape', () => {
  const controller = renderSummary();
  const input = container?.querySelector('[aria-label="scenario.editor.renameProject"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('Missing project summary input');

  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Draft');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(controller.projectCrud.renameProject).toHaveBeenCalledWith('Draft');

  const blurSpy = vi.spyOn(input, 'blur');
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
  expect(input.value).toBe('Project 1');
  expect(blurSpy).toHaveBeenCalledTimes(2);
});

it('uses load errors and the generic title when no project is available', () => {
  const base = createController();
  renderController({
    ...base,
    project: { ...base.project, error: 'Load failed', project: null },
  });
  expect(container?.querySelector<HTMLInputElement>('input')?.value).toBe('Load failed');

  renderController({
    ...base,
    project: { ...base.project, error: null, project: null },
  });
  expect(container?.querySelector<HTMLInputElement>('input')?.value).toBe('scenario.editor.title');
});
