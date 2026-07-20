// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ScenarioRecorderSidebarHeader } from './header';

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHeader() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <ScenarioRecorderSidebarHeader
        dragging={false}
        onMouseDown={vi.fn()}
        projectName="Scenario"
      />
    );
  });
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

it('renders only the project summary without the sidebar steps label', () => {
  renderHeader();

  const surface = container?.querySelector('div');

  expect(container?.textContent).toContain('scenario.content.project');
  expect(container?.textContent).toContain('Scenario');
  expect(container?.textContent).not.toContain('scenario.content.sidebar');
  expect(container?.textContent).not.toContain('scenario.content.stepsCount');
  expect(surface?.className).toContain('rounded-[18px]');
  expect(
    container?.querySelector('[data-ui="content.scenario.sidebar.drag-handle"]')
  ).not.toBeNull();
});
