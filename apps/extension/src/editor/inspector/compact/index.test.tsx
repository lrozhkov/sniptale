// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  groupsPropsMock: vi.fn(),
  popoverPropsMock: vi.fn(),
  setCollapsedCommandIdMock: vi.fn(),
  useToolbarMock: vi.fn(),
}));

vi.mock('./popover', () => ({
  EditorInspectorCompactPopover: (
    props: Record<string, unknown> & { children?: React.ReactNode }
  ) => {
    mocks.popoverPropsMock(props);

    return (
      <div data-testid="compact-popover">
        <span>{String(props['title'])}</span>
        {props['value'] === undefined ? null : <span>{String(props['value'])}</span>}
        <button type="button" onClick={() => (props['onClose'] as () => void)()}>
          close
        </button>
        {props.children}
      </div>
    );
  },
}));

vi.mock('./toolbar-groups', () => ({
  EditorInspectorCompactToolbarGroups: (props: Record<string, unknown>) => {
    mocks.groupsPropsMock(props);
    return (
      <div data-testid="compact-toolbar-groups">
        {String((props['commandGroups'] as unknown[]).length)}
      </div>
    );
  },
}));

vi.mock('./toolbar', () => ({
  useEditorInspectorCompactToolbar: mocks.useToolbarMock,
}));

import { EditorInspectorCompactToolbar } from './';
import { CompactCommandField } from './shared';
import '../ui-migration-coverage.commands.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function setupCompactToolbarMocks() {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  mocks.useToolbarMock.mockReturnValue({
    activeCollapsedCommand: null,
    collapsedCommandId: null,
    collapsedPopoverRef: { current: null },
    collapsedPopoverStyle: { left: 12, top: 24 },
    handleCompactCommandClick: vi.fn(),
    registerCompactCommandButtonRef: vi.fn(),
    setCollapsedCommandId: mocks.setCollapsedCommandIdMock,
  });
}

function renderCompactToolbar(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

function mockActiveCollapsedCommand(content: React.ReactNode, title: string, value?: string) {
  mocks.useToolbarMock.mockReturnValue({
    activeCollapsedCommand: {
      content,
      title,
      trigger: <button type="button">trigger</button>,
      ...(value === undefined ? {} : { value }),
    },
    collapsedCommandId: 'command-1',
    collapsedPopoverRef: { current: null },
    collapsedPopoverStyle: { left: 12, top: 24 },
    handleCompactCommandClick: vi.fn(),
    registerCompactCommandButtonRef: vi.fn(),
    setCollapsedCommandId: mocks.setCollapsedCommandIdMock,
  });
}

function renderCollapsedToolbarWithCommand() {
  renderCompactToolbar(
    <EditorInspectorCompactToolbar collapsed commandGroups={[[{ id: 'command-1' } as never]]} />
  );
}

function clickCollapsedPopoverClose() {
  act(() => {
    (
      Array.from(container?.querySelectorAll('button') ?? []).find(
        (button) => button.textContent === 'close'
      ) as HTMLButtonElement | undefined
    )?.click();
  });
}

function getCollapsedPopoverText() {
  return container?.querySelector('[data-testid="compact-popover"]')?.textContent;
}

function runExpandedToolbarSuite() {
  it('renders toolbar groups without a popover when the inspector is expanded', () => {
    renderCompactToolbar(<EditorInspectorCompactToolbar collapsed={false} />);

    expect(
      container?.querySelector('[data-testid="compact-toolbar-groups"]')?.textContent
    ).toContain('0');
    expect(container?.querySelector('[data-testid="compact-popover"]')).toBeNull();
    expect(mocks.groupsPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collapsedCommandId: null,
        commandGroups: [],
      })
    );
  });
}

function runCollapsedPopoverSuite() {
  it('renders and closes the collapsed popover for the active command', () => {
    mockActiveCollapsedCommand(<div>command body</div>, 'Command', 'Value');

    renderCollapsedToolbarWithCommand();

    expect(getCollapsedPopoverText()).toContain('Command');
    clickCollapsedPopoverClose();
    expect(mocks.setCollapsedCommandIdMock).toHaveBeenCalledWith(null);
  });

  it('hides duplicated command field labels inside collapsed popovers', () => {
    mockActiveCollapsedCommand(
      <CompactCommandField label="Толщина" value="8px">
        <div>numeric body</div>
      </CompactCommandField>,
      'Толщина',
      '8px'
    );
    renderCollapsedToolbarWithCommand();

    const popoverText = getCollapsedPopoverText();
    expect(popoverText?.match(/Толщина/g)).toHaveLength(1);
    expect(popoverText?.match(/8px/g)).toHaveLength(1);
    expect(popoverText).toContain('numeric body');
  });
}

describe('editor-inspector-compact toolbar', () => {
  beforeEach(setupCompactToolbarMocks);
  runExpandedToolbarSuite();
  runCollapsedPopoverSuite();
});
