// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { GalleryModalFrame } from './frame';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.clearAllMocks();
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

it('renders a canonical product modal with title, description, children, and close wiring', () => {
  const onClose = vi.fn();

  act(() => {
    root?.render(
      <GalleryModalFrame
        title="Modal title"
        description="Modal description"
        maxWidthClassName="max-w-lg"
        panelClassName="panel-class"
        onClose={onClose}
      >
        <div data-ui="test.child">child</div>
      </GalleryModalFrame>
    );
  });

  const closeButton = container?.querySelector('button');
  if (!closeButton) {
    throw new Error('Expected modal close button');
  }

  act(() => {
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(container?.textContent).toContain('Modal title');
  expect(container?.textContent).toContain('Modal description');
  expect(container?.querySelector('svg')).toBeTruthy();
  expect(container?.querySelector('[data-ui="test.child"]')?.textContent).toBe('child');
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('forwards modal sizing to the canonical product modal', () => {
  act(() => {
    root?.render(
      <GalleryModalFrame
        title="Default title"
        description="Default description"
        maxWidthClassName="max-w-md"
        onClose={vi.fn()}
      >
        <div>body</div>
      </GalleryModalFrame>
    );
  });

  const panel = container?.querySelector('.max-w-md');
  expect(panel?.className).toContain('sniptale-modal');
  expect(panel?.className).not.toContain('rounded-[16px]');
  expect(container?.querySelector('.sniptale-modal-title-sm')?.textContent).toBe('Default title');
});
