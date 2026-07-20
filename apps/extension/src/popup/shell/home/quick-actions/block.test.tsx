// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuickAction } from '../../../../contracts/settings';

const { quickActionListItemSpy } = vi.hoisted(() => ({
  quickActionListItemSpy: vi.fn(),
}));

import { QuickActionsBlock } from './block';

vi.mock('./block-items/item', () => ({
  QuickActionListDensity: undefined,
  QuickActionListItem: (props: { action: { id: string } }) => {
    quickActionListItemSpy(props);
    return <div data-testid="quick-action-item">{props.action.id}</div>;
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createQuickAction(id: string): QuickAction {
  return {
    id,
    status: true,
    name: id,
    icon: 'camera',
    screenshotMode: 'visible',
    exitAfterCapture: false,
  };
}

function getListNode() {
  const listNode = container?.firstElementChild?.firstElementChild;

  if (!(listNode instanceof HTMLDivElement)) {
    throw new Error('Quick actions list node is not rendered');
  }

  return listNode;
}

async function renderQuickActionsBlock(
  actions: QuickAction[],
  displayMode: 'hidden' | 'list' = 'list',
  disabledTitle?: string
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <QuickActionsBlock
        actions={actions}
        displayMode={displayMode}
        presets={[]}
        {...(disabledTitle === undefined ? {} : { disabledTitle })}
        onTriggerAction={() => undefined}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  quickActionListItemSpy.mockReset();
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

function runGridLayoutSuite() {
  it('stretches medium-length quick action lists to fill the section height', async () => {
    await renderQuickActionsBlock(
      Array.from({ length: 6 }, (_, index) => createQuickAction(`action-${index + 1}`))
    );

    const listNode = getListNode();

    expect(listNode.className).toContain('grid');
    expect(listNode.className).toContain('h-full');
    expect(listNode.className).toContain('gap-1');
    expect(listNode.style.gridTemplateRows).toBe('repeat(6, minmax(0, 1fr))');
  });

  it('uses compact spacing and density for four-to-five quick actions', async () => {
    await renderQuickActionsBlock(
      Array.from({ length: 5 }, (_, index) => createQuickAction(`action-${index + 1}`))
    );

    const listNode = getListNode();

    expect(listNode.className).toContain('grid');
    expect(listNode.className).toContain('gap-1.5');
    expect(listNode.style.gridTemplateRows).toBe('repeat(5, minmax(0, 1fr))');
    expect(quickActionListItemSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        density: 'compact',
      })
    );
  });
}

function runOverflowBoundarySuite() {
  it('stretches up to ten quick actions before switching to the scrollable stacked layout', async () => {
    await renderQuickActionsBlock(
      Array.from({ length: 10 }, (_, index) => createQuickAction(`action-${index + 1}`))
    );

    const listNode = getListNode();

    expect(listNode.className).toContain('grid');
    expect(listNode.className).toContain('h-full');
    expect(listNode.className).toContain('gap-px');
    expect(listNode.style.gridTemplateRows).toBe('repeat(10, minmax(0, 1fr))');
    expect(quickActionListItemSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        density: 'tight',
      })
    );
  });

  it('keeps lists above ten quick actions in the scrollable stacked layout', async () => {
    await renderQuickActionsBlock(
      Array.from({ length: 11 }, (_, index) => createQuickAction(`action-${index + 1}`))
    );

    const listNode = getListNode();

    expect(listNode.className).not.toContain('grid');
    expect(listNode.className).toContain('space-y-px');
    expect(listNode.style.gridTemplateRows).toBe('');
  });
}

function runVisibilityAndDisabledSuite() {
  it('renders nothing when quick actions are hidden', async () => {
    await renderQuickActionsBlock([createQuickAction('action-1')], 'hidden');

    expect(container?.innerHTML).toBe('');
  });

  it('keeps short quick action lists in the stacked layout and forwards the disabled title', async () => {
    await renderQuickActionsBlock(
      [createQuickAction('action-1'), createQuickAction('action-2')],
      'list',
      'Blocked'
    );

    const listNode = getListNode();

    expect(listNode.className).toContain('space-y-2');
    expect(listNode.className).not.toContain('grid');
    expect(quickActionListItemSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        disabledTitle: 'Blocked',
        density: 'regular',
      })
    );
  });
}

describe('QuickActionsBlock layout', () => {
  runGridLayoutSuite();
  runOverflowBoundarySuite();
  runVisibilityAndDisabledSuite();
});
