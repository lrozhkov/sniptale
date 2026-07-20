// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  effectsMock: vi.fn(),
  findActiveCollapsedCommandMock: vi.fn((commands: any[], commandId: string | null) =>
    commands.find((command) => command.id === commandId)
  ),
  handleCompactCommandClickMock: vi.fn((command: any, setCollapsedCommandId: any) =>
    setCollapsedCommandId(command.id)
  ),
  registerCompactCommandButtonRefMock: vi.fn((refs: any, commandId: string, element: any) => {
    refs.current[commandId] = element;
  }),
}));

vi.mock('./effects', () => ({
  useEditorInspectorCompactToolbarEffects: mocks.effectsMock,
}));

vi.mock('./helpers', () => ({
  findActiveCollapsedCommand: mocks.findActiveCollapsedCommandMock,
  handleCompactCommandClick: mocks.handleCompactCommandClickMock,
  registerCompactCommandButtonRef: mocks.registerCompactCommandButtonRefMock,
}));

import { useEditorInspectorCompactToolbar } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestToolbar: ReturnType<typeof useEditorInspectorCompactToolbar> | null = null;

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

function HookHarness({
  collapsed,
  commandGroups,
}: {
  collapsed: boolean;
  commandGroups?: any[][];
}) {
  const toolbar = useEditorInspectorCompactToolbar({
    collapsed,
    commandGroups: commandGroups as never,
  });
  latestToolbar = toolbar;

  return (
    <div>
      <button
        ref={(element) => toolbar.registerCompactCommandButtonRef('popover', element)}
        type="button"
        onClick={() =>
          toolbar.handleCompactCommandClick({
            content: <div>Popover</div>,
            id: 'popover',
            title: 'Popover',
            trigger: 'P',
          } as never)
        }
      >
        open
      </button>
      <div data-testid="active">{toolbar.activeCollapsedCommand?.id ?? 'none'}</div>
      <div data-testid="collapsed">{toolbar.collapsedCommandId ?? 'none'}</div>
    </div>
  );
}

beforeEach(() => {
  latestToolbar = null;
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestToolbar = null;
});

describe('useEditorInspectorCompactToolbar', () => {
  it('wires compact commands into hook state and effect dependencies', () => {
    render(<HookHarness collapsed={false} />);

    expect(mocks.effectsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeCollapsedCommand: undefined,
        collapsed: false,
        collapsedCommandId: null,
      })
    );

    render(
      <HookHarness
        collapsed
        commandGroups={[
          [
            { content: <div>Popover</div>, id: 'popover', title: 'Popover', trigger: 'P' },
            { id: 'leaf', onClick: vi.fn(), title: 'Leaf', trigger: 'L' },
          ],
        ]}
      />
    );

    const button = container?.querySelector('button') as HTMLButtonElement;
    act(() => {
      latestToolbar?.registerCompactCommandButtonRef('popover', button);
    });
    expect(mocks.registerCompactCommandButtonRefMock).toHaveBeenCalled();

    act(() => {
      button.click();
    });

    expect(container?.textContent).toContain('popover');
    expect(mocks.handleCompactCommandClickMock).toHaveBeenCalledOnce();
    expect(mocks.findActiveCollapsedCommandMock).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'popover' })]),
      'popover'
    );
    expect(mocks.effectsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeCollapsedCommand: expect.objectContaining({ id: 'popover' }),
        collapsed: true,
      })
    );
  });
});
