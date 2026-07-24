// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { isContentEventWithinElementMock } = vi.hoisted(() => ({
  isContentEventWithinElementMock: vi.fn(),
}));

vi.mock('../../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/dom-host')>()),
  isContentEventWithinElement: isContentEventWithinElementMock,
}));

import { useTemplateMenuDismiss } from './menu';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

type MenuDismissHarnessProps = {
  menuRef: Parameters<typeof useTemplateMenuDismiss>[2];
  openMenuId: Parameters<typeof useTemplateMenuDismiss>[0];
  setOpenMenuId: Parameters<typeof useTemplateMenuDismiss>[1];
};

function MenuDismissHarness(props: MenuDismissHarnessProps) {
  useTemplateMenuDismiss(props.openMenuId, props.setOpenMenuId, props.menuRef);
  return null;
}

async function renderHarness(props: MenuDismissHarnessProps) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<MenuDismissHarness {...props} />);
  });
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  isContentEventWithinElementMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('useTemplateMenuDismiss', () => {
  it('dismisses the menu when document clicks fall outside the menu surface', async () => {
    const setOpenMenuId = vi.fn();
    const menuRef = { current: document.createElement('div') };
    isContentEventWithinElementMock.mockReturnValue(false);
    await renderHarness({ menuRef, openMenuId: 'template-1', setOpenMenuId });

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(setOpenMenuId).toHaveBeenCalledWith(null);
  });

  it('does not register dismissal work when no menu is open', async () => {
    const setOpenMenuId = vi.fn();
    const menuRef = { current: document.createElement('div') };
    await renderHarness({ menuRef, openMenuId: null, setOpenMenuId });

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(isContentEventWithinElementMock).not.toHaveBeenCalled();
    expect(setOpenMenuId).not.toHaveBeenCalled();
  });

  it('removes the dismissal listener on unmount', async () => {
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const props = {
      menuRef: { current: document.createElement('div') },
      openMenuId: 'template-1',
      setOpenMenuId: vi.fn(),
    };
    await renderHarness(props);
    const listener = addEventListener.mock.calls.find(([type]) => type === 'mousedown')?.[1];

    act(() => {
      root?.unmount();
    });
    root = null;

    expect(removeEventListener).toHaveBeenCalledWith('mousedown', listener);
    addEventListener.mockRestore();
    removeEventListener.mockRestore();
  });
});
