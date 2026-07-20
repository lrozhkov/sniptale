// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { act, forwardRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dividerMock: vi.fn(),
  iconButtonMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: vi.fn((key: string) => `t:${key}`),
}));
vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
  EditorDivider: (props: unknown) => {
    mocks.dividerMock(props);
    return <div data-testid="divider" />;
  },
  EditorIconButton: forwardRef<
    HTMLButtonElement,
    {
      active?: boolean;
      children: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      onClick?: () => void;
      onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
      title: string;
    }
  >(function EditorIconButton(props, ref) {
    const { active, children, danger, disabled, onClick, onMouseDown, title } = props;
    mocks.iconButtonMock({ active, danger, disabled, onMouseDown, title });
    return (
      <button
        type="button"
        data-active={active ? 'yes' : 'no'}
        data-danger={danger ? 'yes' : 'no'}
        disabled={disabled}
        ref={ref}
        onMouseDown={onMouseDown}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }),
}));

import { CompactCommandToken } from './shared';
import { EditorInspectorCompactToolbarGroups } from './toolbar-groups';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: ReactNode) {
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
  vi.clearAllMocks();
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

it('renders an empty state when there are no command groups', () => {
  render(
    <EditorInspectorCompactToolbarGroups
      commandGroups={[]}
      collapsedCommandId={null}
      onCommandClick={vi.fn()}
      registerCompactCommandButtonRef={vi.fn()}
    />
  );

  expect(container?.textContent).toContain('t:editor.runtime.noCommands');
  expect(container?.firstElementChild?.className).not.toContain('tracking-');
  expect(mocks.iconButtonMock).not.toHaveBeenCalled();
});

it('renders grouped commands, forwards refs, and resolves active state', () => {
  const onCommandClick = vi.fn();
  const registerRef = vi.fn();
  const expandable = {
    content: <div>details</div>,
    id: 'expand',
    title: 'Expand',
    trigger: <CompactCommandToken>EX</CompactCommandToken>,
  };
  const activeLeaf = {
    active: true,
    id: 'leaf',
    onMouseDown: vi.fn(),
    title: 'Leaf',
    trigger: <CompactCommandToken>LF</CompactCommandToken>,
  };

  render(
    <EditorInspectorCompactToolbarGroups
      commandGroups={[[expandable], [activeLeaf]]}
      collapsedCommandId="expand"
      onCommandClick={onCommandClick}
      registerCompactCommandButtonRef={registerRef}
    />
  );

  expect(container?.querySelectorAll('[data-testid="divider"]').length).toBe(1);
  expect(registerRef).toHaveBeenCalledTimes(2);
  expect(mocks.iconButtonMock).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ active: true, title: 'Expand' })
  );
  expect(mocks.iconButtonMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ active: true, onMouseDown: activeLeaf.onMouseDown, title: 'Leaf' })
  );

  act(() => {
    (container?.querySelectorAll('button')[0] as HTMLButtonElement | undefined)?.click();
  });

  expect(onCommandClick).toHaveBeenCalledWith(expandable);
});

it('forwards disabled and danger props for actionable compact commands', () => {
  render(
    <EditorInspectorCompactToolbarGroups
      commandGroups={[
        [
          {
            danger: true,
            disabled: true,
            id: 'danger',
            title: 'Danger',
            trigger: <CompactCommandToken>DN</CompactCommandToken>,
          },
        ],
      ]}
      collapsedCommandId={null}
      onCommandClick={vi.fn()}
      registerCompactCommandButtonRef={vi.fn()}
    />
  );

  expect(mocks.iconButtonMock).toHaveBeenCalledWith(
    expect.objectContaining({
      active: undefined,
      danger: true,
      disabled: true,
      title: 'Danger',
    })
  );
});
