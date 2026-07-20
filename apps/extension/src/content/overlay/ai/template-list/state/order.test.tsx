// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptTemplate } from '../../../../../contracts/settings';

const { isContentEventWithinElementMock, loadSavedTemplateOrderMock, syncOrderedIdsMock } =
  vi.hoisted(() => ({
    isContentEventWithinElementMock: vi.fn(),
    loadSavedTemplateOrderMock: vi.fn(),
    syncOrderedIdsMock: vi.fn(),
  }));

vi.mock('../../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/dom-host')>()),
  isContentEventWithinElement: isContentEventWithinElementMock,
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  loadSavedTemplateOrder: loadSavedTemplateOrderMock,
  syncOrderedIds: syncOrderedIdsMock,
}));

import { useTemplateMenuDismiss, useTemplateOrderState } from './order';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestOrderState: ReturnType<typeof useTemplateOrderState> | null = null;

const templates = [{ content: 'one', id: 'template-1', name: 'One' }] as PromptTemplate[];

function OrderStateHarness(props: { templates: PromptTemplate[] }) {
  latestOrderState = useTemplateOrderState(props.templates);
  return null;
}

type MenuDismissHarnessProps = {
  menuRef: Parameters<typeof useTemplateMenuDismiss>[2];
  openMenuId: Parameters<typeof useTemplateMenuDismiss>[0];
  setOpenMenuId: Parameters<typeof useTemplateMenuDismiss>[1];
};

function MenuDismissHarness(props: MenuDismissHarnessProps) {
  useTemplateMenuDismiss(props.openMenuId, props.setOpenMenuId, props.menuRef);
  return null;
}

async function renderHarness(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(node);
    await Promise.resolve();
  });
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  latestOrderState = null;
  isContentEventWithinElementMock.mockReset();
  loadSavedTemplateOrderMock.mockReset();
  loadSavedTemplateOrderMock.mockImplementation(async (setOrderedIds, setOrderLoaded) => {
    setOrderedIds(['saved-template']);
    setOrderLoaded(true);
  });
  syncOrderedIdsMock.mockReset();
  syncOrderedIdsMock.mockReturnValue(['synced-template']);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('useTemplateOrderState', () => {
  it('loads saved order once and syncs it against current templates after bootstrap', async () => {
    await renderHarness(<OrderStateHarness templates={templates} />);

    expect(loadSavedTemplateOrderMock).toHaveBeenCalledTimes(1);
    expect(syncOrderedIdsMock).toHaveBeenCalledWith(['saved-template'], templates);
    expect(latestOrderState?.orderedIds).toEqual(['synced-template']);
  });
});

describe('useTemplateMenuDismiss', () => {
  it('dismisses the menu when document clicks fall outside the menu surface', async () => {
    const setOpenMenuId = vi.fn();
    const menuRef = { current: document.createElement('div') };
    isContentEventWithinElementMock.mockReturnValue(false);

    await renderHarness(
      <MenuDismissHarness openMenuId="template-1" setOpenMenuId={setOpenMenuId} menuRef={menuRef} />
    );

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(setOpenMenuId).toHaveBeenCalledWith(null);
  });

  it('does not register dismissal work when no menu is open', async () => {
    const setOpenMenuId = vi.fn();
    const menuRef = { current: document.createElement('div') };

    await renderHarness(
      <MenuDismissHarness openMenuId={null} setOpenMenuId={setOpenMenuId} menuRef={menuRef} />
    );

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(isContentEventWithinElementMock).not.toHaveBeenCalled();
    expect(setOpenMenuId).not.toHaveBeenCalled();
  });
});
