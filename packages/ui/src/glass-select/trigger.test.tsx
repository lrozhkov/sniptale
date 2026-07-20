// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  chevronClassMock: vi.fn((isOpen: boolean) => (isOpen ? 'open' : 'closed')),
}));

vi.mock('./styles', () => ({
  getGlassSelectChevronClassName: mocks.chevronClassMock,
}));

import { GlassSelectTrigger } from './trigger';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe('GlassSelectTrigger', () => {
  it('renders the placeholder state and toggles on click', () => {
    const onToggle = vi.fn();

    render(
      <GlassSelectTrigger
        disabled={false}
        isOpen={false}
        triggerClassName="trigger"
        placeholder="Select"
        onToggle={onToggle}
      />
    );

    const button = container?.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.click();
    });

    expect(container?.textContent).toContain('Select');
    expect(mocks.chevronClassMock).toHaveBeenCalledWith(false);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders the selected option content', () => {
    render(
      <GlassSelectTrigger
        disabled
        isOpen
        triggerClassName="trigger"
        placeholder="Select"
        selectedOption={{ icon: <span>Icon</span>, label: 'Desktop' }}
        onToggle={vi.fn()}
      />
    );

    expect(container?.textContent).toContain('Icon');
    expect(container?.textContent).toContain('Desktop');
    expect(mocks.chevronClassMock).toHaveBeenCalledWith(true);
  });
});
