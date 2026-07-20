// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getQuickActionRowStateClassNameSpy,
  quickActionRowActionsSpy,
  quickActionRowHandleSpy,
  quickActionRowShellSpy,
  quickActionRowSummarySpy,
} = vi.hoisted(() => ({
  getQuickActionRowStateClassNameSpy: vi.fn(),
  quickActionRowActionsSpy: vi.fn(),
  quickActionRowHandleSpy: vi.fn(),
  quickActionRowShellSpy: vi.fn(),
  quickActionRowSummarySpy: vi.fn(),
}));

vi.mock('./state-class', () => ({
  getQuickActionRowStateClassName: (args: unknown) => getQuickActionRowStateClassNameSpy(args),
}));

vi.mock('./sections', () => ({
  quickActionRowClassName: 'settings-list-row',
  QuickActionRowActions: (props: unknown) => {
    quickActionRowActionsSpy(props);
    return <div data-testid="row-actions" />;
  },
  QuickActionRowHandle: (props: unknown) => {
    quickActionRowHandleSpy(props);
    return <div data-testid="row-handle" />;
  },
  QuickActionRowShell: (props: { children: React.ReactNode; className: string }) => {
    quickActionRowShellSpy(props);
    return (
      <div data-testid="row-shell" className={props.className}>
        {props.children}
      </div>
    );
  },
  QuickActionRowSummary: (props: unknown) => {
    quickActionRowSummarySpy(props);
    return <div data-testid="row-summary" />;
  },
}));

import { QuickActionRow } from '.';

type QuickActionRowProps = Parameters<typeof QuickActionRow>[0];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createAction(
  overrides: Partial<QuickActionRowProps['action']> = {}
): QuickActionRowProps['action'] {
  return {
    id: 'action-1',
    hotkey: null,
    ...overrides,
  } as QuickActionRowProps['action'];
}

function createProps(overrides: Partial<QuickActionRowProps> = {}): QuickActionRowProps {
  return {
    action: createAction(),
    draggedId: null,
    dragOverId: null,
    hoveredId: null,
    onDeleteConfirm: vi.fn(),
    onDragEnd: vi.fn(),
    onDragLeave: vi.fn(),
    onDragOver: vi.fn(),
    onDragStart: vi.fn(),
    onDrop: vi.fn(),
    onEdit: vi.fn(),
    onHoverChange: vi.fn(),
    onToggleStatus: vi.fn(async () => undefined),
    viewportPresets: undefined,
    ...overrides,
  };
}

async function renderRow(overrides: Partial<QuickActionRowProps> = {}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const props = createProps(overrides);

  await act(async () => {
    root?.render(<QuickActionRow {...props} />);
  });

  return props;
}

async function verifyUndefinedHotkeyOmission() {
  const action = createAction();
  const { hotkey: _hotkey, ...actionWithoutHotkey } = action;
  const props = await renderRow({
    action: actionWithoutHotkey,
    dragOverId: 'action-1',
    hoveredId: 'action-1',
    viewportPresets: [],
  });

  expect(getQuickActionRowStateClassNameSpy).toHaveBeenCalledWith({
    action: props.action,
    draggedId: null,
    dragOverId: 'action-1',
  });
  expect(quickActionRowShellSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      actionId: 'action-1',
      className: 'settings-list-row drag-over',
    })
  );
  expect(quickActionRowHandleSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      actionId: 'action-1',
      onDragEnd: props.onDragEnd,
      onDragStart: props.onDragStart,
    })
  );
  expect(quickActionRowSummarySpy).toHaveBeenCalledWith(
    expect.objectContaining({
      action: props.action,
      viewportPresets: [],
    })
  );
  expect(quickActionRowActionsSpy).toHaveBeenCalledWith(
    expect.not.objectContaining({
      hotkey: expect.anything(),
    })
  );
}

async function verifyDefinedHotkeyForwarding() {
  const hotkey = {
    altKey: false,
    ctrlKey: true,
    key: 'K',
    metaKey: false,
    shiftKey: true,
  };

  await renderRow({
    action: createAction({ hotkey }),
    hoveredId: 'action-1',
  });

  expect(quickActionRowActionsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      hotkey,
      isHovered: true,
    })
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  getQuickActionRowStateClassNameSpy.mockReset();
  getQuickActionRowStateClassNameSpy.mockReturnValue('drag-over');
  quickActionRowActionsSpy.mockReset();
  quickActionRowHandleSpy.mockReset();
  quickActionRowShellSpy.mockReset();
  quickActionRowSummarySpy.mockReset();
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

describe('QuickActionRow', () => {
  it(
    'wires row state, handle, summary, and omits the hotkey prop when it is undefined',
    verifyUndefinedHotkeyOmission
  );
  it(
    'forwards a nullable-or-defined hotkey and hover state into the actions slot',
    verifyDefinedHotkeyForwarding
  );
});
