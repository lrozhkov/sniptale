// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { useExpandedActionsVisibility } from './hover-visibility';

function HoverVisibilityHarness() {
  const visibility = useExpandedActionsVisibility();

  return (
    <div
      data-testid="hover-visibility"
      data-visible={String(visibility.expandedActionsVisible)}
      onMouseEnter={visibility.showExpandedActions}
      onMouseLeave={visibility.hideExpandedActions}
    />
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHarness() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<HoverVisibilityHarness />);
  });

  return container.querySelector('[data-testid="hover-visibility"]') as HTMLDivElement;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('shows immediately and hides immediately on pointer leave', () => {
  const harness = renderHarness();

  act(() => {
    harness.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
  expect(harness.getAttribute('data-visible')).toBe('true');

  act(() => {
    harness.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  });

  expect(harness.getAttribute('data-visible')).toBe('false');
});
