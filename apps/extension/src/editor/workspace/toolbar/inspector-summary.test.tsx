// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS,
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
} from '@sniptale/ui/inspector-shell';
import { EditorToolbarInspectorSummary } from './inspector-summary';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSummaryProps(
  overrides: Partial<React.ComponentProps<typeof EditorToolbarInspectorSummary>> = {}
) {
  return {
    inspectorCollapsed: false,
    subtitle: 'Frame settings',
    title: 'Frame',
    onCollapse: vi.fn(),
    onExpand: vi.fn(),
    ...overrides,
  };
}

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
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

function getRenderedSummaryParts() {
  return {
    button: container?.querySelector('button') as HTMLButtonElement | null,
    wrapper: container?.firstElementChild as HTMLDivElement | null,
  };
}

function clickSummaryButton(button: HTMLButtonElement | null) {
  act(() => {
    button?.click();
  });
}

it('renders the collapsed inspector affordance and expands on click', () => {
  const props = createSummaryProps({ inspectorCollapsed: true });

  render(<EditorToolbarInspectorSummary {...props} />);

  const { button, wrapper } = getRenderedSummaryParts();

  expect(wrapper?.className).toContain('h-14');
  expect(wrapper?.className).toContain(INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS);
  expect(wrapper?.className).toContain('justify-center');
  expect(wrapper?.className).toContain('px-0');
  expect(button?.getAttribute('aria-label')).toBe(
    `${translate('editor.toolbar.expandInspectorPrefix')} Frame`
  );
  expect(button?.className).toContain('bg-transparent');
  expect(button?.className).not.toContain('border');
  expect(container?.textContent).not.toContain('Frame settings');
  expect(container?.textContent).not.toContain('F');

  clickSummaryButton(button);

  expect(props.onExpand).toHaveBeenCalledOnce();
  expect(props.onCollapse).not.toHaveBeenCalled();
});

it('renders the expanded inspector summary and collapses on click', () => {
  const props = createSummaryProps();

  render(<EditorToolbarInspectorSummary {...props} />);

  const { button, wrapper } = getRenderedSummaryParts();

  expect(wrapper?.className).toContain('h-14');
  expect(wrapper?.className).toContain(INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS);
  expect(wrapper?.className).toContain('px-3');
  expect(container?.textContent).toContain('Frame');
  expect(container?.textContent).toContain('Frame settings');
  expect(button?.getAttribute('aria-label')).toBe(translate('editor.toolbar.collapseInspector'));
  expect(button?.className).toContain('bg-transparent');
  expect(button?.className).not.toContain('border');

  clickSummaryButton(button);

  expect(props.onCollapse).toHaveBeenCalledOnce();
  expect(props.onExpand).not.toHaveBeenCalled();
});
