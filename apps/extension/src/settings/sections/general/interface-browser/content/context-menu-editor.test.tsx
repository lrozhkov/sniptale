// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRecommendedContextMenuSettings } from '../../../../../contracts/settings/context-menu-layout';
import { ContextMenuEditor } from './context-menu-editor';
import { installPersistenceLockManagerForTests } from '../../../../../composition/persistence/infrastructure/mutation-barrier';
import { CONTEXT_MENU_PENDING_DRAFT_KEY } from './context-menu-draft-recovery';

let container: HTMLDivElement;
let root: Root;
let editorState: ComponentProps<typeof ContextMenuEditor>['state'];
const update = vi.fn();
const retry = vi.fn();

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.localStorage.removeItem(CONTEXT_MENU_PENDING_DRAFT_KEY);
  vi.useFakeTimers();
  update.mockReset().mockResolvedValue(undefined);
  retry.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  editorState = {
    contextMenu: createRecommendedContextMenuSettings(),
    contextMenuCatalogStatus: 'ready',
    contextMenuSettingsStatus: 'ready',
    contextMenuQuickActions: [],
    contextMenuViewportPresets: [],
    retryContextMenuCatalog: retry,
    retryContextMenuSettings: retry,
    locale: 'en',
    updateContextMenu: update,
  };
  await renderEditor();
});
afterEach(() => {
  act(() => root.unmount());
  installPersistenceLockManagerForTests(null);
  container.remove();
  window.localStorage.removeItem(CONTEXT_MENU_PENDING_DRAFT_KEY);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function renderEditor() {
  await act(async () => root.render(<ContextMenuEditor state={editorState} />));
}
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (entry) => entry.getAttribute('aria-label') === label || entry.textContent?.trim() === label
  );
  if (!found) throw new Error(`Button missing: ${label}`);
  return found;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function settleDebounce() {
  await act(async () => vi.advanceTimersByTimeAsync(351));
}
async function moveDown(key: string) {
  const target = container.querySelector<HTMLElement>(`[data-tree-key="${key}"]`)!;
  await act(async () =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
      })
    )
  );
}

it('automatically saves a valid edited tree and exposes a committed result', async () => {
  await click('Create section here');
  const name = container.querySelector<HTMLInputElement>('input[aria-label="Section name"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(name, 'My tools');
    name.dispatchEvent(new Event('input', { bubbles: true }));
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(update).not.toHaveBeenCalled();
  await settleDebounce();
  expect(update).toHaveBeenCalledWith({ layout: expect.objectContaining({ version: 2 }) });
  expect(container.textContent).toContain('Menu saved');
  expect(container.textContent).not.toContain('Save menu');
});

it('restores the recommended hierarchy without changing the master switch', async () => {
  await click('Restore recommended configuration');
  await settleDebounce();
  const layout = update.mock.calls[0]?.[0].layout;
  expect(layout.nodes[0]).toMatchObject({ type: 'section', id: 'recommended-screenshots' });
  expect(update.mock.calls[0]?.[0]).not.toHaveProperty('enabled');
});

it('retains failed edits and retries the current draft', async () => {
  update.mockRejectedValueOnce(new Error('storage unavailable'));
  await moveDown('section:recommended-screenshots');
  await settleDebounce();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('try again');
  await click('Retry saving');
  expect(update).toHaveBeenCalledTimes(2);
});

it('recovers a failed pending write after the editor unmounts and retries the same tree', async () => {
  update.mockRejectedValueOnce(new Error('storage unavailable'));
  await moveDown('section:recommended-screenshots');
  const pending = window.localStorage.getItem(CONTEXT_MENU_PENDING_DRAFT_KEY);
  expect(pending).toContain('recommended-screenshots');
  act(() => root.unmount());
  await act(async () => {
    await Promise.resolve();
  });
  root = createRoot(container);
  await renderEditor();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('try again');
  await click('Retry saving');
  expect(update).toHaveBeenLastCalledWith({ layout: JSON.parse(pending!) });
  expect(window.localStorage.getItem(CONTEXT_MENU_PENDING_DRAFT_KEY)).toBeNull();
});

it('does not clear a newer reopened draft when the prior editor write finishes late', async () => {
  let finishOld: (() => void) | undefined;
  update
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishOld = resolve;
        })
    )
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('new write failed'));
  await moveDown('section:recommended-screenshots');
  await settleDebounce();
  const oldDraft = window.localStorage.getItem(CONTEXT_MENU_PENDING_DRAFT_KEY);
  act(() => root.unmount());
  root = createRoot(container);
  await renderEditor();
  await moveDown('section:recommended-screenshots');
  const newDraft = window.localStorage.getItem(CONTEXT_MENU_PENDING_DRAFT_KEY);
  expect(newDraft).not.toBe(oldDraft);
  await act(async () => finishOld?.());
  expect(window.localStorage.getItem(CONTEXT_MENU_PENDING_DRAFT_KEY)).toBe(newDraft);
  await settleDebounce();
  expect(update).toHaveBeenCalledTimes(3);
  act(() => root.unmount());
  root = createRoot(container);
  await renderEditor();
  expect(container.querySelector('[role="alert"]')?.textContent, container.textContent).toContain(
    'try again'
  );
  expect(window.localStorage.getItem(CONTEXT_MENU_PENDING_DRAFT_KEY)).toBe(newDraft);
});

it('serializes a newer edit after an in-flight write and keeps latest order', async () => {
  let finishFirst: (() => void) | undefined;
  update.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishFirst = resolve;
      })
  );
  await moveDown('section:recommended-screenshots');
  await settleDebounce();
  expect(update).toHaveBeenCalledTimes(1);
  await moveDown('section:recommended-video');
  await act(async () => finishFirst?.());
  await settleDebounce();
  expect(update).toHaveBeenCalledTimes(2);
  expect(update.mock.calls[0]?.[0].layout.nodes).not.toEqual(
    update.mock.calls[1]?.[0].layout.nodes
  );
  expect(container.textContent).toContain('Menu saved');
});

it('waits for stored settings and gives catalog insertion focus to the new tree item', async () => {
  act(() => root.unmount());
  root = createRoot(container);
  editorState = { ...editorState, contextMenuSettingsStatus: 'loading' };
  await renderEditor();
  expect(container.querySelector('[role="tree"]')).toBeNull();
  editorState = {
    ...editorState,
    contextMenuSettingsStatus: 'ready',
    contextMenu: {
      ...editorState.contextMenu,
      layout: {
        version: 2,
        nodes: [{ type: 'command', command: 'sniptale.settings', enabled: true }],
      },
    },
  };
  await renderEditor();
  const add = button('Add command: Library');
  await act(async () => add.click());
  expect(document.activeElement).toBe(
    container.querySelector('[data-tree-key="command:sniptale.gallery"]')
  );
  await settleDebounce();
  expect(update).toHaveBeenCalledTimes(1);
});

it('preserves all dynamic quick actions when an old menu is edited', async () => {
  editorState = {
    ...editorState,
    contextMenuQuickActions: Array.from({ length: 100 }, (_, index) => ({
      id: index === 0 ? 'a'.repeat(513) : `action-${index}`,
      status: true,
      name: `Action ${index}`,
      icon: 'camera',
      screenshotMode: 'visible' as const,
      exitAfterCapture: false,
    })),
  };
  await renderEditor();
  await moveDown('section:recommended-screenshots');
  await settleDebounce();
  const saved = update.mock.calls[0]?.[0].layout;
  const screenshots = saved.nodes.find(
    (node: { id?: string }) => node.id === 'recommended-screenshots'
  );
  expect(
    screenshots.children.filter((node: { command: string }) =>
      node.command.startsWith('sniptale.screenshots.quick-action.')
    )
  ).toHaveLength(100);
});

it('retries loading when saved settings are unavailable', async () => {
  editorState = { ...editorState, contextMenuSettingsStatus: 'failed' };
  await renderEditor();
  expect(container.querySelector('[role="tree"]')).toBeNull();
  await click('Retry loading');
  expect(retry).toHaveBeenCalledOnce();
});

it('protects page exit during delayed admission and journals before a failed unmount save', async () => {
  let admit!: () => void;
  const admission = new Promise<void>((resolve) => {
    admit = resolve;
  });
  installPersistenceLockManagerForTests({
    async request<T>(_name: string, _options: unknown, operation: () => T | Promise<T>) {
      await admission;
      return operation();
    },
  });
  update.mockRejectedValue(new Error('sync unavailable'));
  await moveDown('section:recommended-screenshots');
  const exit = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(exit);
  expect(exit.defaultPrevented).toBe(true);
  act(() => root.unmount());
  expect(update).not.toHaveBeenCalled();
  await act(async () => {
    admit();
    await admission;
  });
  expect(update).toHaveBeenCalledOnce();
  expect(window.localStorage.getItem(CONTEXT_MENU_PENDING_DRAFT_KEY)).not.toBeNull();
  const protectedExit = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(protectedExit);
  expect(protectedExit.defaultPrevented).toBe(false);
  root = createRoot(container);
  await renderEditor();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('try again');
});

it('does not auto-save or flush a draft refused during privacy erasure', async () => {
  installPersistenceLockManagerForTests({
    async request<T>(
      _name: string,
      _options: unknown,
      operation: (lock?: unknown) => T | Promise<T>
    ) {
      return operation(null);
    },
  });
  await moveDown('section:recommended-screenshots');
  await settleDebounce();
  act(() => root.unmount());
  await act(async () => {
    await Promise.resolve();
  });
  expect(update).not.toHaveBeenCalled();
  expect(window.localStorage.getItem(CONTEXT_MENU_PENDING_DRAFT_KEY)).toBeNull();
  root = createRoot(container);
});
