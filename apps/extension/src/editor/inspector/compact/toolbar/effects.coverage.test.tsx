// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureStateMock: vi.fn(),
  popoverEffectMock: vi.fn(),
}));

vi.mock('./state', () => ({
  ensureCollapsedCommandState: mocks.ensureStateMock,
}));

vi.mock('./popover-effect', () => ({
  useEditorInspectorCompactToolbarPopoverEffect: mocks.popoverEffectMock,
}));

import { useEditorInspectorCompactToolbarEffects } from './effects';

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

function EffectHarness() {
  useEditorInspectorCompactToolbarEffects({
    activeCollapsedCommand: { id: 'popover', title: 'Popover', trigger: 'P' } as never,
    collapsed: true,
    collapsedCommandButtonRefs: { current: {} },
    collapsedCommandId: 'popover',
    collapsedPopoverRef: { current: null },
    setCollapsedCommandId: vi.fn(),
    setCollapsedPopoverStyle: vi.fn(),
  });
  return <div>effects</div>;
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

describe('useEditorInspectorCompactToolbarEffects', () => {
  it('delegates state and popover orchestration to owner-local helpers', () => {
    render(<EffectHarness />);

    expect(mocks.ensureStateMock).toHaveBeenCalledWith(
      expect.objectContaining({ collapsed: true, collapsedCommandId: 'popover' })
    );
    expect(mocks.ensureStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeCollapsedCommand: expect.objectContaining({ title: 'Popover' }),
      })
    );
    expect(mocks.popoverEffectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeCollapsedCommand: expect.objectContaining({ id: 'popover' }),
        collapsedPopoverRef: expect.objectContaining({ current: null }),
      })
    );
  });
});
