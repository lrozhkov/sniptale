// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { InspectorShellHeaderSegment } from './header';
import {
  INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS,
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
} from './tokens';
import { InspectorShellFrame, InspectorShellHeaderAction, InspectorShellPanel } from './frame';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

it('renders frame, panel, header segment, and both header action variants', () => {
  const onClick = vi.fn();

  act(() => {
    root?.render(
      <InspectorShellFrame>
        <InspectorShellPanel>
          <InspectorShellHeaderSegment>
            <span>Segment</span>
          </InspectorShellHeaderSegment>
          <InspectorShellHeaderAction title="Collapse" onClick={onClick}>
            <span>-</span>
          </InspectorShellHeaderAction>
          <InspectorShellHeaderAction title="Surface" onClick={onClick} variant="surface">
            <span>+</span>
          </InspectorShellHeaderAction>
        </InspectorShellPanel>
      </InspectorShellFrame>
    );
  });

  const [compactButton, surfaceButton] = Array.from(container?.querySelectorAll('button') ?? []);
  expect(container?.querySelector('aside')).not.toBeNull();
  expect(container?.querySelector('div[data-ui="shared.ui.inspector-shell-panel"]')).not.toBeNull();
  expect(
    container?.querySelector('[data-ui="shared.ui.inspector-shell-header-segment"]')?.className
  ).toContain(INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS);
  expect(compactButton?.className).toContain('bg-transparent');
  expect(surfaceButton?.className).toContain('border');

  act(() => {
    compactButton?.click();
    surfaceButton?.click();
  });

  expect(onClick).toHaveBeenCalledTimes(2);
});

it('switches the shared header segment to the collapsed width token', () => {
  act(() => {
    root?.render(
      <InspectorShellHeaderSegment collapsed>
        <span>Collapsed</span>
      </InspectorShellHeaderSegment>
    );
  });

  expect(
    container?.querySelector('[data-ui="shared.ui.inspector-shell-header-segment"]')?.className
  ).toContain(INSPECTOR_SHELL_COLLAPSED_WIDTH_CLASS);
});
