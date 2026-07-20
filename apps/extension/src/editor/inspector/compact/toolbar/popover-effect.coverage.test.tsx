// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const cleanup = vi.fn();
const updateLayout = vi.fn();

const mocks = vi.hoisted(() => ({
  createHandlersMock: vi.fn(() => ({
    handleClickOutside: vi.fn(),
    handleEscape: vi.fn(),
    updateLayout,
  })),
  registerListenersMock: vi.fn(() => cleanup),
}));

vi.mock('./effects.handlers', () => ({
  createCompactToolbarEffectHandlers: mocks.createHandlersMock,
}));

vi.mock('./listeners', () => ({
  registerCompactToolbarEffectListeners: mocks.registerListenersMock,
}));

import { useEditorInspectorCompactToolbarPopoverEffect } from './popover-effect';

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

function PopoverHarness({ active }: { active: boolean }) {
  useEditorInspectorCompactToolbarPopoverEffect({
    activeCollapsedCommand: active
      ? ({ content: <div>Popover</div>, id: 'popover', title: 'Popover', trigger: 'P' } as never)
      : undefined,
    collapsedCommandButtonRefs: { current: {} },
    collapsedPopoverRef: { current: null },
    setCollapsedCommandId: vi.fn(),
    setCollapsedPopoverStyle: vi.fn(),
  });
  return <div>popover</div>;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  cleanup.mockClear();
  updateLayout.mockClear();
});

describe('useEditorInspectorCompactToolbarPopoverEffect', () => {
  it('creates handlers, updates layout, and cleans listeners only when a command is active', () => {
    render(<PopoverHarness active={false} />);
    expect(mocks.createHandlersMock).not.toHaveBeenCalled();

    render(<PopoverHarness active />);
    expect(mocks.createHandlersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collapsedPopoverRef: expect.objectContaining({ current: null }),
        commandId: 'popover',
      })
    );
    expect(updateLayout).toHaveBeenCalledOnce();
    expect(mocks.registerListenersMock).toHaveBeenCalledOnce();

    act(() => {
      root?.render(<div>done</div>);
    });
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
